/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WHEP_URL?: string;
  readonly VITE_WHIP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
