/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "@fontsource-variable/bricolage-grotesque";

interface Window {
  gtag?: (
    command: "event",
    eventName: string,
    parameters?: Record<string, string>,
  ) => void;
}
