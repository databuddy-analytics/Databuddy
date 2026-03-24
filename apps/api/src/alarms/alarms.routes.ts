// Alarms API Routes — Elysia Plugin
import { auth } from "@databuddy/auth";
import { logger } from "@databuddy/shared/logger";
import { Elysia, t } from "elysia";
import { alarmsService } from "./alarms.service";
import type { CreateAlarmInput, UpdateAlarmInput } from "./alarms.types";

const notificationChannels = [
  "slack",
  "discord",
  "email",
  "webhook",
  "teams",
  "telegram",
  "google-chat",
] as const;

const triggerTypes = [
  "uptime",
  "traffic_spike",
  "error_rate",
  "response_time",
  "custom",
] as const;

const createAlarmBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  website_id: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean({ default: true })),
  notification_channels: t.Array(
    t.Enum(notificationChannels.reduce((a, c) => ({ ...a, [c]: c }), {} as Record<string, string>))
  ),
  slack_webhook_url: t.Optional(t.String({ format: "uri" })),
  discord_webhook_url: t.Optional(t.String({ format: "uri" })),
  teams_webhook_url: t.Optional(t.String({ format: "uri" })),
  telegram_bot_token: t.Optional(t.String()),
  telegram_chat_id: t.Optional(t.String()),
  google_chat_webhook_url: t.Optional(t.String({ format: "uri" })),
  email_addresses: t.Optional(t.Array(t.String({ format: "email" }))),
  webhook_url: t.Optional(t.String({ format: "uri" })),
  webhook_headers: t.Optional(t.Record(t.String(), t.String())),
  trigger_type: t.Enum(triggerTypes.reduce((a, c) => ({ ...a, [c]: c }), {} as Record<string, string>)),
  trigger_conditions: t.Object({
    uptime_threshold: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    downtime_minutes: t.Optional(t.Number({ minimum: 0 })),
    traffic_increase_percent: t.Optional(t.Number({ minimum: 0 })),
    traffic_decrease_percent: t.Optional(t.Number({ minimum: 0 })),
    error_rate_threshold: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    error_count_threshold: t.Optional(t.Number({ minimum: 0 })),
    response_time_threshold: t.Optional(t.Number({ minimum: 0 })),
    comparison: t.Optional(
      t.Enum({ gt: "gt", lt: "lt", eq: "eq", gte: "gte", lte: "lte" })
    ),
    consecutive_failures: t.Optional(t.Number({ minimum: 1 })),
  }),
  check_interval: t.Optional(t.Number({ minimum: 60, maximum: 86400 })),
  cooldown_period: t.Optional(t.Number({ minimum: 60, maximum: 86400 })),
});

export const alarms = new Elysia({ prefix: "/v1/alarms" })
  .derive(async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return { user: session?.user ?? null };
  })
  .onBeforeHandle(({ user, set }) => {
    if (!user) {
      set.status = 401;
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      };
    }
  })
  // GET /v1/alarms/stats — BEFORE :id to avoid param capture
  .get(
    "/stats",
    async ({ user }) => {
      try {
        const stats = await alarmsService.getAlarmStats(user!.id);
        return { success: true, data: stats };
      } catch (error) {
        logger.error({ error }, "Failed to get alarm stats");
        return {
          success: false,
          error: "Failed to get alarm stats",
        };
      }
    }
  )
  .get(
    "/",
    async ({ user, query }) => {
      try {
        const alarms = await alarmsService.getUserAlarms(user!.id, {
          enabled:
            query.enabled === "true"
              ? true
              : query.enabled === "false"
                ? false
                : undefined,
          trigger_type: query.trigger_type as any,
          limit: Number(query.limit) || 50,
          offset: Number(query.offset) || 0,
        });
        return {
          success: true,
          data: alarms,
          pagination: {
            limit: Number(query.limit) || 50,
            offset: Number(query.offset) || 0,
            total: alarms.length,
          },
        };
      } catch (error) {
        logger.error({ error }, "Failed to get alarms");
        return { success: false, error: "Failed to get alarms" };
      }
    },
    {
      query: t.Object({
        enabled: t.Optional(t.String()),
        trigger_type: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/",
    async ({ body, user }) => {
      try {
        const alarm = await alarmsService.createAlarm(
          body as CreateAlarmInput,
          user!.id
        );
        return {
          success: true,
          data: alarm,
          message: "Alarm created successfully",
        };
      } catch (error) {
        logger.error({ error }, "Failed to create alarm");
        return { success: false, error: "Failed to create alarm" };
      }
    },
    { body: createAlarmBody }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const alarm = await alarmsService.getAlarm(params.id);
        if (!alarm) {
          set.status = 404;
          return { success: false, error: "Alarm not found" };
        }
        return { success: true, data: alarm };
      } catch (error) {
        logger.error({ error }, "Failed to get alarm");
        return { success: false, error: "Failed to get alarm" };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .put(
    "/:id",
    async ({ params, body, user, set }) => {
      try {
        // Ownership check
        const existing = await alarmsService.getAlarm(params.id);
        if (!existing) {
          set.status = 404;
          return { success: false, error: "Alarm not found" };
        }
        if (existing.user_id !== user!.id) {
          set.status = 403;
          return { success: false, error: "Forbidden" };
        }
        const alarm = await alarmsService.updateAlarm({
          ...(body as UpdateAlarmInput),
          id: params.id,
        });
        return {
          success: true,
          data: alarm,
          message: "Alarm updated successfully",
        };
      } catch (error) {
        logger.error({ error }, "Failed to update alarm");
        return { success: false, error: "Failed to update alarm" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(createAlarmBody),
    }
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      try {
        // Ownership check
        const existing = await alarmsService.getAlarm(params.id);
        if (!existing) {
          set.status = 404;
          return { success: false, error: "Alarm not found" };
        }
        if (existing.user_id !== user!.id) {
          set.status = 403;
          return { success: false, error: "Forbidden" };
        }
        await alarmsService.deleteAlarm(params.id);
        return {
          success: true,
          message: "Alarm deleted successfully",
        };
      } catch (error) {
        logger.error({ error }, "Failed to delete alarm");
        return { success: false, error: "Failed to delete alarm" };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/toggle",
    async ({ params, body, user, set }) => {
      try {
        // Ownership check
        const existing = await alarmsService.getAlarm(params.id);
        if (!existing) {
          set.status = 404;
          return { success: false, error: "Alarm not found" };
        }
        if (existing.user_id !== user!.id) {
          set.status = 403;
          return { success: false, error: "Forbidden" };
        }
        const alarm = await alarmsService.toggleAlarm(params.id, body.enabled);
        return {
          success: true,
          data: alarm,
          message: `Alarm ${body.enabled ? "enabled" : "disabled"} successfully`,
        };
      } catch (error) {
        logger.error({ error }, "Failed to toggle alarm");
        return { success: false, error: "Failed to toggle alarm" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ enabled: t.Boolean() }),
    }
  );
