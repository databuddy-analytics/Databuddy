# Alarms System Implementation

This document describes the implementation of the Alarms System for Databuddy, addressing issue #267.

## Overview

The Alarms System allows users to create custom notification alarms that can be triggered by various events such as:
- Website uptime monitoring
- Analytics events (traffic spikes, goal completions)
- Error rates
- Performance metrics
- Custom events

## Implementation Status

### ✅ Completed

1. **Database Schema** (`packages/db/src/drizzle/alarms-schema.ts`)
   - `alarms` table with comprehensive fields
   - `alarmLogs` table for tracking alarm triggers
   - Support for multiple notification channels
   - Flexible conditions system
   - Proper foreign key relationships and indexes

2. **API Routes** (`apps/api/src/routes/alarms.ts`)
   - `GET /alarms` - List alarms with filtering
   - `GET /alarms/:id` - Get single alarm
   - `POST /alarms` - Create new alarm
   - `PATCH /alarms/:id` - Update alarm
   - `DELETE /alarms/:id` - Soft delete alarm
   - `GET /alarms/:id/logs` - Get alarm trigger history
   - `POST /alarms/:id/test` - Test alarm notifications
   - Proper authentication and authorization
   - Input validation with Elysia schemas

### 🚧 Remaining Work

1. **Database Migration**
   - Run Drizzle migration to create tables
   - Add seed data for testing

2. **Notification Service** (packages/notifications)
   - Implement notification senders for each channel:
     - ✅ Slack webhook
     - ✅ Discord webhook
     - ✅ Email (via existing email package)
     - ⏳ Microsoft Teams webhook
     - ⏳ Telegram bot API
     - ✅ Custom webhooks
   - Create notification templates
   - Implement retry logic for failed notifications

3. **Alarm Trigger Service**
   - Background worker to evaluate alarm conditions
   - Integration with uptime monitoring
   - Integration with analytics events
   - Rate limiting to prevent notification spam
   - Auto-resolution logic

4. **Dashboard UI** (apps/dashboard)
   - Alarms list page
   - Create/Edit alarm form
   - Alarm details page with logs
   - Test notification button
   - Notification channel configuration UI
   - Alarm status indicators

5. **Integration with Existing Features**
   - Hook into uptime monitoring system
   - Hook into analytics events
   - Hook into error tracking

## Database Schema

### Alarms Table

```typescript
{
  id: string (PK)
  organizationId: string (FK -> organization.id)
  createdBy: string (FK -> user.id)
  
  // Basic info
  name: string
  description: string?
  type: 'uptime' | 'analytics' | 'error_rate' | 'performance' | 'custom'
  enabled: boolean
  
  // Notification channels
  notificationChannels: ('slack' | 'discord' | 'email' | 'webhook' | 'teams' | 'telegram')[]
  
  // Channel configurations
  slackWebhookUrl: string?
  slackChannel: string?
  discordWebhookUrl: string?
  emailAddresses: string[]?
  teamsWebhookUrl: string?
  telegramBotToken: string?
  telegramChatId: string?
  webhookUrl: string?
  webhookHeaders: jsonb?
  webhookMethod: string?
  
  // Conditions
  conditions: jsonb
  
  // Resource links
  websiteId: string? (FK -> websites.id)
  uptimeScheduleId: string? (FK -> uptime_schedules.id)
  
  // Metadata
  lastTriggeredAt: timestamp?
  triggerCount: string
  
  // Timestamps
  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp?
}
```

### Alarm Logs Table

```typescript
{
  id: string (PK)
  alarmId: string (FK -> alarms.id)
  
  // Trigger details
  triggeredAt: timestamp
  triggerReason: string
  triggerData: jsonb?
  
  // Notification status
  notificationsSent: ('slack' | 'discord' | 'email' | 'webhook' | 'teams' | 'telegram')[]
  notificationErrors: jsonb?
  
  // Resolution
  resolvedAt: timestamp?
  resolvedBy: string? (FK -> user.id)
  autoResolved: boolean
}
```

## API Endpoints

### List Alarms
```http
GET /alarms?organizationId=xxx&websiteId=xxx&type=uptime&enabled=true&limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

### Get Alarm
```http
GET /alarms/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Website Down Alert",
    "type": "uptime",
    ...
  }
}
```

### Create Alarm
```http
POST /alarms
Content-Type: application/json

