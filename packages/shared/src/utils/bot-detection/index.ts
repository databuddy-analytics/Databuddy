/**
 * Bot Detection Module
 * 
 * Centralized bot detection system for all Databuddy applications
 * 
 * @example
 * ```typescript
 * import { detectBot, BotAction, BotCategory } from '@databuddy/shared/bot-detection';
 * 
 * const result = detectBot(userAgent, {
 *   allowAICrawlers: false,
 *   allowedBots: ['GPTBot'],
 *   blockedBots: ['SemrushBot'],
 * });
 * 
 * if (result.action === BotAction.BLOCK) {
 *   return new Response('Blocked', { status: 403 });
 * }
 * ```
 */

export * from "./types";
export * from "./detector";
export * from "./user-agent";
