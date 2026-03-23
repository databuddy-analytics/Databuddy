// Alarms System Types
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

export type NotificationChannel =
  | 'slack'
  | 'discord'
  | 'email'
  | 'webhook'
  | 'teams'
  | 'telegram'
  | 'google-chat';

export type TriggerType =
  | 'uptime'
  | 'traffic_spike'
  | 'error_rate'
  | 'response_time'
  | 'custom';

export type AlarmStatus = 'active' | 'paused' | 'triggered' | 'error';

export interface Alarm {
  id: string;  // nanoid
  user_id: string;
  organization_id?: string;
  website_id?: string;
  name: string;
  description?: string;
  enabled: boolean;
  
  // 通知渠道
  notification_channels: NotificationChannel[];
  
  // Webhook URLs
  slack_webhook_url?: string;
  discord_webhook_url?: string;
  teams_webhook_url?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  google_chat_webhook_url?: string;
  
  // Email 配置
  email_addresses: string[];
  
  // 自定义 Webhook
  webhook_url?: string;
  webhook_headers?: Record<string, string>;
  
  // 触发器配置
  trigger_type: TriggerType;
  trigger_conditions: TriggerConditions;
  
  // 时间配置
  check_interval: number;  // 秒
  cooldown_period: number;  // 秒
  
  // 状态
  last_triggered_at?: Date;
  last_error?: string;
  
  // 时间戳
  created_at: Date;
  updated_at: Date;
}

export interface TriggerConditions {
  // Uptime 触发条件
  uptime_threshold?: number;  // 正常运行时间百分比阈值
  downtime_minutes?: number;  // 停机分钟数阈值
  
  // Traffic Spike 触发条件
  traffic_increase_percent?: number;  // 流量增长百分比
  traffic_decrease_percent?: number;  // 流量下降百分比
  
  // Error Rate 触发条件
  error_rate_threshold?: number;  // 错误率阈值（百分比）
  error_count_threshold?: number;  // 错误数量阈值
  
  // Response Time 触发条件
  response_time_threshold?: number;  // 响应时间阈值（毫秒）
  
  // 通用配置
  comparison?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';  // 比较操作符
  consecutive_failures?: number;  // 连续失败次数
}

export interface AlarmLog {
  id: string;
  alarm_id: string;
  triggered_at: Date;
  trigger_value?: Record<string, any>;
  notification_channels_sent: NotificationChannel[];
  status: 'sent' | 'failed' | 'pending';
  error_message?: string;
  response_data?: Record<string, any>;
}

export interface CreateAlarmInput {
  name: string;
  description?: string;
  website_id?: string;
  enabled?: boolean;
  notification_channels: NotificationChannel[];
  
  // 通知配置（可选）
  slack_webhook_url?: string;
  discord_webhook_url?: string;
  teams_webhook_url?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  google_chat_webhook_url?: string;
  email_addresses?: string[];
  webhook_url?: string;
  webhook_headers?: Record<string, string>;
  
  // 触发器配置
  trigger_type: TriggerType;
  trigger_conditions: TriggerConditions;
  
  // 时间配置
  check_interval?: number;
  cooldown_period?: number;
}

export interface UpdateAlarmInput extends Partial<CreateAlarmInput> {
  id: string;
  enabled?: boolean;
}

export interface AlarmStats {
  total_alarms: number;
  active_alarms: number;
  triggered_today: number;
  failed_today: number;
  by_trigger_type: Record<TriggerType, number>;
  by_channel: Record<NotificationChannel, number>;
}
