import type { FastifyInstance } from "fastify";
import type { Queryable } from "./db.js";
import type { Message } from "../../../../packages/contracts/src/index.js";
export interface SendInput {
  groupId: string;
  accountId: string;
  text: string;
  clientMsgId?: string;
  source?: string;
  sourceRef?: string;
}
export interface MessagingService {
  enqueueSend(input: SendInput, tx?: Queryable): Promise<Message>;
  getMessage(clientMsgId: string): Promise<Message | null>;
  kick(input: {
    groupId: string;
    accountId: string;
    targetPlatformUserId: string;
  }): Promise<{ kicked: true }>;
}
export interface PlatformModule {
  register(app: FastifyInstance): Promise<void>;
  tick(): Promise<void>;
  recover?(): Promise<void>;
  close?(): Promise<void>;
}
