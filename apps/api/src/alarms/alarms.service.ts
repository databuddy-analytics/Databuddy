// Alarms Service — Drizzle ORM
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { alarms, alarmLogs } from "@databuddy/db";
import { db } from "@databuddy/db";
import type {
  Alarm,
  AlarmLog,
  AlarmStats,
  CreateAlarmInput,
  TriggerType,
  NotificationChannel,
} from "./alarms.types";
import { NotificationClient } from "@databuddy/notifications";

function mapRow(row: typeof alarms.$inferSelect): Alarm {
  return {
    id: row.id,
    user_id: row.userId,
    organization_id: row.organizationId,
    website_id: row.websiteId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    notification_channels: row.notificationChannels as NotificationChannel[],
    slack_webhook_url: row.slackWebhookUrl,
    discord_webhook_url: row.discordWebhookUrl,
    teams_webhook_url: row.teamsWebhookUrl,
    telegram_bot_token: row.telegramBotToken,
    telegram_chat_id: row.telegramChatId,
    google_chat_webhook_url: row.googleChatWebhookUrl,
    email_addresses: row.emailAddresses ?? [],
    webhook_url: row.webhookUrl,
    webhook_headers: row.webhookHeaders as Record<string, string> | undefined,
    trigger_type: row.triggerType as TriggerType,
    trigger_conditions: row.triggerConditions as Record<string, unknown>,
    check_interval: row.checkInterval,
    cooldown_period: row.cooldownPeriod,
    last_triggered_at: row.lastTriggeredAt,
    last_error: row.lastError,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export class AlarmsService {
  async createAlarm(input: CreateAlarmInput, userId: string, organizationId?: string): Promise<Alarm> {
    const id = nanoid();
    const [row] = await db
      .insert(alarms)
      .values({
        id,
        userId,
        organizationId,
        websiteId: input.website_id,
        name: input.name,
        description: input.description,
        enabled: input.enabled ?? true,
        notificationChannels: input.notification_channels,
        slackWebhookUrl: input.slack_webhook_url,
        discordWebhookUrl: input.discord_webhook_url,
        teamsWebhookUrl: input.teams_webhook_url,
        telegramBotToken: input.telegram_bot_token,
        telegramChatId: input.telegram_chat_id,
        googleChatWebhookUrl: input.google_chat_webhook_url,
        emailAddresses: input.email_addresses ?? [],
        webhookUrl: input.webhook_url,
        webhookHeaders: input.webhook_headers,
        triggerType: input.trigger_type,
        triggerConditions: input.trigger_conditions,
        checkInterval: input.check_interval ?? 300,
        cooldownPeriod: input.cooldown_period ?? 3600,
      })
      .returning();

    return mapRow(row);
  }

  async updateAlarm(input: { id: string; [key: string]: unknown }): Promise<Alarm> {
    const { id, ...data } = input;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.website_id !== undefined) updateData.websiteId = data.website_id;
    if (data.notification_channels !== undefined) updateData.notificationChannels = data.notification_channels;
    if (data.slack_webhook_url !== undefined) updateData.slackWebhookUrl = data.slack_webhook_url;
    if (data.discord_webhook_url !== undefined) updateData.discordWebhookUrl = data.discord_webhook_url;
    if (data.teams_webhook_url !== undefined) updateData.teamsWebhookUrl = data.teams_webhook_url;
    if (data.telegram_bot_token !== undefined) updateData.telegramBotToken = data.telegram_bot_token;
    if (data.telegram_chat_id !== undefined) updateData.telegramChatId = data.telegram_chat_id;
    if (data.google_chat_webhook_url !== undefined) updateData.googleChatWebhookUrl = data.google_chat_webhook_url;
    if (data.email_addresses !== undefined) updateData.emailAddresses = data.email_addresses;
    if (data.webhook_url !== undefined) updateData.webhookUrl = data.webhook_url;
    if (data.webhook_headers !== undefined) updateData.webhookHeaders = data.webhook_headers;
    if (data.trigger_type !== undefined) updateData.triggerType = data.trigger_type;
    if (data.trigger_conditions !== undefined) updateData.triggerConditions = data.trigger_conditions;
    if (data.check_interval !== undefined) updateData.checkInterval = data.check_interval;
    if (data.cooldown_period !== undefined) updateData.cooldownPeriod = data.cooldown_period;

    const [row] = await db
      .update(alarms)
      .set(updateData)
      .where(eq(alarms.id, id))
      .returning();

    return mapRow(row);
  }

  async deleteAlarm(id: string): Promise<void> {
    await db.delete(alarms).where(eq(alarms.id, id));
  }

  async getAlarm(id: string): Promise<Alarm | null> {
    const [row] = await db
      .select()
      .from(alarms)
      .where(eq(alarms.id, id))
      .limit(1);

    return row ? mapRow(row) : null;
  }

  async getUserAlarms(
    userId: string,
    options?: {
      enabled?: boolean;
      trigger_type?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Alarm[]> {
    const conditions = [eq(alarms.userId, userId)];
    if (options?.enabled !== undefined) {
      conditions.push(eq(alarms.enabled, options.enabled));
    }
    if (options?.trigger_type) {
      conditions.push(eq(alarms.triggerType, options.trigger_type));
    }

    const rows = await db
      .select()
      .from(alarms)
      .where(and(...conditions))
      .orderBy(desc(alarms.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return rows.map(mapRow);
  }

  async toggleAlarm(id: string, enabled: boolean): Promise<Alarm> {
    return this.updateAlarm({ id, enabled });
  }

  async triggerAlarm(alarmId: string, triggerValue: Record<string, unknown>): Promise<void> {
    const alarm = await this.getAlarm(alarmId);
    if (!alarm || !alarm.enabled) return;

    if (alarm.last_triggered_at) {
      const cooldownMs = alarm.cooldown_period * 1000;
      if (Date.now() - alarm.last_triggered_at.getTime() < cooldownMs) return;
    }

    const client = new NotificationClient();
    const errors: string[] = [];

    const results = await client.send(
      {
        title: `Alarm: ${alarm.name}`,
        message: JSON.stringify(triggerValue),
        priority: "high",
      },
      { channels: alarm.notification_channels as any }
    );

    const channelsSent: string[] = [];
    for (const r of results) {
      if (r.success) {
        channelsSent.push(r.channel);
      } else {
        errors.push(`${r.channel}: ${r.error ?? "unknown"}`);
      }
    }

    await db.insert(alarmLogs).values({
      id: nanoid(),
      alarmId,
      triggerValue,
      notificationChannelsSent: channelsSent,
      status: errors.length === 0 ? "sent" : "failed",
      errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
    });

    await db
      .update(alarms)
      .set({
        lastTriggeredAt: new Date(),
        lastError: errors.length > 0 ? errors.join("; ") : null,
      })
      .where(eq(alarms.id, alarmId));
  }

  async getAlarmStats(userId: string): Promise<AlarmStats> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalResult, activeResult, triggeredResult, failedResult] = await Promise.all([
      db.select({ c: count() }).from(alarms).where(eq(alarms.userId, userId)),
      db.select({ c: count() }).from(alarms).where(and(eq(alarms.userId, userId), eq(alarms.enabled, true))),
      db.select({ c: count() }).from(alarmLogs)
        .innerJoin(alarms, eq(alarmLogs.alarmId, alarms.id))
        .where(and(eq(alarms.userId, userId), gte(alarmLogs.triggeredAt, todayStart))),
      db.select({ c: count() }).from(alarmLogs)
        .innerJoin(alarms, eq(alarmLogs.alarmId, alarms.id))
        .where(and(eq(alarms.userId, userId), eq(alarmLogs.status, "failed"), gte(alarmLogs.triggeredAt, todayStart))),
    ]);

    return {
      total_alarms: totalResult[0].c,
      active_alarms: activeResult[0].c,
      triggered_today: triggeredResult[0].c,
      failed_today: failedResult[0].c,
      by_trigger_type: {} as Record<TriggerType, number>,
      by_channel: {} as Record<NotificationChannel, number>,
    };
  }
}

export const alarmsService = new AlarmsService();
