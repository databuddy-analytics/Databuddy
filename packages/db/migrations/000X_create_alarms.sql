-- Alarms System Database Schema
-- 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

-- Alarms 表
CREATE TABLE IF NOT EXISTS alarms (
    id VARCHAR(21) PRIMARY KEY,  -- nanoid
    user_id VARCHAR(21) NOT NULL,
    organization_id VARCHAR(21),
    website_id VARCHAR(21),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    
    -- 通知渠道配置
    notification_channels JSONB DEFAULT '[]',  -- ['slack', 'discord', 'email', 'webhook', 'teams', 'telegram', 'google-chat']
    
    -- Webhook URLs
    slack_webhook_url TEXT,
    discord_webhook_url TEXT,
    teams_webhook_url TEXT,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    google_chat_webhook_url TEXT,
    
    -- Email 配置
    email_addresses JSONB DEFAULT '[]',  -- ['user@example.com']
    
    -- 自定义 Webhook
    webhook_url TEXT,
    webhook_headers JSONB DEFAULT '{}',
    
    -- 触发器配置
    trigger_type VARCHAR(50) NOT NULL,  -- 'uptime', 'traffic_spike', 'error_rate', 'custom'
    trigger_conditions JSONB DEFAULT '{}',
    
    -- 时间配置
    check_interval INTEGER DEFAULT 300,  -- 检查间隔（秒），默认 5 分钟
    cooldown_period INTEGER DEFAULT 3600,  -- 冷却时间（秒），默认 1 小时
    
    -- 状态
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 索引
    CONSTRAINT fk_alarms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_alarms_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    CONSTRAINT fk_alarms_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_alarms_user_id ON alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_alarms_org_id ON alarms(organization_id);
CREATE INDEX IF NOT EXISTS idx_alarms_website_id ON alarms(website_id);
CREATE INDEX IF NOT EXISTS idx_alarms_enabled ON alarms(enabled);
CREATE INDEX IF NOT EXISTS idx_alarms_trigger_type ON alarms(trigger_type);
CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON alarms(created_at);

-- Alarm Logs 表（记录告警历史）
CREATE TABLE IF NOT EXISTS alarm_logs (
    id VARCHAR(21) PRIMARY KEY,  -- nanoid
    alarm_id VARCHAR(21) NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    trigger_value JSONB,
    notification_channels_sent JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'sent',  -- 'sent', 'failed', 'pending'
    error_message TEXT,
    response_data JSONB,
    
    CONSTRAINT fk_alarm_logs_alarm FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_alarm_logs_alarm_id ON alarm_logs(alarm_id);
CREATE INDEX IF NOT EXISTS idx_alarm_logs_triggered_at ON alarm_logs(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alarm_logs_status ON alarm_logs(status);

-- 注释
COMMENT ON TABLE alarms IS '告警配置表 - 存储用户告警规则';
COMMENT ON TABLE alarm_logs IS '告警日志表 - 记录告警触发历史';
COMMENT ON COLUMN alarms.notification_channels IS '启用的通知渠道数组';
COMMENT ON COLUMN alarms.trigger_conditions IS '触发条件 JSON，根据 trigger_type 不同而不同';
COMMENT ON COLUMN alarm_logs.trigger_value IS '触发时的实际值';
COMMENT ON COLUMN alarm_logs.notification_channels_sent IS '实际发送成功的渠道列表';
