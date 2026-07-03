/**
 * @databuddy/env - Tree-shakeable environment configuration
 *
 * Import specific app environments:
 * - import { env } from '@databuddy/env/dashboard'
 * - import { env } from '@databuddy/env/api'
 * - import { env } from '@databuddy/env/basket'
 * - import { env } from '@databuddy/env/docs'
 */

export type { ApiEnv } from "./api";
export * from "./base";
export * from "./boolean";
export type { BasketEnv } from "./basket";
export type { DashboardEnv } from "./dashboard";
export type { DocsEnv } from "./docs";
