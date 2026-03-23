// Alarms Service - 告警服务
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

import { db } from '@databuddy/db';
import { nanoid } from 'nanoid';
import type {
  Alarm,
  AlarmLog,
  CreateAlarmInput,
  UpdateAlarmInput,
  AlarmStats,
  TriggerType,
  NotificationChannel,
} from './alarms.types';
import { sendNotification } from '@databuddy/notifications';

export class AlarmsService {
  /**
   * 创建告警
   */
  async createAlarm(input: CreateAlarmInput, userId: string, organizationId?: string): Promise<Alarm> {
    const id = nanoid();
    
    const alarm = await db.alarms.create({
      data: {
        id,
        user_id: userId,
        organization_id: organizationId,
        website_id: input.website_id,
        name: input.name,
        description: input.description,
        enabled: input.enabled ?? true,
        notification_channels: input.notification_channels,
        slack_webhook_url: input.slack_webhook_url,
        discord_webhook_url: input.discord_webhook_url,
        teams_webhook_url: input.teams_webhook_url,
        telegram_bot_token: input.telegram_bot_token,
        telegram_chat_id: input.telegram_chat_id,
        google_chat_webhook_url: input.google_chat_webhook_url,
        email_addresses: input.email_addresses ?? [],
        webhook_url: input.webhook_url,
        webhook_headers: input.webhook_headers,
        trigger_type: input.trigger_type,
        trigger_conditions: input.trigger_conditions,
        check_interval: input.check_interval ?? 300,
        cooldown_period: input.cooldown_period ?? 3600,
      },
    });
    
    return this.mapToAlarm(alarm);
  }

  /**
   * 更新告警
   */
  async updateAlarm(input: UpdateAlarmInput): Promise<Alarm> {
    const { id, ...updateData } = input;
    
    const alarm = await db.alarms.update({
      where: { id },
      data: {
        ...updateData,
        updated_at: new Date(),
      },
    });
    
    return this.mapToAlarm(alarm);
  }

  /**
   * 删除告警
   */
  async deleteAlarm(id: string): Promise<void> {
    await db.alarms.delete({
      where: { id },
    });
  }

