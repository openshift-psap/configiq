export interface AppConfig {
  defaultModel: string;
  defaultSystem: string;
  defaultOpenModel: string;
  defaultFrontierModel: string;
  defaultBackend: string;
  backendVersions: Record<string, string>;
  supportedModels: string[];
  supportedSystems: string[];
  suggestedModelNames: string[];
  modelRequestUrl: string;
}

// Hardcoded fallback — used if /config.json fails to load
const FALLBACK: AppConfig = {
  defaultModel: 'Qwen/Qwen3-32B',
  defaultSystem: 'h200_sxm',
  defaultOpenModel: 'Qwen/Qwen3-32B',
  defaultFrontierModel: 'claude-fable-5',
  defaultBackend: 'vllm',
  backendVersions: {
    'vllm': '0.24.0',
    'tensorrt-llm': '11.2',
    'sglang': '0.5.17',
  },
  supportedModels: [],
  supportedSystems: [],
  suggestedModelNames: [],
  modelRequestUrl: '',
};

let cached: AppConfig | null = null;

export async function loadAppConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const res = await fetch('/config.json');
    if (!res.ok) throw new Error(`config.json fetch failed (${res.status})`);
    const data = await res.json() as Partial<AppConfig>;
    cached = {
      defaultModel: data.defaultModel ?? FALLBACK.defaultModel,
      defaultSystem: data.defaultSystem ?? FALLBACK.defaultSystem,
      defaultOpenModel: data.defaultOpenModel ?? FALLBACK.defaultOpenModel,
      defaultFrontierModel: data.defaultFrontierModel ?? FALLBACK.defaultFrontierModel,
      defaultBackend: data.defaultBackend ?? FALLBACK.defaultBackend,
      backendVersions: data.backendVersions ?? FALLBACK.backendVersions,
      supportedModels: data.supportedModels ?? FALLBACK.supportedModels,
      supportedSystems: data.supportedSystems ?? FALLBACK.supportedSystems,
      suggestedModelNames: data.suggestedModelNames ?? FALLBACK.suggestedModelNames,
      modelRequestUrl: data.modelRequestUrl ?? FALLBACK.modelRequestUrl,
    };
  } catch {
    cached = FALLBACK;
  }
  return cached;
}

// Synchronous read after loadAppConfig() has been awaited — returns fallback until then
export function getAppConfig(): AppConfig {
  return cached ?? FALLBACK;
}
