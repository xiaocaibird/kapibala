import { z } from "zod";
import type { AppContext } from "../../core/context.js";
import { emit } from "../../core/db.js";
import { AppError, RemoteError } from "../../core/errors.js";
import type { AccountStatus } from "../../../../../packages/contracts/src/index.js";
import {
  accountDto,
  type AccountRow,
  isTerminal,
  transitions,
} from "./models.js";
import { changeAccount } from "./state.js";

export const accountStatusSchema = z.enum([
  "idle",
  "online",
  "rate_limited",
  "disconnected",
  "suspended",
  "session_expired",
]);
export class Accounts {
  constructor(private readonly ctx: AppContext) {}
  async list() {
    return (
      await this.ctx.db.query<AccountRow>("SELECT * FROM accounts ORDER BY id")
    ).rows.map(accountDto);
  }
  async connect(id: string) {
    let remoteSucceeded = false;
    try {
      return await this.ctx.db.transaction(async (tx) => {
        const row = (
          await tx.query<AccountRow>(
            "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!row) throw new AppError(404, "ACCOUNT_NOT_FOUND", "账号不存在");
        if (row.status !== "idle" && row.status !== "disconnected")
          throw new AppError(409, "ILLEGAL_TRANSITION", "当前状态不能重连");
        const result = await this.ctx.gateway.request(
          `/accounts/${encodeURIComponent(id)}/connect`,
          {},
        );
        remoteSucceeded = true;
        const response = z
          .object({ platformUserId: z.string().min(1) })
          .parse(result);
        await tx.query("UPDATE accounts SET platform_user_id=$2 WHERE id=$1", [
          id,
          response.platformUserId,
        ]);
        return accountDto(await changeAccount(tx, id, "online", row.status));
      });
    } catch (error) {
      if (remoteSucceeded)
        await this.reportUnconfirmedSave(id, "connect", error);
      await this.handleTerminal(id, error);
      throw error;
    }
  }
  async transition(id: string, to: AccountStatus, expectedFrom: AccountStatus) {
    let remoteSucceeded: "connect" | "disconnect" | undefined;
    try {
      return await this.ctx.db.transaction(async (tx) => {
        const account = (
          await tx.query<AccountRow>(
            "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!account)
          throw new AppError(404, "ACCOUNT_NOT_FOUND", "账号不存在");
        if (!transitions[expectedFrom].includes(to))
          throw new AppError(409, "ILLEGAL_TRANSITION", "不允许此状态转移");
        if (account.status !== expectedFrom)
          throw new AppError(409, "CAS_CONFLICT", "账号状态已经变化");
        if (to === "idle" || to === "disconnected") {
          await this.ctx.gateway.request(
            `/accounts/${encodeURIComponent(id)}/disconnect`,
            {},
          );
          remoteSucceeded = "disconnect";
        }
        if (to === "online" && !isTerminal(account.status)) {
          const result = await this.ctx.gateway.request(
            `/accounts/${encodeURIComponent(id)}/connect`,
            {},
          );
          remoteSucceeded = "connect";
          const response = z
            .object({ platformUserId: z.string().min(1) })
            .parse(result);
          await tx.query(
            "UPDATE accounts SET platform_user_id=$2 WHERE id=$1",
            [id, response.platformUserId],
          );
        }
        return {
          status: (await changeAccount(tx, id, to, expectedFrom)).status,
        };
      });
    } catch (error) {
      if (remoteSucceeded)
        await this.reportUnconfirmedSave(id, remoteSucceeded, error);
      await this.handleTerminal(id, error);
      throw error;
    }
  }
  private async reportUnconfirmedSave(
    id: string,
    action: "connect" | "disconnect",
    error: unknown,
  ): Promise<void> {
    const message = `网关 ${action} 已返回成功，但本地账号状态保存未确认；请核验远端与本地状态后再操作。`;
    this.ctx.log.error({ err: error, accountId: id, action }, message);
    try {
      await this.ctx.db.transaction((tx) =>
        emit(tx, "inconsistency", {
          kind: "account_result_unknown",
          ref: id,
          message,
        }),
      );
    } catch (reportError) {
      // Preserve the original operation error if the database cannot save the
      // warning either. A process crash still needs a durable operation protocol.
      this.ctx.log.error(
        { err: reportError, accountId: id, action },
        "账号一致性提示未能持久化，原始操作失败仍返回调用方",
      );
    }
  }
  async releaseRateLimits(): Promise<void> {
    const rows = (
      await this.ctx.db.query<AccountRow>(
        "SELECT * FROM accounts WHERE status='rate_limited' AND rate_limited_until<=now() ORDER BY id",
      )
    ).rows;
    for (const account of rows)
      await this.ctx.db.transaction(async (tx) => {
        const current = (
          await tx.query<AccountRow>(
            "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
            [account.id],
          )
        ).rows[0];
        if (
          current?.status === "rate_limited" &&
          current.rate_limited_until &&
          current.rate_limited_until.getTime() <= Date.now()
        )
          await changeAccount(tx, account.id, "online");
      });
  }
  private async handleTerminal(id: string, error: unknown): Promise<void> {
    if (!(error instanceof RemoteError)) return;
    if (error.code === "ACCOUNT_SUSPENDED" || error.code === "SESSION_EXPIRED")
      await this.ctx.db.transaction((tx) =>
        changeAccount(
          tx,
          id,
          error.code === "ACCOUNT_SUSPENDED" ? "suspended" : "session_expired",
        ),
      );
  }
}