  /**
   * 获取告警详情
   */
  async getAlarm(id: string): Promise<Alarm | null> {
    const alarm = await db.alarms.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { triggered_at: 'desc' },
          take: 10,
        },
      },
    });
    
    return alarm ? this.mapToAlarm(alarm) : null;
  }

  /**
   * 获取用户的告警列表
   */
  async getUserAlarms(
    userId: string,
    options?: {
      enabled?: boolean;
      trigger_type?: TriggerType;
      limit?: number;
      offset?: number;
    }
  ): Promise<Alarm[]> {
    const where: any = { user_id: userId };
    
    if (options?.enabled !== undefined) {
      where.enabled = options.enabled;
    }
    
    if (options?.trigger_type) {
      where.trigger_type = options.trigger_type;
    }
    
    const alarms = await db.alarms.findMany({
      where,
      orderBy: { created_at: 'desc' },
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    });
    
    return alarms.map(this.mapToAlarm);
  }

  /**
   * 启用/禁用告警
   */
  async toggleAlarm(id: string, enabled: boolean): Promise<Alarm> {
    return this.updateAlarm({ id, enabled });
  }

  /**
   * 触发告警
   */
  async triggerAlarm(alarmId: string, triggerValue: Record<string, any>): Promise<void> {
    const alarm = await this.getAlarm(alarmId);
    if (!alarm || !alarm.enabled) {
      return;
    }
    
    // 检查冷却时间
    if (alarm.last_triggered_at) {
      const cooldownMs = alarm.cooldown_period * 1000;
      const timeSinceLastTrigger = Date.now() - alarm.last_triggered_at.getTime();
      
      if (timeSinceLastTrigger < cooldownMs) {
        console.log(`Alarm ${alarmId} in cooldown period, skipping`);
        return;
      }
    }
    
    // 发送通知
    const channelsSent: NotificationChannel[] = [];
    const errors: string[] = [];
    
    for (const channel of alarm.notification_channels) {
      try {
        await sendNotification({
          channel,
          alarm,
          triggerValue,
        });
        channelsSent.push(channel);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${channel}: ${errorMsg}`);
        console.error(`Failed to send notification via ${channel}:`, error);
      }
    }
    
    // 记录日志
    await this.logAlarmTrigger({
      alarm_id: alarmId,
      trigger_value: triggerValue,
      notification_channels_sent: channelsSent,
      status: errors.length === 0 ? 'sent' : 'failed',
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    });
    
    // 更新告警最后触发时间
    await db.alarms.update({
      where: { id: alarmId },
      data: {
        last_triggered_at: new Date(),
        last_error: errors.length > 0 ? errors.join('; ') : null,
      },
    });
  }

  /**
   * 记录告警触发日志
   */
  private async logAlarmTrigger(input: {
    alarm_id: string;
    trigger_value: Record<string, any>;
    notification_channels_sent: NotificationChannel[];
    status: 'sent' | 'failed' | 'pending';
    error_message?: string;
    response_data?: Record<string, any>;
  }): Promise<AlarmLog> {
    const id = nanoid();
    
    const log = await db.alarm_logs.create({
      data: {
        id,
        alarm_id: input.alarm_id,
        trigger_value: input.trigger_value,
        notification_channels_sent: input.notification_channels_sent,
        status: input.status,
        error_message: input.error_message,
        response_data: input.response_data,
      },
    });
    
    return this.mapToAlarmLog(log);
  }

  /**
   * 获取告警统计
   */
  async getAlarmStats(userId: string): Promise<AlarmStats> {
    const [total, active, todayTriggered, todayFailed, byTriggerType, byChannel] = await Promise.all([
      db.alarms.count({ where: { user_id: userId } }),
      db.alarms.count({ where: { user_id: userId, enabled: true } }),
      db.alarm_logs.count({
        where: {
          alarm: { user_id: userId },
          triggered_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.alarm_logs.count({
        where: {
          alarm: { user_id: userId },
          triggered_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: 'failed',
        },
      }),
      this.getGroupCount('trigger_type', userId),
      this.getGroupCount('notification_channels', userId),
    ]);
    
    return {
      total_alarms: total,
      active_alarms: active,
      triggered_today: todayTriggered,
      failed_today: todayFailed,
      by_trigger_type: byTriggerType as Record<TriggerType, number>,
      by_channel: byChannel as Record<NotificationChannel, number>,
    };
  }

  /**
   * 获取分组统计
   */
  private async getGroupCount(field: string, userId: string): Promise<Record<string, number>> {
    const results = await db.alarms.groupBy({
      by: [field as 'trigger_type' | 'notification_channels'],
      where: { user_id: userId },
      _count: true,
    });
    
    return results.reduce((acc, item: any) => {
      const key = item[field];
      if (Array.isArray(key)) {
        // notification_channels is an array
        key.forEach((channel: string) => {
          acc[channel] = (acc[channel] || 0) + 1;
        });
      } else {
        acc[key] = item._count;
      }
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 映射数据库对象到 Alarm 类型
   */
  private mapToAlarm(data: any): Alarm {
    return {
      id: data.id,
      user_id: data.user_id,
      organization_id: data.organization_id,
      website_id: data.website_id,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      notification_channels: data.notification_channels,
      slack_webhook_url: data.slack_webhook_url,
      discord_webhook_url: data.discord_webhook_url,
      teams_webhook_url: data.teams_webhook_url,
      telegram_bot_token: data.telegram_bot_token,
      telegram_chat_id: data.telegram_chat_id,
      google_chat_webhook_url: data.google_chat_webhook_url,
      email_addresses: data.email_addresses,
      webhook_url: data.webhook_url,
      webhook_headers: data.webhook_headers,
      trigger_type: data.trigger_type,
      trigger_conditions: data.trigger_conditions,
      check_interval: data.check_interval,
      cooldown_period: data.cooldown_period,
      last_triggered_at: data.last_triggered_at,
      last_error: data.last_error,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * 映射数据库对象到 AlarmLog 类型
   */
  private mapToAlarmLog(data: any): AlarmLog {
    return {
      id: data.id,
      alarm_id: data.alarm_id,
      triggered_at: data.triggered_at,
      trigger_value: data.trigger_value,
      notification_channels_sent: data.notification_channels_sent,
      status: data.status,
      error_message: data.error_message,
      response_data: data.response_data,
    };
  }
}

export const alarmsService = new AlarmsService();
