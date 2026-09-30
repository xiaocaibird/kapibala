import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../../core/context.js";
import { currentOperationSignal, emit } from "../../core/db.js";
import { AppError, RemoteError } from "../../core/errors.js";
import {
  type AccountRow,
  type GroupRow,
  type JobError,
  type JobRow,
  type JobState,
  isTerminal,
} from "./models.js";
import { changeAccount } from "./state.js";

const membersSchema = z.array(z.object({ platformUserId: z.string() }));
export class Jobs {
  constructor(private readonly ctx: AppContext) {}
  async createGroup(
    creatorAccountId: string,
    memberAccountIds: string[],
  ): Promise<{ jobId: string }> {
    return this.ctx.db.transaction(async (tx) => {
      const ids = [creatorAccountId, ...memberAccountIds];
      const accounts = (
        await tx.query<AccountRow>(
          "SELECT * FROM accounts WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE",
          [ids],
        )
      ).rows;
      if (
        accounts.length !== ids.length ||
        accounts.some((account) => account.status !== "online")
      )
        throw new AppError(422, "ACCOUNT_NOT_ONLINE", "所有账号必须在线");
      const jobId = randomUUID();
      await tx.query("INSERT INTO jobs(id,kind,state) VALUES($1,'create',$2)", [
        jobId,
        JSON.stringify({
          phase: "create",
          creatorAccountId,
          memberAccountIds,
          localGroupId: randomUUID(),
          index: 0,
        }),
      ]);
      return { jobId };
    });
  }
  async leaveAll(groupId: string): Promise<{ jobId: string }> {
    return this.ctx.db.transaction(async (tx) => {
      const group = (
        await tx.query<GroupRow>(
          "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
          [groupId],
        )
      ).rows[0];
      if (!group) throw new AppError(404, "GROUP_NOT_FOUND", "群不存在");
      const active = (
        await tx.query<{ id: string }>(
          "SELECT id FROM jobs WHERE kind='leave' AND group_id=$1 AND status='running'",
          [groupId],
        )
      ).rows[0];
      if (active) return { jobId: active.id };
      const members = (
        await tx.query<{ account_id: string }>(
          "SELECT account_id FROM members WHERE group_id=$1 AND account_id IS NOT NULL ORDER BY (account_id=$2),account_id",
          [groupId, group.creator_account_id],
        )
      ).rows;
      const jobId = randomUUID();
      await tx.query(
        "INSERT INTO jobs(id,kind,group_id,state) VALUES($1,'leave',$2,$3)",
        [
          jobId,
          groupId,
          JSON.stringify({
            phase: "leave",
            leavingIds: members.map((row) => row.account_id),
            index: 0,
          }),
        ],
      );
      return { jobId };
    });
  }
  async get(id: string) {
    const job = (
      await this.ctx.db.query<JobRow>("SELECT * FROM jobs WHERE id=$1", [id])
    ).rows[0];
    if (!job) throw new AppError(404, "JOB_NOT_FOUND", "任务不存在");
    return {
      id: job.id,
      status: job.errors.length ? ("failed" as const) : job.status,
      errors: job.errors,
      groupId: job.group_id,
      recoveryNote: job.state.recoveryNote ?? null,
      processing: job.status === "running",
    };
  }
  async advance(id: string): Promise<void> {
    await this.ctx.db.withLock(`job:${id}`, async () => {
      const job = (
        await this.ctx.db.query<JobRow>("SELECT * FROM jobs WHERE id=$1", [id])
      ).rows[0];
      if (
        !job ||
        job.status !== "running" ||
        job.state.recoveryNote ||
        (job.state.nextAt ?? 0) > Date.now()
      )
        return;
      if (job.kind === "create") await this.advanceCreate(job);
      else await this.advanceLeave(job);
    });
  }
  private async save(
    job: JobRow,
    state: JobState,
    errors = job.errors,
    status: JobRow["status"] = job.status,
  ): Promise<void> {
    await this.ctx.db.query(
      "UPDATE jobs SET state=$2,errors=$3,status=$4,updated_at=now() WHERE id=$1",
      [job.id, JSON.stringify(state), JSON.stringify(errors), status],
    );
  }
  private async fail(job: JobRow, step: string, code: string): Promise<void> {
    await this.save(job, job.state, [...job.errors, { step, code }], "failed");
  }
  private async uncertain(job: JobRow, message: string): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE jobs SET state=state || $2::jsonb,updated_at=now() WHERE id=$1",
        [job.id, JSON.stringify({ recoveryNote: message })],
      );
      await emit(tx, "inconsistency", {
        kind: "job_result_unknown",
        ref: job.id,
        message,
      });
    });
  }
  private async group(job: JobRow): Promise<GroupRow> {
    return (
      await this.ctx.db.query<GroupRow>("SELECT * FROM groups WHERE id=$1", [
        job.group_id,
      ])
    ).rows[0]!;
  }
  private async advanceCreate(job: JobRow): Promise<void> {
    const state = job.state;
    if (state.phase === "create_dispatch") {
      await this.uncertain(
        job,
        "建群请求已开始但没有保存结果；网关没有查询本次创建结果的接口，不自动重新建群。",
      );
      return;
    }
    if (state.phase === "create") {
      await this.save(job, { ...state, phase: "create_dispatch" });
      try {
        const result = z
          .object({ groupId: z.string().min(1) })
          .parse(
            await this.ctx.gateway.request("/groups", {
              creatorAccountId: state.creatorAccountId,
            }),
          );
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES($1,$2,$3)",
            [state.localGroupId, result.groupId, state.creatorAccountId],
          );
          const creator = (
            await tx.query<AccountRow>(
              "SELECT * FROM accounts WHERE id=$1 FOR SHARE",
              [state.creatorAccountId],
            )
          ).rows[0]!;
          // The gateway deliberately emits no member_joined for the creator.
          if (!isTerminal(creator.status))
            await tx.query(
              "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,$2,$3,'creator')",
              [state.localGroupId, creator.id, creator.platform_user_id],
            );
          await tx.query(
            "UPDATE jobs SET group_id=$2,state=$3,updated_at=now() WHERE id=$1",
            [
              job.id,
              state.localGroupId,
              JSON.stringify({ ...state, phase: "invite" }),
            ],
          );
          await emit(tx, "group_changed", { groupId: state.localGroupId });
        });
      } catch (error) {
        await this.remoteFailure(
          job,
          "create",
          error,
          state.creatorAccountId,
          "create",
        );
      }
      return;
    }
    const group = await this.group(job);
    if (state.phase === "invite") {
      try {
        const invite = z
          .object({
            inviteLink: z.string().min(1),
            readyAfterMs: z.number().nonnegative(),
          })
          .parse(
            await this.ctx.gateway.request(
              `/groups/${encodeURIComponent(group.gateway_group_id)}/invite`,
              {},
            ),
          );
        await this.save(job, {
          ...state,
          phase: "join",
          inviteLink: invite.inviteLink,
          readyAt: Date.now() + invite.readyAfterMs,
          nextAt: Date.now() + invite.readyAfterMs,
        });
      } catch (error) {
        await this.remoteFailure(job, "invite", error, undefined, "invite");
      }
      return;
    }
    const index = state.index ?? 0;
    const accountId = state.memberAccountIds![index];
    if (state.phase === "join" && accountId) {
      const joining = {
        ...state,
        phase: "join_wait",
        joinStartedAt: Date.now(),
      };
      await this.save(job, joining);
      try {
        z.object({ accepted: z.literal(true) }).parse(
          await this.ctx.gateway.request(
            `/groups/${encodeURIComponent(group.gateway_group_id)}/join`,
            { accountId, inviteLink: state.inviteLink },
          ),
        );
      } catch (error) {
        if (error instanceof RemoteError && error.code === "INVITE_NOT_READY")
          await this.save(job, {
            ...state,
            phase: "join",
            nextAt: Math.max(Date.now() + 250, state.readyAt ?? 0),
          });
        else if (
          error instanceof RemoteError &&
          error.code === "INVITE_EXPIRED" &&
          (state.inviteRetries ?? 0) < 1
        )
          await this.save(job, {
            ...state,
            phase: "invite",
            inviteRetries: (state.inviteRetries ?? 0) + 1,
          });
        else if (
          error instanceof RemoteError &&
          error.code === "ALREADY_MEMBER"
        ) {
          await this.ctx.db.transaction(async (tx) => {
            const currentGroup = (
              await tx.query<GroupRow>(
                "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
                [group.id],
              )
            ).rows[0]!;
            const account = (
              await tx.query<AccountRow>(
                "SELECT * FROM accounts WHERE id=$1 FOR SHARE",
                [accountId],
              )
            ).rows[0]!;
            if (currentGroup.status === "left" || isTerminal(account.status))
              return;
            const members = membersSchema.parse(
              await this.ctx.gateway.request(
                `/groups/${encodeURIComponent(currentGroup.gateway_group_id)}/members`,
              ),
            );
            if (
              members.some(
                (member) => member.platformUserId === account.platform_user_id,
              )
            )
              await tx.query(
                "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES($1,$2,$3,'member') ON CONFLICT DO NOTHING",
                [group.id, accountId, account.platform_user_id],
              );
          });
        } else
          await this.remoteFailure(
            { ...job, state: joining },
            `join:${accountId}`,
            error,
            accountId,
            "join",
          );
      }
      return;
    }
    if (state.phase === "join_wait" && accountId) {
      if (
        (
          await this.ctx.db.query(
            "SELECT 1 FROM members WHERE group_id=$1 AND account_id=$2",
            [group.id, accountId],
          )
        ).rowCount
      ) {
        await this.save(job, {
          ...state,
          phase:
            index + 1 >= state.memberAccountIds!.length ? "promote" : "join",
          index: index + 1,
          joinStartedAt: undefined,
          inviteRetries: 0,
        });
      } else if (Date.now() - (state.joinStartedAt ?? Date.now()) > 10000)
        await this.fail(job, `join:${accountId}`, "JOIN_TIMEOUT");
      return;
    }
    if (state.phase === "promote" || state.phase === "promote_dispatch") {
      const attempts = state.promoteAttempts ?? 0;
      if (attempts >= 2) {
        await this.uncertain(
          job,
          "提升管理员已请求两次但未确认结果，禁止继续调用以避免超过协议上限。",
        );
        return;
      }
      const promoting = {
        ...state,
        phase: "promote_dispatch",
        promoteAttempts: attempts + 1,
      };
      await this.save(job, promoting);
      try {
        await this.ctx.gateway.request(
          `/groups/${encodeURIComponent(group.gateway_group_id)}/promote`,
          {
            byAccountId: state.creatorAccountId,
            accountId: state.memberAccountIds![0],
          },
        );
        await this.ctx.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE members SET role='admin' WHERE group_id=$1 AND account_id=$2",
            [group.id, state.memberAccountIds![0]],
          );
          await tx.query(
            "UPDATE jobs SET status='finished',state=$2,updated_at=now() WHERE id=$1",
            [job.id, JSON.stringify({ ...promoting, phase: "done" })],
          );
          await emit(tx, "group_changed", { groupId: group.id });
        });
      } catch (error) {
        if (
          error instanceof RemoteError &&
          error.code === "NOT_MEMBER_YET" &&
          attempts === 0
        )
          await this.save(job, {
            ...promoting,
            phase: "promote",
            nextAt: Date.now() + 250,
          });
        else
          await this.remoteFailure(
            { ...job, state: promoting },
            "promote",
            error,
            state.creatorAccountId,
          );
      }
    }
  }
  private async advanceLeave(job: JobRow): Promise<void> {
    const group = await this.group(job);
    const state = job.state;
    const index = state.index ?? 0;
    const accountId = state.leavingIds?.[index];
    if (!accountId) {
      await this.ctx.db.transaction(async (tx) => {
        await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [
          group.id,
        ]);
        const gatewayMembers = membersSchema.parse(
          await this.ctx.gateway.request(
            `/groups/${encodeURIComponent(group.gateway_group_id)}/members`,
          ),
        );
        const remainingServiceAccounts = (
          await tx.query<{ id: string }>(
            "SELECT id FROM accounts WHERE platform_user_id=ANY($1::text[])",
            [gatewayMembers.map((member) => member.platformUserId)],
          )
        ).rows;
        const completionErrors = [
          ...job.errors,
          ...remainingServiceAccounts.map((account) => ({
            step: `leave:${account.id}`,
            code: "MEMBER_STILL_PRESENT",
          })),
        ];
        if (!completionErrors.length) {
          await tx.query("DELETE FROM members WHERE group_id=$1", [group.id]);
          await tx.query("UPDATE groups SET status='left' WHERE id=$1", [
            group.id,
          ]);
          await tx.query(
            "UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1 AND status='running'",
            [group.id],
          );
        }
        await tx.query(
          "UPDATE jobs SET status=$2,state=$3,errors=$4,updated_at=now() WHERE id=$1",
          [
            job.id,
            completionErrors.length ? "failed" : "finished",
            JSON.stringify({
              ...state,
              phase: "done",
              gatewayMembersAtCompletion: gatewayMembers,
            }),
            JSON.stringify(completionErrors),
          ],
        );
        await emit(tx, "group_changed", {
          groupId: group.id,
          status: completionErrors.length ? group.status : "left",
        });
      });
      return;
    }
    if (accountId === group.creator_account_id && job.errors.length) {
      await this.save(job, state, job.errors, "failed");
      return;
    }
    if (state.phase === "leave_dispatch") {
      const members = membersSchema.parse(
        await this.ctx.gateway.request(
          `/groups/${encodeURIComponent(group.gateway_group_id)}/members`,
        ),
      );
      const account = (
        await this.ctx.db.query<AccountRow>(
          "SELECT * FROM accounts WHERE id=$1",
          [accountId],
        )
      ).rows[0]!;
      if (
        !members.some(
          (member) => member.platformUserId === account.platform_user_id,
        )
      ) {
        await this.afterLeave(job, accountId);
        return;
      }
      await this.uncertain(
        job,
        `账号 ${accountId} 退出请求的结果未保存，当前仍为成员；不自动重放不确定的退出操作。`,
      );
      return;
    }
    await this.save(job, { ...state, phase: "leave_dispatch" });
    try {
      await this.ctx.gateway.request(
        `/groups/${encodeURIComponent(group.gateway_group_id)}/leave`,
        { accountId },
      );
      await this.afterLeave(job, accountId);
    } catch (error) {
      if (error instanceof RemoteError) {
        const errors: JobError[] = [
          ...job.errors,
          { step: `leave:${accountId}`, code: error.code },
        ];
        if (
          error.code === "ACCOUNT_SUSPENDED" ||
          error.code === "SESSION_EXPIRED"
        )
          await this.ctx.db.transaction((tx) =>
            changeAccount(
              tx,
              accountId,
              error.code === "ACCOUNT_SUSPENDED"
                ? "suspended"
                : "session_expired",
            ),
          );
        await this.save(
          job,
          { ...state, phase: "leave", index: index + 1 },
          errors,
        );
      } else
        await this.uncertain(
          job,
          `账号 ${accountId} 的退出响应未知；等待核验，不自动重试。`,
        );
    }
  }
  private async afterLeave(job: JobRow, accountId: string): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      const group = (
        await tx.query<GroupRow>(
          "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
          [job.group_id],
        )
      ).rows[0]!;
      const account = (
        await tx.query<AccountRow>(
          "SELECT * FROM accounts WHERE id=$1 FOR SHARE",
          [accountId],
        )
      ).rows[0]!;
      const errors = [...job.errors];
      let members: { platformUserId: string }[] | undefined;
      try {
        members = membersSchema.parse(
          await this.ctx.gateway.request(
            `/groups/${encodeURIComponent(group.gateway_group_id)}/members`,
          ),
        );
      } catch (error) {
        currentOperationSignal()?.throwIfAborted();
        errors.push({
          step: `leave:${accountId}`,
          code: "MEMBERS_REFRESH_FAILED",
        });
        this.ctx.log.warn(
          { err: error, groupId: group.id },
          "已确认退出操作，当前成员列表刷新失败",
        );
        await emit(tx, "inconsistency", {
          kind: "membership_refresh_failed",
          groupId: group.id,
          platformUserId: account.platform_user_id,
          operation: "leave",
          operationConfirmed: true,
          message:
            "退出操作已确认，当前成员列表暂无法刷新；保留本地状态并阻止群主退出，等待成员事件重试或重放。",
        });
      }
      if (
        members?.some(
          (member) => member.platformUserId === account.platform_user_id,
        )
      )
        errors.push({
          step: `leave:${accountId}`,
          code: "MEMBER_STILL_PRESENT",
        });
      else if (members)
        await tx.query(
          "DELETE FROM members WHERE group_id=$1 AND account_id=$2",
          [job.group_id, accountId],
        );
      await tx.query(
        "UPDATE jobs SET state=$2,errors=$3,updated_at=now() WHERE id=$1",
        [
          job.id,
          JSON.stringify({
            ...job.state,
            phase: "leave",
            index: (job.state.index ?? 0) + 1,
          }),
          JSON.stringify(errors),
        ],
      );
      await emit(tx, "group_changed", { groupId: job.group_id });
    });
  }
  private async remoteFailure(
    job: JobRow,
    step: string,
    error: unknown,
    accountId?: string,
    safeRetryPhase?: string,
  ): Promise<void> {
    if (
      error instanceof RemoteError &&
      error.status === 503 &&
      safeRetryPhase
    ) {
      await this.save(job, {
        ...job.state,
        phase: safeRetryPhase,
        nextAt: Date.now() + 500,
      });
      return;
    }
    if (error instanceof RemoteError && error.status < 500) {
      if (
        accountId &&
        (error.code === "ACCOUNT_SUSPENDED" || error.code === "SESSION_EXPIRED")
      )
        await this.ctx.db.transaction((tx) =>
          changeAccount(
            tx,
            accountId,
            error.code === "ACCOUNT_SUSPENDED"
              ? "suspended"
              : "session_expired",
          ),
        );
      await this.fail(job, step, error.code);
    } else
      await this.uncertain(
        job,
        `${step} 的远端结果或本地落库结果未知，需要核验后恢复。`,
      );
  }
}
