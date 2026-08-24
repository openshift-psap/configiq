'use client';

import * as React from 'react';
import { loadAppConfig, getAppConfig } from '@/lib/app-config';

export type InferenceBackend = 'vllm' | 'tensorrt-llm' | 'sglang';

const STORAGE_KEYS = {
  defaultModel: 'settings_default_model',
  hfToken: 'hf_token',
  inferenceBackend: 'settings_inference_backend',
  backendVersion: 'settings_backend_version',
  costingsEnabled: 'settings_costings_enabled',
  costingsApiUrl: 'settings_costings_api_url',
  modelPricingSource: 'settings_model_pricing_source',
  preferredCloudProvider: 'settings_preferred_cloud_provider',
} as const;

const DEFAULT_COSTINGS_URL = process.env.NEXT_PUBLIC_AICOSTINGS_API_URL ?? 'https://aicostings.dev';
export type ModelPricingSource = 'openrouter' | 'litellm';

interface SettingsState {
  hydrated: boolean;
  defaultModel: string;
  hfToken: string;
  inferenceBackend: InferenceBackend;
  backendVersion: string;
  costingsEnabled: boolean;
  costingsApiUrl: string;
  modelPricingSource: ModelPricingSource;
  preferredCloudProvider: string | null;
  setDefaultModel: (v: string) => void;
  setHfToken: (v: string) => void;
  setInferenceBackend: (v: InferenceBackend) => void;
  setBackendVersion: (v: string) => void;
  setCostingsEnabled: (v: boolean) => void;
  setCostingsApiUrl: (v: string) => void;
  setModelPricingSource: (v: ModelPricingSource) => void;
  setPreferredCloudProvider: (v: string | null) => void;
}

const SettingsContext = React.createContext<SettingsState>({
  hydrated: false,
  defaultModel: '',
  hfToken: '',
  inferenceBackend: 'vllm',
  backendVersion: '',
  costingsEnabled: false,
  costingsApiUrl: DEFAULT_COSTINGS_URL,
  modelPricingSource: 'openrouter',
  preferredCloudProvider: null,
  setDefaultModel: () => {},
  setHfToken: () => {},
  setInferenceBackend: () => {},
  setBackendVersion: () => {},
  setCostingsEnabled: () => {},
  setCostingsApiUrl: () => {},
  setModelPricingSource: () => {},
  setPreferredCloudProvider: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = React.useState(false);
  const [defaultModel, setDefaultModelState] = React.useState('');
  const [hfToken, setHfTokenState] = React.useState('');
  const [inferenceBackend, setInferenceBackendState] = React.useState<InferenceBackend>('vllm');
  const [backendVersion, setBackendVersionState] = React.useState('');
  const [costingsEnabled, setCostingsEnabledState] = React.useState(false);
  const [costingsApiUrl, setCostingsApiUrlState] = React.useState(DEFAULT_COSTINGS_URL);
  const [modelPricingSource, setModelPricingSourceState] = React.useState<ModelPricingSource>('openrouter');
  const [preferredCloudProvider, setPreferredCloudProviderState] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function init() {
      // Load config.json first — gives us the defaults to fall back to
      const config = await loadAppConfig();

      // localStorage overrides config; null means "never saved by user" so use config default
      const savedModel = localStorage.getItem(STORAGE_KEYS.defaultModel);
      setDefaultModelState(savedModel !== null ? savedModel : config.defaultModel);

      setHfTokenState(localStorage.getItem(STORAGE_KEYS.hfToken) ?? '');

      const savedBackend = localStorage.getItem(STORAGE_KEYS.inferenceBackend) as InferenceBackend | null;
      const activeBackend: InferenceBackend = savedBackend ?? config.defaultBackend as InferenceBackend;
      setInferenceBackendState(activeBackend);

      const savedVersion = localStorage.getItem(STORAGE_KEYS.backendVersion);
      setBackendVersionState(savedVersion !== null ? savedVersion : (config.backendVersions[activeBackend] ?? ''));

      const savedCostings = localStorage.getItem(STORAGE_KEYS.costingsEnabled);
      setCostingsEnabledState(savedCostings === 'true');

      const savedUrl = localStorage.getItem(STORAGE_KEYS.costingsApiUrl);
      setCostingsApiUrlState(savedUrl ?? DEFAULT_COSTINGS_URL);

      const savedSource = localStorage.getItem(STORAGE_KEYS.modelPricingSource) as ModelPricingSource | null;
      setModelPricingSourceState(savedSource ?? 'openrouter');

      setPreferredCloudProviderState(localStorage.getItem(STORAGE_KEYS.preferredCloudProvider));

      setHydrated(true);
    }
    init();
  }, []);

  const setDefaultModel = React.useCallback((v: string) => {
    setDefaultModelState(v);
    localStorage.setItem(STORAGE_KEYS.defaultModel, v);
  }, []);

  const setHfToken = React.useCallback((v: string) => {
    setHfTokenState(v);
    if (v) {
      localStorage.setItem(STORAGE_KEYS.hfToken, v);
    } else {
      localStorage.removeItem(STORAGE_KEYS.hfToken);
    }
  }, []);

  const setInferenceBackend = React.useCallback((v: InferenceBackend) => {
    setInferenceBackendState(v);
    localStorage.setItem(STORAGE_KEYS.inferenceBackend, v);
    // Reset version to config default for the new backend
    const defaultVersion = getAppConfig().backendVersions[v] ?? '';
    setBackendVersionState(defaultVersion);
    localStorage.setItem(STORAGE_KEYS.backendVersion, defaultVersion);
  }, []);

  const setBackendVersion = React.useCallback((v: string) => {
    setBackendVersionState(v);
    localStorage.setItem(STORAGE_KEYS.backendVersion, v);
  }, []);

  const setCostingsEnabled = React.useCallback((v: boolean) => {
    setCostingsEnabledState(v);
    localStorage.setItem(STORAGE_KEYS.costingsEnabled, String(v));
  }, []);

  const setCostingsApiUrl = React.useCallback((v: string) => {
    setCostingsApiUrlState(v);
    localStorage.setItem(STORAGE_KEYS.costingsApiUrl, v);
  }, []);

  const setModelPricingSource = React.useCallback((v: ModelPricingSource) => {
    setModelPricingSourceState(v);
    localStorage.setItem(STORAGE_KEYS.modelPricingSource, v);
  }, []);

  const setPreferredCloudProvider = React.useCallback((v: string | null) => {
    setPreferredCloudProviderState(v);
    if (v) {
      localStorage.setItem(STORAGE_KEYS.preferredCloudProvider, v);
    } else {
      localStorage.removeItem(STORAGE_KEYS.preferredCloudProvider);
    }
  }, []);

  const value = React.useMemo<SettingsState>(
    () => ({
      hydrated, defaultModel, hfToken, inferenceBackend, backendVersion,
      costingsEnabled, costingsApiUrl, modelPricingSource, preferredCloudProvider,
      setDefaultModel, setHfToken, setInferenceBackend, setBackendVersion,
      setCostingsEnabled, setCostingsApiUrl, setModelPricingSource, setPreferredCloudProvider,
    }),
    [hydrated, defaultModel, hfToken, inferenceBackend, backendVersion,
     costingsEnabled, costingsApiUrl, modelPricingSource, preferredCloudProvider,
     setDefaultModel, setHfToken, setInferenceBackend, setBackendVersion,
     setCostingsEnabled, setCostingsApiUrl, setModelPricingSource, setPreferredCloudProvider],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsState {
  return React.useContext(SettingsContext);
}
