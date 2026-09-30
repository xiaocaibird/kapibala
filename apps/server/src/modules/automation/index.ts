import type { AppContext } from "../../core/context.js";
import type { MessagingService, PlatformModule } from "../../core/messaging.js";
import { AgentModule } from "./agent.js";
import { SequenceModule } from "./sequences.js";

export function createAutomationModule(
  ctx: AppContext,
  messaging: MessagingService,
): PlatformModule {
  const agent = new AgentModule(ctx, messaging);
  const sequences = new SequenceModule(ctx, messaging);
  return {
    async register(app) {
      await agent.register(app);
      await sequences.register(app);
    },
    async recover() {
      await agent.recover();
      await sequences.recover();
    },
    async tick() {
      await agent.tick();
      await sequences.tick();
    },
    async close() {
      await agent.close();
      await sequences.close();
    },
  };
}
