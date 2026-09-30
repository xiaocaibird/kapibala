import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  GroupDirectoryItem,
  GroupDirectoryPage,
} from "../../../../../packages/contracts/src/index.js";
import type { AppContext } from "../../core/context.js";
import { AppError } from "../../core/errors.js";

const pageSizeSchema = z.number().int().min(1).max(50);
const orderSchema = z.enum(["asc", "desc"]);
const querySchema = z
  .object({
    pageSize: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .default("20")
      .transform(Number)
      .pipe(pageSizeSchema),
    order: orderSchema.default("desc"),
    q: z
      .string()
      .trim()
      .max(500)
      .refine((value) => !value.includes("\0"))
      .default(""),
    cursor: z.string().max(16384).optional(),
  })
  .strict();

function isMicrosecondTimestamp(value: string): boolean {
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(
      value,
    )
  )
    return false;
  if (value.startsWith("0000")) return false;
  const millisecondValue = `${value.slice(0, 23)}Z`;
  const date = new Date(millisecondValue);
  return (
    Number.isFinite(date.getTime()) && date.toISOString() === millisecondValue
  );
}

const cursorSchema = z
  .object({
    v: z.literal(1),
    createdAt: z.string().refine(isMicrosecondTimestamp),
    id: z
      .string()
      .min(1)
      .refine((value) => !value.includes("\0")),
    q: z
      .string()
      .max(500)
      .refine((value) => value === value.trim() && !value.includes("\0")),
    order: orderSchema,
    pageSize: pageSizeSchema,
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
type DirectoryQuery = z.infer<typeof querySchema>;

function invalidQuery(): AppError {
  return new AppError(400, "VALIDATION_ERROR", "群列表参数或游标无效");
}

function readCursor(query: DirectoryQuery): Cursor | undefined {
  if (!query.cursor) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw invalidQuery();
    const bytes = Buffer.from(query.cursor, "base64url");
    const json = bytes.toString("utf8");
    if (
      bytes.toString("base64url") !== query.cursor ||
      !Buffer.from(json, "utf8").equals(bytes)
    )
      throw invalidQuery();
    const cursor = cursorSchema.parse(JSON.parse(json) as unknown);
    if (
      cursor.q !== query.q ||
      cursor.order !== query.order ||
      cursor.pageSize !== query.pageSize
    )
      throw invalidQuery();
    // This is a validated navigation boundary, not a signed capability or a snapshot.
    // Authentication remains mandatory even when a caller constructs a valid cursor.
    return cursor;
  } catch {
    throw invalidQuery();
  }
}

interface DirectoryRow {
  id: string;
  name: string | null;
  description: string | null;
  created_at: Date;
  cursor_created_at: string;
  gateway_group_id: string;
  status: GroupDirectoryItem["status"];
  agent_enabled: boolean;
  member_count: number;
  active_agent_run_id: string | null;
  active_sequence_run_id: string | null;
}

export function registerGroupDirectory(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get(
    "/api/group-directory",
    async (request): Promise<GroupDirectoryPage> => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) throw invalidQuery();
      const query = parsed.data;
      const cursor = readCursor(query);
      const values: unknown[] = [];
      const where: string[] = [];
      if (query.q) {
        // LIKE metacharacters are literal search text, including backslash itself.
        values.push(`%${query.q.replace(/[\\%_]/g, "\\$&")}%`);
        where.push(
          `(g.name ILIKE $1 ESCAPE '\\' OR g.description ILIKE $1 ESCAPE '\\' OR g.gateway_group_id ILIKE $1 ESCAPE '\\' OR g.id ILIKE $1 ESCAPE '\\')`,
        );
      }
      if (cursor) {
        const timestampParameter = values.push(cursor.createdAt);
        const idParameter = values.push(cursor.id);
        const comparison = query.order === "asc" ? ">" : "<";
        where.push(
          `(g.created_at ${comparison} $${timestampParameter}::timestamptz OR (g.created_at = $${timestampParameter}::timestamptz AND g.id > $${idParameter}))`,
        );
      }
      const limitParameter = values.push(query.pageSize + 1);
      // Direction is selected from a validated enum; every user value is parameterized.
      // Materialize the bounded page before aggregating members or joining active runs.
      const rows = (
        await ctx.db.query<DirectoryRow>(
          `WITH page AS MATERIALIZED (
          SELECT g.id,g.name,g.description,g.created_at,g.gateway_group_id,g.status,g.agent_enabled,
            to_char(g.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
          FROM groups g ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY g.created_at ${query.order},g.id ASC LIMIT $${limitParameter}
        ), member_counts AS (
          SELECT m.group_id,count(*)::integer AS member_count FROM members m
          JOIN page p ON p.id=m.group_id GROUP BY m.group_id
        )
        SELECT p.*,COALESCE(mc.member_count,0) AS member_count,
          a.id AS active_agent_run_id,s.id AS active_sequence_run_id
        FROM page p LEFT JOIN member_counts mc ON mc.group_id=p.id
        LEFT JOIN agent_runs a ON a.group_id=p.id AND a.status='running'
        LEFT JOIN sequence_runs s ON s.group_id=p.id AND s.status='running'
        ORDER BY p.created_at ${query.order},p.id ASC`,
          values,
        )
      ).rows;
      const visible = rows.slice(0, query.pageSize);
      const last = visible.at(-1);
      const nextCursor =
        rows.length > query.pageSize && last
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                createdAt: last.cursor_created_at,
                id: last.id,
                q: query.q,
                order: query.order,
                pageSize: query.pageSize,
              } satisfies Cursor),
            ).toString("base64url")
          : null;
      return {
        items: visible.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          createdAt: row.created_at.toISOString(),
          gatewayGroupId: row.gateway_group_id,
          status: row.status,
          agentEnabled: row.agent_enabled,
          memberCount: row.member_count,
          activeAgentRunId: row.active_agent_run_id,
          activeSequenceRunId: row.active_sequence_run_id,
        })),
        nextCursor,
      };
    },
  );
}
