/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  const __APP_VERSION__: string;
  const __BUILD_ID__: string;
  const __BUILD_TIME__: string;
}

export {};
