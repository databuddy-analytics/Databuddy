-- Create alarm_type enum
CREATE TYPE alarm_type AS ENUM ('uptime', 'analytics', 'error_rate', 'performance', 'custom');

-- Create notification_channel enum
CREATE TYPE notification_channel AS ENUM ('slack', 'discord', 'email', 'webhook', 'teams', 'telegram');

-- Create alarms table
CREATE TABLE alarms (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    type alarm_type NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    
    -- Notification channels
    notification_channels notification_channel[] NOT NULL DEFAULT '{}',
    
    -- Slack configuration
    slack_webhook_url TEXT,
    slack_channel TEXT,
    
    -- Discord configuration
    discord_webhook_url TEXT,
    
    -- Email configuration
    email_addresses TEXT[],
    
    -- Microsoft Teams configuration
    teams_webhook_url TEXT,
    
    -- Telegram configuration
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    
    -- Custom webhook configuration
    webhook_url TEXT,
    webhook_headers JSONB,
    webhook_method TEXT DEFAULT 'POST',
    
    -- Alarm conditions
    conditions JSONB NOT NULL,
    
    -- Resource links
    website_id TEXT,
    uptime_schedule_id TEXT,
    
    -- Metadata
    last_triggered_at TIMESTAMP(3),
    trigger_count TEXT DEFAULT '0',
    
    -- Timestamps
    created_at TIMESTAMP(3) DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP(3),
    
    -- Foreign keys
    CONSTRAINT alarms_organization_id_fkey FOREIGN KEY (organization_id) 
        REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT alarms_created_by_fkey FOREIGN KEY (created_by) 
        REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT alarms_website_id_fkey FOREIGN KEY (website_id) 
        REFERENCES websites(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT alarms_uptime_schedule_id_fkey FOREIGN KEY (uptime_schedule_id) 
        REFERENCES uptime_schedules(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Create indexes for alarms table
CREATE INDEX alarms_organization_id_idx ON alarms USING btree (organization_id text_ops);
CREATE INDEX alarms_created_by_idx ON alarms USING btree (created_by text_ops);
CREATE INDEX alarms_website_id_idx ON alarms USING btree (website_id text_ops);
CREATE INDEX alarms_uptime_schedule_id_idx ON alarms USING btree (uptime_schedule_id text_ops);
CREATE INDEX alarms_type_idx ON alarms USING btree (type);
CREATE INDEX alarms_enabled_idx ON alarms USING btree (enabled);

-- Create alarm_logs table
CREATE TABLE alarm_logs (
    id TEXT PRIMARY KEY NOT NULL,
    alarm_id TEXT NOT NULL,
    
    -- Trigger details
    triggered_at TIMESTAMP(3) DEFAULT NOW() NOT NULL,
    trigger_reason TEXT NOT NULL,
    trigger_data JSONB,
    
    -- Notification status
    notifications_sent notification_channel[],
    notification_errors JSONB,
    
    -- Resolution
    resolved_at TIMESTAMP(3),
    resolved_by TEXT,
    auto_resolved BOOLEAN DEFAULT false,
    
    -- Foreign keys
    CONSTRAINT alarm_logs_alarm_id_fkey FOREIGN KEY (alarm_id) 
        REFERENCES alarms(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT alarm_logs_resolved_by_fkey FOREIGN KEY (resolved_by) 
        REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Create indexes for alarm_logs table
CREATE INDEX alarm_logs_alarm_id_idx ON alarm_logs USING btree (alarm_id text_ops);
CREATE INDEX alarm_logs_triggered_at_idx ON alarm_logs USING btree (triggered_at);

-- Add comments for documentation
COMMENT ON TABLE alarms IS 'User-configurable alarms for monitoring and notifications';
COMMENT ON TABLE alarm_logs IS 'History of alarm triggers and notifications';
COMMENT ON COLUMN alarms.conditions IS 'Flexible JSON structure for alarm trigger conditions';
COMMENT ON COLUMN alarms.notification_channels IS 'Array of enabled notification channels';
COMMENT ON COLUMN alarm_logs.trigger_data IS 'Additional context data about what triggered the alarm';
COMMENT ON COLUMN alarm_logs.notification_errors IS 'Errors that occurred while sending notifications';
