import type { AppServices } from "./services.ts";
// Context 1 owns this single wiring point. Context 2 implements engines in its
// own directories, then supplies an adapter. No successful service is simulated.
const unavailable: AppServices = Object.freeze({
  version: 1,
  capabilities: Object.freeze([]),
});
export function getAppServices(): AppServices {
  return unavailable;
}
