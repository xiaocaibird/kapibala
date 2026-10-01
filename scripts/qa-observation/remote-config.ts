/** Explicit engineering entries cannot silently fall back to demo remotes. */
export function requireObservationRemotes(): void {
  for (const name of ["GATEWAY_URL", "AGENT_URL"] as const) {
    const value = process.env[name];
    if (!value)
      throw new Error(`Explicit ${name} required for isolated observation`);
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
      throw new Error(`Invalid ${name} for isolated observation`);
  }
}
