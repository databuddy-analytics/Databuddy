import { umamiAdapter } from "./adapters";

export { mapEvents } from "./utils-map-events";

export const adapters = { umami: umamiAdapter };
export type { AnalyticsEventAdapter } from "./types";
