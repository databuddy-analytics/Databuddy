/**
 * @databuddy/env - Tree-shakeable environment configuration
 *
 * Import specific app environments:
 * - import { env } from '@databuddy/env/dashboard'
 * - import { env } from '@databuddy/env/api'
 * - import { env } from '@databuddy/env/basket'
 * - import { env } from '@databuddy/env/better-admin'
 * - import { env } from '@databuddy/env/database'
 * - import { env } from '@databuddy/env/docs'
 */

export type { ApiEnv } from './api';
export * from './base';
export type { BasketEnv } from './basket';
export type { BetterAdminEnv } from './better-admin';
// Re-export types for convenience
export type { DashboardEnv } from './dashboard';
export type { DatabaseEnv } from './database';
export type { DocsEnv } from './docs';
