"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Key,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionBody, SectionHeader, SectionLayout } from "@/components/section-layout";
import { useSmartPoll } from "@/hooks/use-smart-poll";
import { getFriendlyModelName } from "@/lib/model-metadata";

/* ── Provider metadata ──────────────────────────── */

type Provider = {
  id: string;
  name: string;
  hint: string;
  keyPrefix: string;
  url: string;
};

const PROVIDERS: Provider[] = [
  { id: "anthropic", name: "Anthropic", hint: "Claude models", keyPrefix: "sk-ant-", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "OpenAI", hint: "GPT & o-series", keyPrefix: "sk-", url: "https://platform.openai.com/api-keys" },
  { id: "google", name: "Google", hint: "Gemini models", keyPrefix: "AIza", url: "https://aistudio.google.com/apikey" },
  { id: "openrouter", name: "OpenRouter", hint: "200+ models", keyPrefix: "sk-or-", url: "https://openrouter.ai/keys" },
  { id: "groq", name: "Groq", hint: "Fast inference", keyPrefix: "gsk_", url: "https://console.groq.com/keys" },
  { id: "xai", name: "xAI", hint: "Grok models", keyPrefix: "xai-", url: "https://console.x.ai/" },
  { id: "mistral", name: "Mistral", hint: "Mistral models", keyPrefix: "", url: "https://console.mistral.ai/api-keys/" },
];

function findProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/* ── Types ──────────────────────────────────────── */

type SummaryResponse = {
  defaults: { primary: string; fallbacks: string[] } | null;
  configuredProviders: string[];
  status: {
    auth: {
      providers: Array<{ provider: string; effective: { kind: string; detail: string } | null }>;
    };
  };
};

type ModelItem = { id: string; name: string };

type WizardStep = "pick" | "key" | "validating" | "pick-model" | "done";

type WizardState = {
  step: WizardStep;
  providerId: string | null;
  apiKey: string;
  error: string | null;
  models: ModelItem[];
  loadingModels: boolean;
};

/* ── Shared atoms ────────────────────────────────── */

function StatusDot({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5 shrink-0", className)}>
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          active ? "bg-emerald-400" : "bg-[#3d4752]"
        )}
      />
    </span>
  );
}

function ProviderAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#2c343d] bg-[#20252a] text-sm font-bold text-[#a8b0ba]">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ── Model list (shared between wizard + picker modal) ── */

