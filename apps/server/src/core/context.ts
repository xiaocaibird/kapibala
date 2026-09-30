import type { FastifyBaseLogger } from 'fastify';
import type { Database } from './db.js';
import type { RemoteClient } from './remote.js';
export interface AppContext { db: Database; gateway: RemoteClient; agent: RemoteClient; log: FastifyBaseLogger; }
