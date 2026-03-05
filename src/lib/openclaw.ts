/**
 * Primary OpenClaw client — all server-side code should import from here.
 *
 * Routes every call through the unified OpenClawClient which selects the
 * best transport automatically (HTTP to Gateway when available, CLI
 * subprocess as fallback). Works on Mac, Linux, and Docker.
 *
 * Internal modules (transports, openclaw-cli.ts) should NOT be imported
 * directly from API routes or lib helpers.
 */

import { getClient } from "./openclaw-client";
import type { RunCliResult } from "./openclaw-cli";

export type { RunCliResult } from "./openclaw-cli";
export { parseJsonFromCliOutput } from "./openclaw-cli";

// ── Read-only mode ──────────────────────────────────
// Blocks config-mutating RPC methods (config.patch, config.apply) when
// OPENCLAW_READ_ONLY=true or AGENTBAY_HOSTED=true (hosted instances
// should never write gateway config from the dashboard).

const CONFIG_WRITE_METHODS = new Set(["config.patch", "config.apply"]);

export function isReadOnlyMode(): boolean {
  return (
    process.env.OPENCLAW_READ_ONLY === "true" ||
    process.env.AGENTBAY_HOSTED === "true"
  );
}

export class ReadOnlyError extends Error {
  readonly statusCode = 403;

  constructor(method: string) {
    super(
      `Gateway write blocked: ${method} is not allowed in read-only mode. ` +
      `Set OPENCLAW_READ_ONLY=false to enable config writes.`,
    );
    this.name = "ReadOnlyError";
  }
}

export function isReadOnlyError(error: unknown): error is ReadOnlyError {
  return error instanceof ReadOnlyError;
}

export async function runCli(
  args: string[],
  timeout = 15000,
  stdin?: string,
): Promise<string> {
  const client = await getClient();
  return client.run(args, timeout, stdin);
}

export async function runCliJson<T>(
  args: string[],
  timeout = 15000,
): Promise<T> {
  const client = await getClient();
  return client.runJson<T>(args, timeout);
}

export async function runCliCaptureBoth(
  args: string[],
  timeout = 15000,
): Promise<RunCliResult> {
  const client = await getClient();
  return client.runCapture(args, timeout);
}

export async function gatewayCall<T>(
  method: string,
  params?: Record<string, unknown>,
  timeout = 15000,
): Promise<T> {
  if (CONFIG_WRITE_METHODS.has(method) && isReadOnlyMode()) {
    throw new ReadOnlyError(method);
  }
  const client = await getClient();
  return client.gatewayRpc<T>(method, params, timeout);
}