function ModelList({
  models,
  loading,
  currentModel,
  onSelect,
}: {
  models: ModelItem[];
  loading: boolean;
  currentModel: string | null;
  onSelect: (id: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? models.filter((m) => {
        const q = query.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          getFriendlyModelName(m.id).toLowerCase().includes(q)
        );
      })
    : models;

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-14">
        <Loader2 className="h-6 w-6 animate-spin text-[#34d399]" />
        <p className="text-xs text-[#7a8591]">Loading available models...</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <AlertCircle className="h-8 w-8 text-[#3d4752]" />
        <p className="text-sm text-[#a8b0ba]">No models found</p>
        <p className="text-xs text-[#7a8591]">The provider may not have returned a model list.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="sticky top-0 border-b border-[#2c343d] bg-[#171a1d] px-5 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#3d4752]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full rounded-lg border border-[#2c343d] bg-[#15191d] py-2 pl-9 pr-3 text-sm text-[#f5f7fa] placeholder-[#3d4752] focus:border-[#34d399]/40 focus:outline-none focus:ring-2 focus:ring-[#34d399]/20"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-[#7a8591]">
          {filtered.length} model{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* List */}
      <div className="max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#7a8591]">No models match your search</p>
        ) : (
          <div className="p-2">
            {filtered.map((m) => {
              const friendlyName = getFriendlyModelName(m.id);
              const displayName = friendlyName !== m.id ? friendlyName : (m.name || m.id);
              const isActive = m.id === currentModel;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void onSelect(m.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-[#34d399]/10"
                      : "hover:bg-[#20252a]"
                  )}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {isActive ? (
                      <Check className="h-4 w-4 text-[#34d399]" strokeWidth={2.5} />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-[#3d4752] transition-colors group-hover:bg-[#7a8591]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-medium",
                        isActive ? "text-[#34d399]" : "text-[#f5f7fa]"
                      )}
                    >
                      {displayName}
                    </span>
                    {displayName !== m.id && (
                      <span className="block truncate font-mono text-[11px] text-[#7a8591]">
                        {m.id}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add Provider Wizard ─────────────────────────── */

function AddProviderWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [wizard, setWizard] = useState<WizardState>({
    step: "pick",
    providerId: null,
    apiKey: "",
    error: null,
    models: [],
    loadingModels: false,
  });

  const keyInputRef = useRef<HTMLInputElement>(null);
  const provider = wizard.providerId ? findProvider(wizard.providerId) : null;

  const stepTitle: Record<WizardStep, string> = {
    pick: "Add an AI provider",
    key: "Enter your API key",
    validating: "Validating key...",
    "pick-model": "Choose your model",
    done: "All set!",
  };

  function pickProvider(id: string) {
    setWizard((s) => ({ ...s, step: "key", providerId: id, apiKey: "", error: null }));
    setTimeout(() => keyInputRef.current?.focus(), 80);
  }

  function goBack() {
    if (wizard.step === "validating") return;
    setWizard((s) => ({
      ...s,
      step: "pick",
      providerId: null,
      apiKey: "",
      error: null,
      models: [],
    }));
  }

  async function handleValidate() {
    if (!wizard.providerId || !wizard.apiKey.trim()) {
      setWizard((s) => ({ ...s, error: "Please paste your API key before continuing." }));
      return;
    }

    setWizard((s) => ({ ...s, step: "validating", error: null }));

    try {
      const saveRes = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auth-provider",
          provider: wizard.providerId,
          token: wizard.apiKey.trim(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      const saveData = await saveRes.json();

      if (!saveData.ok) {
        setWizard((s) => ({
          ...s,
          step: "key",
          error:
            saveData.error ??
            "API key validation failed. Double-check you copied it correctly.",
        }));
        return;
      }

      // Fetch available models
      setWizard((s) => ({ ...s, step: "pick-model", loadingModels: true, models: [] }));

      const modelsRes = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-models", provider: wizard.providerId }),
        signal: AbortSignal.timeout(10000),
      });
      const modelsData = await modelsRes.json();

      setWizard((s) => ({
        ...s,
        models: modelsData.ok ? (modelsData.models ?? []) : [],
        loadingModels: false,
        error: null,
      }));
    } catch {
      setWizard((s) => ({
        ...s,
        step: "key",
        error: "Network error or request timed out. Check your connection and try again.",
        loadingModels: false,
      }));
    }
  }

  async function handleSetModel(modelId: string) {
    try {
      await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-primary", model: modelId }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Provider is already saved — model can be changed later
    }
    setWizard((s) => ({ ...s, step: "done" }));
    onDone();
  }

  const canGoBack =
    wizard.step === "key" || wizard.step === "pick-model" || wizard.step === "done";

  return (
    <div className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="animate-modal-in mx-0 flex w-full max-w-lg flex-col rounded-t-2xl border border-[#2c343d] bg-[#171a1d] shadow-2xl sm:mx-4 sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#2c343d] px-5 py-4">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              disabled={wizard.step === "validating"}
              aria-label="Go back"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#a8b0ba] transition-colors hover:bg-[#20252a] hover:text-[#f5f7fa] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[#f5f7fa]">{stepTitle[wizard.step]}</h2>
            {wizard.step === "pick" && (
              <p className="mt-0.5 text-xs text-[#7a8591]">
                Connect an AI provider to power your assistant
              </p>
            )}
            {wizard.step === "key" && provider && (
              <p className="mt-0.5 text-xs text-[#7a8591]">
                Paste your {provider.name} API key below
              </p>
            )}
            {wizard.step === "pick-model" && (
              <p className="mt-0.5 text-xs text-[#7a8591]">
                Select which model your assistant will use
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#7a8591] transition-colors hover:bg-[#20252a] hover:text-[#f5f7fa]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Step: pick provider */}
          {wizard.step === "pick" && (
            <div className="grid grid-cols-1 gap-3 p-5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProvider(p.id)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-[#2c343d] bg-[#15191d] p-4 text-left transition-all hover:border-[#3d4752] hover:bg-[#1d2227] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399]/30"
                >
                  <ProviderAvatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-[#f5f7fa]">{p.name}</span>
                    <p className="mt-0.5 text-xs text-[#7a8591]">{p.hint}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#3d4752] transition-colors group-hover:text-[#7a8591]" />
                </button>
              ))}
            </div>
          )}

          {/* Step: enter API key */}
          {wizard.step === "key" && provider && (
            <div className="space-y-4 p-5">
              {/* Instructions card */}
              <div className="rounded-xl border border-[#2c343d] bg-[#15191d] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 shrink-0 text-[#34d399]" />
                  <span className="text-xs font-semibold text-[#d6dce3]">
                    How to get your {provider.name} API key
                  </span>
                </div>
                <ol className="space-y-2.5">
                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#20252a] text-[10px] font-semibold text-[#7a8591] ring-1 ring-[#2c343d]">
                      1
                    </span>
                    <p className="pt-0.5 text-xs leading-relaxed text-[#a8b0ba]">
                      Go to the{" "}
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#34d399] underline-offset-2 hover:underline"
                      >
                        {provider.name} API keys page
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#20252a] text-[10px] font-semibold text-[#7a8591] ring-1 ring-[#2c343d]">
                      2
                    </span>
                    <p className="pt-0.5 text-xs leading-relaxed text-[#a8b0ba]">
                      Create a new API key and copy it
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#20252a] text-[10px] font-semibold text-[#7a8591] ring-1 ring-[#2c343d]">
                      3
                    </span>
                    <p className="pt-0.5 text-xs leading-relaxed text-[#a8b0ba]">
                      Paste it in the field below and click Validate
                    </p>
                  </li>
                </ol>
              </div>

              {/* Key input */}
              <div className="space-y-2">
                <label
                  htmlFor="models-api-key-input"
                  className="block text-xs font-medium text-[#d6dce3]"
                >
                  API Key
                  {provider.keyPrefix && (
                    <span className="ml-1.5 font-normal text-[#7a8591]">
                      (starts with{" "}
                      <code className="font-mono text-[#a8b0ba]">{provider.keyPrefix}</code>)
                    </span>
                  )}
                </label>
                <input
                  ref={keyInputRef}
                  id="models-api-key-input"
                  type="password"
                  value={wizard.apiKey}
                  onChange={(e) =>
                    setWizard((s) => ({ ...s, apiKey: e.target.value, error: null }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleValidate();
                  }}
                  placeholder={
                    provider.keyPrefix ? `${provider.keyPrefix}...` : "Paste your API key here"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "w-full rounded-lg border bg-[#15191d] px-3 py-2.5 font-mono text-sm text-[#f5f7fa] placeholder-[#3d4752]",
                    "transition-colors focus:outline-none focus:ring-2",
                    wizard.error
                      ? "border-red-500/40 focus:border-red-500/40 focus:ring-red-500/20"
                      : "border-[#2c343d] focus:border-[#34d399]/40 focus:ring-[#34d399]/20"
                  )}
                />
                {wizard.error && (
                  <p className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {wizard.error}
                  </p>
                )}
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#7a8591]">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#34d399]" />
                  Your key is stored only on this device and never sent to our servers.
                </p>
              </div>
            </div>
          )}

          {/* Step: validating */}
          {wizard.step === "validating" && (
            <div className="flex flex-col items-center gap-4 py-14">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#34d399]/10" />
                <Loader2 className="h-8 w-8 animate-spin text-[#34d399]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#f5f7fa]">Checking your key...</p>
                <p className="mt-1 text-xs text-[#7a8591]">This only takes a moment</p>
              </div>
            </div>
          )}

          {/* Step: pick-model */}
          {wizard.step === "pick-model" && (
            <ModelList
              models={wizard.models}
              loading={wizard.loadingModels}
              currentModel={null}
              onSelect={handleSetModel}
            />
          )}

          {/* Step: done */}
          {wizard.step === "done" && (
            <div className="flex flex-col items-center gap-5 px-5 py-10">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/15" />
                <Check className="h-8 w-8 text-emerald-400" strokeWidth={2.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[#f5f7fa]">Provider connected!</p>
                <p className="mt-1 text-xs leading-relaxed text-[#7a8591]">
                  Your AI model is active and ready to use.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#2c343d] px-5 py-4">
          {wizard.step === "pick" && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-[#2c343d] bg-[#20252a] px-4 py-2.5 text-sm font-medium text-[#a8b0ba] transition-colors hover:border-[#3d4752] hover:text-[#f5f7fa]"
            >
              Cancel
            </button>
          )}

          {wizard.step === "key" && (
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={!wizard.apiKey.trim()}
              className="w-full rounded-lg bg-[#34d399] px-4 py-2.5 text-sm font-semibold text-[#0d1117] transition-all hover:bg-[#2dbe8c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Validate &amp; Continue
            </button>
          )}

          {wizard.step === "pick-model" && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-[#2c343d] bg-[#20252a] px-4 py-2.5 text-sm font-medium text-[#a8b0ba] transition-colors hover:border-[#3d4752] hover:text-[#f5f7fa]"
            >
              Skip for now
            </button>
          )}

          {wizard.step === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-[#34d399] px-4 py-2.5 text-sm font-semibold text-[#0d1117] transition-all hover:bg-[#2dbe8c]"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Model Picker Modal (from "Pick model" on provider cards) ── */

function ModelPickerModal({
  provider,
  currentModel,
  onClose,
  onSelect,
}: {
  provider: Provider;
  currentModel: string | null;
  onClose: () => void;
  onSelect: () => void;
}) {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-models", provider: provider.id }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (data.ok) {
        setModels(data.models ?? []);
      } else {
        setFetchError(data.error ?? "Could not load models.");
      }
    } catch {
      setFetchError("Network error or request timed out.");
    } finally {
      setLoading(false);
    }
  }, [provider.id]);

  // Fetch once on mount
  const didFetch = useRef(false);
  if (!didFetch.current) {
    didFetch.current = true;
    void fetchModels();
  }

  async function handleSelect(modelId: string) {
    try {
      await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-primary", model: modelId }),
        signal: AbortSignal.timeout(10000),
      });
      onSelect();
    } catch {
      setFetchError("Could not save model selection. Try again.");
    }
  }

  return (
    <div className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="animate-modal-in mx-0 flex w-full max-w-lg flex-col rounded-t-2xl border border-[#2c343d] bg-[#171a1d] shadow-2xl sm:mx-4 sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#2c343d] px-5 py-4">
          <ProviderAvatar name={provider.name} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[#f5f7fa]">{provider.name} models</h2>
            <p className="mt-0.5 text-xs text-[#7a8591]">
              Click any model to make it active
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#7a8591] transition-colors hover:bg-[#20252a] hover:text-[#f5f7fa]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {fetchError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-[#3d4752]" />
              <p className="text-sm text-[#a8b0ba]">{fetchError}</p>
              <button
                type="button"
                onClick={() => void fetchModels()}
                className="mt-1 rounded-lg border border-[#2c343d] px-3 py-1.5 text-xs text-[#a8b0ba] hover:border-[#3d4752] hover:text-[#f5f7fa]"
              >
                Retry
              </button>
            </div>
          ) : (
            <ModelList
              models={models}
              loading={loading}
              currentModel={currentModel}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#2c343d] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-[#2c343d] bg-[#20252a] px-4 py-2.5 text-sm font-medium text-[#a8b0ba] transition-colors hover:border-[#3d4752] hover:text-[#f5f7fa]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Remove button (double-click confirm) ───────── */

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      onRemove();
      setConfirming(false);
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        confirming
          ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border-[#2c343d] bg-[#20252a] text-[#7a8591] hover:border-[#3d4752] hover:text-[#a8b0ba]"
      )}
    >
      <Trash2 className="h-3 w-3 shrink-0" />
      {confirming ? "Click again to confirm" : "Remove"}
    </button>
  );
}

/* ── Provider card ──────────────────────────────── */

function ProviderCard({
  providerId,
  currentModel,
  onPickModel,
  onRemove,
}: {
  providerId: string;
  currentModel: string | null;
  onPickModel: () => void;
  onRemove: () => void;
}) {
  const provider = findProvider(providerId);
  const name = provider?.name ?? providerId;
  const isActiveProvider = currentModel?.startsWith(providerId + "/") ?? false;
  const activeModelName =
    isActiveProvider && currentModel ? getFriendlyModelName(currentModel) : null;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#2c343d] bg-[#15191d] p-4">
      <ProviderAvatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot active />
          <span className="text-sm font-semibold text-[#f5f7fa]">{name}</span>
        </div>
        {activeModelName ? (
          <p className="mt-0.5 truncate text-xs text-[#34d399]">Active: {activeModelName}</p>
        ) : (
          <p className="mt-0.5 text-xs text-[#7a8591]">No model selected from this provider</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onPickModel}
          className="flex items-center gap-1.5 rounded-lg border border-[#2c343d] bg-[#20252a] px-2.5 py-1.5 text-xs font-medium text-[#a8b0ba] transition-all hover:border-[#34d399]/30 hover:text-[#34d399]"
        >
          <Zap className="h-3 w-3 shrink-0" />
          Pick model
        </button>
        <RemoveButton onRemove={onRemove} />
      </div>
    </div>
  );
}

/* ── Active model banner ─────────────────────────── */

function ActiveModelBanner({
  model,
  onAddProvider,
}: {
  model: string | null;
  onAddProvider: () => void;
}) {
  if (model) {
    const friendlyName = getFriendlyModelName(model);
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[#34d399]/20 bg-[#34d399]/5 p-4">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#34d399]/10">
          <StatusDot active />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#34d399]">
            Active model
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#f5f7fa]">{friendlyName}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[#7a8591]">{model}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#f5f7fa]">No model configured</p>
        <p className="mt-0.5 text-xs text-[#7a8591]">
          Connect an AI provider and pick a model to get started.
        </p>
      </div>
      <button
        type="button"
        onClick={onAddProvider}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#34d399] px-3 py-1.5 text-xs font-semibold text-[#0d1117] transition-all hover:bg-[#2dbe8c]"
      >
        <Plus className="h-3 w-3 shrink-0" />
        Add provider
      </button>
    </div>
  );
}

/* ── Toast ──────────────────────────────────────── */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="animate-modal-in fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/20 bg-[#1d2227] px-4 py-3 shadow-2xl">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
      <span className="whitespace-nowrap text-sm text-[#f5f7fa]">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#7a8591] hover:text-[#f5f7fa]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── Main view ──────────────────────────────────── */

export function ModelsView() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pickerProvider, setPickerProvider] = useState<Provider | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/models/summary", {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data: SummaryResponse = await res.json();
      setSummary(data);
    } catch {
      // Silently ignore — next poll will retry
    }
  }, []);

  useSmartPoll(fetchSummary, { intervalMs: 30000 });

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  async function handleRemoveProvider(providerId: string) {
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-provider", provider: providerId }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchSummary();
    } catch {
      showToast("Could not remove provider. Try again.");
    }
  }

  function handlePickerClose() {
    setPickerProvider(null);
    void fetchSummary();
  }

  function handleWizardDone() {
    void fetchSummary();
  }

  const configuredProviders = summary?.configuredProviders ?? [];
  const primaryModel = summary?.defaults?.primary ?? null;
  const unconnectedProviders = PROVIDERS.filter((p) => !configuredProviders.includes(p.id));

  return (
    <>
      <SectionLayout>
        <SectionHeader
          title="AI Model"
          description="Connect your AI provider and choose which model powers your assistant."
          bordered
          actions={
            configuredProviders.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowWizard(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#34d399] px-3 py-2 text-sm font-semibold text-[#0d1117] transition-all hover:bg-[#2dbe8c]"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Add provider
              </button>
            ) : null
          }
        />

        <SectionBody width="content" padding="regular">
          <div className="space-y-6">
            {/* Active model banner */}
            <ActiveModelBanner model={primaryModel} onAddProvider={() => setShowWizard(true)} />

            {/* Connected providers */}
            {configuredProviders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#7a8591]">
                    Connected providers
                  </h2>
                  <span className="rounded-full border border-[#2c343d] bg-[#20252a] px-2 py-0.5 text-[11px] font-medium text-[#7a8591]">
                    {configuredProviders.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {configuredProviders.map((pid) => (
                    <ProviderCard
                      key={pid}
                      providerId={pid}
                      currentModel={primaryModel}
                      onPickModel={() => {
                        const p = findProvider(pid) ?? {
                          id: pid,
                          name: pid,
                          hint: "",
                          keyPrefix: "",
                          url: "",
                        };
                        setPickerProvider(p);
                      }}
                      onRemove={() => void handleRemoveProvider(pid)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {summary === null && (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl border border-[#2c343d] bg-[#15191d]"
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {summary !== null && configuredProviders.length === 0 && (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[#2c343d] py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2c343d] bg-[#15191d]">
                  <Key className="h-6 w-6 text-[#3d4752]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f5f7fa]">No providers connected yet</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#7a8591]">
                    Add an AI provider API key to get started. Your key is stored securely on this
                    device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWizard(true)}
                  className="flex items-center gap-2 rounded-lg bg-[#34d399] px-4 py-2.5 text-sm font-semibold text-[#0d1117] transition-all hover:bg-[#2dbe8c]"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Add your first provider
                </button>
              </div>
            )}

            {/* Available (not yet connected) providers grid */}
            {configuredProviders.length > 0 && unconnectedProviders.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#7a8591]">
                  Available providers
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {unconnectedProviders.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setShowWizard(true)}
                      className="group flex flex-col items-start gap-2 rounded-xl border border-[#2c343d] bg-[#15191d] p-3 text-left transition-all hover:border-[#3d4752] hover:bg-[#1d2227]"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2c343d] bg-[#20252a] text-xs font-bold text-[#a8b0ba]">
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#d6dce3]">{p.name}</p>
                        <p className="text-[10px] text-[#7a8591]">{p.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionBody>
      </SectionLayout>

      {/* Add provider wizard modal */}
      {showWizard && (
        <AddProviderWizard
          onClose={() => setShowWizard(false)}
          onDone={handleWizardDone}
        />
      )}

      {/* Model picker modal (triggered from provider card) */}
      {pickerProvider && (
        <ModelPickerModal
          provider={pickerProvider}
          currentModel={primaryModel}
          onClose={handlePickerClose}
          onSelect={handlePickerClose}
        />
      )}

      {/* Error toast */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </>
  );
}
