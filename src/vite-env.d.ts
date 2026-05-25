/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_BASE_URL?: string;
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_AI_PROVIDER_NAME?: string;
  readonly VITE_AI_STRUCTURED_OUTPUTS?: string;
  readonly VITE_AI_DISABLE_THINKING?: string;
  readonly VITE_AI_TIMEOUT_MS?: string;
  readonly VITE_AI_STREAMING?: string;
  readonly VITE_AI_FORCE_LOCAL_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