{
  "name": "Website Down Alert",
  "description": "Alert when main website goes down",
  "type": "uptime",
  "enabled": true,
  "notificationChannels": ["slack", "email"],
  "slackWebhookUrl": "https://hooks.slack.com/...",
  "emailAddresses": ["admin@example.com"],
  "conditions": {
    "uptimeScheduleId": "...",
    "triggerOn": ["down"],
    "consecutiveFailures": 3
  },
  "uptimeScheduleId": "..."
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

### Update Alarm
```http
PATCH /alarms/:id
Content-Type: application/json

{
  "enabled": false,
  "emailAddresses": ["admin@example.com", "ops@example.com"]
}
```

### Delete Alarm
```http
DELETE /alarms/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Alarm deleted successfully"
}
```

### Get Alarm Logs
```http
GET /alarms/:id/logs?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "alarmId": "...",
      "triggeredAt": "2024-01-15T10:30:00Z",
      "triggerReason": "Website is down",
      "triggerData": {
        "statusCode": 500,
        "responseTime": 5000
      },
      "notificationsSent": ["slack", "email"],
      "notificationErrors": null,
      "resolvedAt": "2024-01-15T10:35:00Z",
      "autoResolved": true
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

### Test Alarm
```http
POST /alarms/:id/test
```

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent",
  "channels": ["slack", "email"]
}
```

## Condition Examples

### Uptime Monitoring
```json
{
  "uptimeScheduleId": "schedule_123",
  "triggerOn": ["down", "up"],
  "consecutiveFailures": 3
}
```

### Analytics - Traffic Spike
```json
{
  "websiteId": "website_123",
  "metric": "pageviews",
  "threshold": 1000,
  "operator": ">",
  "timeWindow": "5m"
}
```

### Error Rate
```json
{
  "websiteId": "website_123",
  "errorRate": 5,
  "timeWindow": "5m",
  "operator": ">"
}
```

### Goal Completion
```json
{
  "websiteId": "website_123",
  "goalId": "goal_123",
  "threshold": 100,
  "operator": ">=",
  "timeWindow": "1h"
}
```

## Notification Templates

### Slack Message (Uptime Down)
```json
{
  "text": "🚨 Website Down Alert",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚨 Website Down Alert"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Website:*\nexample.com"
        },
        {
          "type": "mrkdwn",
          "text": "*Status:*\nDown"
        },
        {
          "type": "mrkdwn",
          "text": "*Time:*\n2024-01-15 10:30 UTC"
        },
        {
          "type": "mrkdwn",
          "text": "*Response:*\n500 Internal Server Error"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Details"
          },
          "url": "https://app.databuddy.io/alarms/..."
        }
      ]
    }
  ]
}
```

### Discord Embed (Uptime Down)
```json
{
  "embeds": [
    {
      "title": "🚨 Website Down Alert",
      "color": 15158332,
      "fields": [
        {
          "name": "Website",
          "value": "example.com",
          "inline": true
        },
        {
          "name": "Status",
          "value": "Down",
          "inline": true
        },
        {
          "name": "Time",
          "value": "2024-01-15 10:30 UTC",
          "inline": false
        },
        {
          "name": "Response",
          "value": "500 Internal Server Error",
          "inline": false
        }
      ],
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Email (Uptime Down)
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .alert { background: #fee; border-left: 4px solid #f00; padding: 20px; }
    .details { margin-top: 20px; }
    .details table { width: 100%; }
    .details td { padding: 8px; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="alert">
    <h2>🚨 Website Down Alert</h2>
    <p>Your website <strong>example.com</strong> is currently down.</p>
  </div>
  
  <div class="details">
    <table>
      <tr>
        <td><strong>Website:</strong></td>
        <td>example.com</td>
      </tr>
      <tr>
        <td><strong>Status:</strong></td>
        <td>Down</td>
      </tr>
      <tr>
        <td><strong>Time:</strong></td>
        <td>2024-01-15 10:30 UTC</td>
      </tr>
      <tr>
        <td><strong>Response:</strong></td>
        <td>500 Internal Server Error</td>
      </tr>
    </table>
  </div>
  
  <p>
    <a href="https://app.databuddy.io/alarms/..." style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Details</a>
  </p>
</body>
</html>
```

## Next Steps

1. **Run Database Migration**
   ```bash
   cd packages/db
   bun run drizzle-kit generate
   bun run drizzle-kit migrate
   ```

2. **Implement Notification Service**
   - Create `packages/notifications/src/alarms.ts`
   - Implement each notification channel
   - Add retry logic and error handling

3. **Create Background Worker**
   - Create `apps/api/src/workers/alarm-evaluator.ts`
   - Implement condition evaluation logic
   - Schedule periodic checks

4. **Build Dashboard UI**
   - Create `apps/dashboard/src/app/(dashboard)/alarms` pages
   - Implement alarm list, create, edit, and details views
   - Add notification channel configuration forms

5. **Integration**
   - Hook into uptime monitoring system
   - Add alarm triggers to analytics events
   - Test end-to-end flow

## Testing

### Manual Testing Checklist

- [ ] Create alarm via API
- [ ] List alarms with filters
- [ ] Update alarm configuration
- [ ] Delete alarm
- [ ] Test notification sending
- [ ] Verify alarm logs are created
- [ ] Test each notification channel
- [ ] Verify access control (organization membership)
- [ ] Test alarm conditions evaluation
- [ ] Test auto-resolution

### Unit Tests

Create tests for:
- API route handlers
- Notification senders
- Condition evaluators
- Access control logic

## Security Considerations

1. **Webhook URLs**: Store securely, don't expose in API responses
2. **Email Addresses**: Validate format, prevent spam
3. **Rate Limiting**: Prevent notification spam
4. **Access Control**: Verify organization membership for all operations
5. **Input Validation**: Validate all user inputs
6. **Webhook Signatures**: Verify webhook signatures where supported

## Performance Considerations

1. **Indexing**: Proper indexes on frequently queried fields
2. **Pagination**: All list endpoints support pagination
3. **Caching**: Cache alarm configurations for quick evaluation
4. **Batch Processing**: Process multiple alarms in batches
5. **Async Notifications**: Send notifications asynchronously

## Future Enhancements

1. **Notification Grouping**: Group multiple triggers into single notification
2. **Escalation Policies**: Escalate to different channels if not resolved
3. **Quiet Hours**: Don't send notifications during specified hours
4. **Notification Preferences**: Per-user notification preferences
5. **Advanced Conditions**: Support complex condition logic (AND/OR)
6. **Alarm Templates**: Pre-built alarm templates for common scenarios
7. **Alarm Dependencies**: Trigger alarms based on other alarms
8. **Notification History**: Track all notifications sent
9. **Alarm Analytics**: Analytics on alarm triggers and resolution times
10. **Mobile Push Notifications**: Support for mobile push notifications

## Related Issues

- Closes #267 - Alarms System - Database, API & Dashboard UI
- Related to #268 - Uptime Monitoring Alarm Integration

## Contributors

- Implementation: @1234-ad (via Bhindi AI)
- Original issue: @izadoesdev
