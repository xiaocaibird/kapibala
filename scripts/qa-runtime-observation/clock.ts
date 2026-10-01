import { randomUUID } from "node:crypto";

// Unique to this actual Node process, shared by both engineering observers.
export const clockDomain = `process-performance:${process.pid}:${randomUUID()}`;
export const clockFields = () => {
  const at = performance.now();
  return {
    clockDomain,
    clockUnit: "ms",
    monotonicMs: [at, at],
    applicationPid: process.pid,
  };
};
