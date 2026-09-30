import "dotenv/config";
import { createApp } from "./app.js";
import { createGatewayModule } from "./modules/gateway/index.js";
import { createAutomationModule } from "./modules/automation/index.js";
const app = await createApp({
  modules: (ctx) => {
    const gateway = createGatewayModule(ctx);
    return [gateway, createAutomationModule(ctx, gateway)];
  },
});
await app.listen({ port: Number(process.env.PORT ?? 3100), host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
