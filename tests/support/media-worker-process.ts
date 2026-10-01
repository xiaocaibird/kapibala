import Fastify from "fastify";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import {
  MediaFiles,
  mediaOptions,
} from "../../apps/server/src/modules/media-files/index.js";

const db = new Database(process.env.MEDIA_TEST_DATABASE_URL!);
const logger = Fastify({ logger: false });
const worker = new MediaFiles(
  {
    db,
    log: logger.log,
    gateway: new RemoteClient(process.env.MEDIA_TEST_GATEWAY_URL!),
    agent: new RemoteClient("http://unused.invalid"),
  },
  { ...mediaOptions(), directory: process.env.MEDIA_TEST_DIRECTORY! },
);
try {
  await worker.recover();
  await worker.tick();
} finally {
  worker.close();
  await logger.close();
  await db.close();
}
