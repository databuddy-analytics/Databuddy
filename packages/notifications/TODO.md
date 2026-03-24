# Notifications Package TODO

## Database & Alarms System

- [ ] Create database table for "Alarms"
  - User-configurable alarms
  - Fields:
    - `id` - Unique identifier
    - `user_id` / `organization_id` - Owner
    - `name` - Alarm name
    - `description` - Alarm description
    - `enabled` - Whether alarm is active
    - `notification_channels` - Array of channels (slack, discord, email, webhook, teams, telegram, google-chat)
    - `slack_webhook_url` - Optional Slack webhook URL
    - `discord_webhook_url` - Optional Discord webhook URL
    - `teams_webhook_url` - Optional Teams webhook URL
    - `telegram_bot_token` + `telegram_chat_id` - Optional Telegram config
    - `google_chat_webhook_url` - Optional Google Chat webhook URL
    - `email_addresses` - Array of email addresses
    - `webhook_url` - Optional custom webhook URL
    - `webhook_headers` - JSON object for custom webhook headers
    - `conditions` - JSON object for alarm conditions/triggers
    - `created_at` - Timestamp
    - `updated_at` - Timestamp
  - Support assigning alarms to:
    - Websites (uptime monitoring)
    - Analytics events (traffic spikes, goal completions)
    - Error rates
    - Performance metrics
    - Custom events

## Uptime Monitoring Integration

- [ ] Add alarm integration for uptime tracking
  - Trigger when site goes down
  - Trigger when site comes back up
  - Configurable thresholds (e.g., alert after X consecutive failures)
  - Support multiple notification channels per alarm
  - Include site details in notification (URL, status code, response time, etc.)

## Additional Notification Providers

- [x] **Slack** - Webhook support
- [x] **Discord** - Webhook support
- [x] **Email** - Injected send function
- [x] **Webhook** - Generic HTTP webhook
- [x] **Microsoft Teams** - Adaptive Cards via webhook
- [x] **Telegram** - Bot API (sendMessage)
- [x] **Google Chat** - Cards via webhook
- [ ] **PagerDuty** - Integration for incident management
- [ ] **Opsgenie** - Alerting and on-call management
- [ ] **SMS/Twilio** - SMS notifications via Twilio API
- [ ] **Pushover** - Push notifications for mobile devices
- [ ] **Mattermost** - Webhook support (Slack-compatible format)

## Notification Templates & Branding

- [ ] Create reusable notification templates
  - Good templates with nice branding
  - Clean, professional design
  - Reusable across all channels
  - Support for:
    - Brand colors and logos
    - Consistent formatting
    - Variable substitution (e.g., `{{website}}`, `{{errorRate}}`)
    - Channel-specific optimizations (Slack blocks, Discord embeds, HTML emails)
    - Template inheritance/composition
  - Pre-built templates for common scenarios:
    - Uptime alerts (site down/up)
    - Traffic spikes
    - Error rate warnings
    - Goal completions
    - Weekly/monthly reports
    - Deployment notifications
  - Template editor/management UI
  - Preview functionality

## Future Enhancements

- [ ] Rate limiting per channel/user
- [ ] Notification history/logging
- [ ] Webhook signature verification utilities
- [ ] Batch notification sending
- [ ] Scheduled notifications (cron-like)
- [ ] Notification preferences per user/organization
- [ ] Notification grouping/deduplication
- [ ] Rich formatting helpers (tables, code blocks, etc.)
- [ ] Attachment support (files, images)
- [ ] Interactive notifications (buttons, actions)
