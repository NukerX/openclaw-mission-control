/**
 * Shared Gateway config helpers.
 *
 * Consolidates the duplicated `gatewayCallWithRetry`, `applyConfigPatchWithRetry`,
 * and `isGatewayTransientError` patterns that existed identically in
 * agents/route.ts and models-summary.ts.
 */

import { gatewayCall, isReadOnlyMode, ReadOnlyError } from "./openclaw";

// ── Helpers ──────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ── Transient error detection ────────────────────

export function isGatewayTransientError(error: unknown): boolean {
  const parts = [String(error || "")];
  if (isRecord(error)) {
    if (typeof error.message === "string") parts.push(error.message);
    if (typeof error.stderr === "string") parts.push(error.stderr);
  }
  const msg = parts.join(" ").toLowerCase();
  return (
    msg.includes("gateway closed") ||
    msg.includes("1006") ||
    msg.includes("gateway call failed") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("timed out")
  );
}

// ── Resilient RPC ────────────────────────────────

export async function gatewayCallWithRetry<T>(
  method: string,
  params?: Record<string, unknown>,
  timeout = 15000,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await gatewayCall<T>(method, params, timeout);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      const transient = isGatewayTransientError(error);
      const baseDelay = transient ? 300 : 150;
      await sleep(Math.min(baseDelay * attempt, transient ? 1200 : 600));
    }
  }
  throw lastError || new Error("Unknown gateway error");
}

// ── Config data types ────────────────────────────

export type ConfigData = {
  parsed: Record<string, unknown>;
  resolved: Record<string, unknown>;
  hash: string;
};

export type AgentEntry = {
  id: string;
  name?: string;
  model?: unknown;
  workspace?: string;
  identity?: Record<string, unknown>;
  subagents?: Record<string, unknown>;
  heartbeat?: unknown;
  default?: boolean;
  [key: string]: unknown;
};

export type BindingEntry = {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
  };
  [key: string]: unknown;
};

// ── Typed config.get wrapper ─────────────────────

export async function fetchConfig(timeout = 10000): Promise<ConfigData> {
  const raw = await gatewayCallWithRetry<Record<string, unknown>>(
    "config.get",
    undefined,
    timeout,
  );
  return {
    parsed: isRecord(raw.parsed) ? raw.parsed : {},
    resolved: isRecord(raw.resolved) ? raw.resolved : {},
    hash: String(raw.hash || ""),
  };
}

// ── Atomic config.patch with retry ───────────────

export async function patchConfig(
  patch: Record<string, unknown>,
  opts?: { maxAttempts?: number; restartDelayMs?: number },
): Promise<void> {
  if (isReadOnlyMode()) {
    throw new ReadOnlyError("config.patch");
  }
  const maxAttempts = opts?.maxAttempts ?? 8;
  const raw = JSON.stringify(patch);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const configData = await gatewayCall<Record<string, unknown>>(
        "config.get",
        undefined,
        6000,
      );
      const hash = String(configData.hash || "");
      if (!hash) {
        throw new Error("Missing config hash");
      }
      const patchParams: Record<string, unknown> = { raw, baseHash: hash };
      if (opts?.restartDelayMs) {
        patchParams.restartDelayMs = opts.restartDelayMs;
      }
      await gatewayCall("config.patch", patchParams, 15000);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(Math.min(400 * attempt, 2500));
    }
  }
  throw lastError || new Error("Unknown config.patch error");
}

// ── Config data extractors ───────────────────────

export function extractAgentsList(configData: ConfigData): AgentEntry[] {
  const agents = isRecord(configData.parsed.agents) ? configData.parsed.agents : {};
  const list = Array.isArray(agents.list) ? agents.list : [];
  return list.filter(isRecord).map((entry) => ({
    ...entry,
    id: String(entry.id || ""),
  })) as AgentEntry[];
}

export function extractBindings(configData: ConfigData): BindingEntry[] {
  const bindings = Array.isArray(configData.parsed.bindings)
    ? configData.parsed.bindings
    : [];
  return bindings.filter(isRecord).map((b) => {
    const match = isRecord(b.match) ? b.match : {};
    return {
      ...b,
      agentId: String(b.agentId || ""),
      match: {
        channel: String(match.channel || ""),
        accountId: typeof match.accountId === "string" ? match.accountId : undefined,
      },
    };
  }) as BindingEntry[];
}
