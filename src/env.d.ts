/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_COLORING_REQUEST_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
