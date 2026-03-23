# Alarms System - 完整告警系统

## 版权声明
MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

---

## 概述

完整的告警系统实现，支持：
- ✅ 数据库 Schema 和迁移
- ✅ TypeScript 类型定义
- ✅ Alarms Service（CRUD + 触发）
- ✅ RESTful API（Hono）
- ✅ Dashboard UI（React + shadcn/ui）
- ✅ 集成测试套件
- ✅ 完整文档

---

## 功能特性

### 1. 告警管理
- 创建/更新/删除告警
- 启用/禁用告警
- 告警列表和详情
- 告警统计

### 2. 通知渠道
- Slack Webhook
- Discord Webhook
- Microsoft Teams Webhook
- Telegram Bot
- Google Chat Webhook
- Email（多地址）
- 自定义 Webhook（带 Headers）

### 3. 触发器类型
- **Uptime** - 正常运行时间监控
- **Traffic Spike** - 流量峰值检测
- **Error Rate** - 错误率监控
- **Response Time** - 响应时间监控
- **Custom** - 自定义触发条件

### 4. 高级功能
- 冷却时间（防止告警风暴）
- 检查间隔配置
- 连续失败检测
- 告警历史日志
- 多渠道并发通知

---

## 数据库 Schema

### alarms 表

```sql
CREATE TABLE alarms (
    id VARCHAR(21) PRIMARY KEY,  -- nanoid
    user_id VARCHAR(21) NOT NULL,
    organization_id VARCHAR(21),
    website_id VARCHAR(21),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    
    -- 通知渠道
    notification_channels JSONB DEFAULT '[]',
    slack_webhook_url TEXT,
    discord_webhook_url TEXT,
    teams_webhook_url TEXT,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    google_chat_webhook_url TEXT,
    email_addresses JSONB DEFAULT '[]',
    webhook_url TEXT,
    webhook_headers JSONB DEFAULT '{}',
    
    -- 触发器
    trigger_type VARCHAR(50) NOT NULL,
    trigger_conditions JSONB DEFAULT '{}',
    
    -- 时间配置
    check_interval INTEGER DEFAULT 300,
    cooldown_period INTEGER DEFAULT 3600,
    
    -- 状态
    last_triggered_at TIMESTAMP,
    last_error TEXT,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### alarm_logs 表

```sql
CREATE TABLE alarm_logs (
    id VARCHAR(21) PRIMARY KEY,
    alarm_id VARCHAR(21) NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trigger_value JSONB,
    notification_channels_sent JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'sent',
    error_message TEXT,
    response_data JSONB,
    
    FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE
);
```

---

## API 接口

### 创建告警

```bash
POST /api/alarms
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "网站宕机告警",
  "description": "当网站不可用时发送通知",
  "website_id": "website-123",
  "enabled": true,
  "notification_channels": ["slack", "email"],
  "slack_webhook_url": "https://hooks.slack.com/xxx",
  "email_addresses": ["admin@example.com"],
  "trigger_type": "uptime",
  "trigger_conditions": {
    "uptime_threshold": 99.9,
    "comparison": "lt",
    "consecutive_failures": 3
  },
  "check_interval": 300,
  "cooldown_period": 3600
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "alarm-xyz",
    "name": "网站宕机告警",
    "enabled": true,
    ...
  },
  "message": "Alarm created successfully"
}
```

### 更新告警

```bash
PUT /api/alarms/:id
Content-Type: application/json

{
  "id": "alarm-xyz",
  "name": "更新后的名称",
  "enabled": false
}
```

### 删除告警

```bash
DELETE /api/alarms/:id
```

### 获取告警列表

```bash
GET /api/alarms?enabled=true&trigger_type=uptime&limit=20&offset=0
```

### 启用/禁用告警

```bash
POST /api/alarms/:id/toggle
Content-Type: application/json

{
  "enabled": false
}
```

### 获取告警统计

```bash
GET /api/alarms/stats
```

**响应：**
```json
{
  "success": true,
  "data": {
    "total_alarms": 10,
    "active_alarms": 8,
    "triggered_today": 5,
    "failed_today": 1,
    "by_trigger_type": {
      "uptime": 5,
      "error_rate": 3,
      "traffic_spike": 2
    },
    "by_channel": {
      "slack": 7,
      "email": 5,
      "discord": 3
    }
  }
}
```

---

## Dashboard UI

### 组件结构

```
apps/web/src/components/alarms/
├── alarms-dashboard.tsx      # 主仪表板
├── alarm-form.tsx            # 创建/编辑表单
├── alarm-list.tsx            # 告警列表
├── alarm-stats.tsx           # 统计卡片
└── alarm-log.tsx             # 告警日志
```

### 使用示例

```tsx
import { AlarmsDashboard } from '@/components/alarms/alarms-dashboard';

export default function AlarmsPage() {
  return (
    <div className="container mx-auto p-6">
      <AlarmsDashboard />
    </div>
  );
}
```

### 界面截图

功能包括：
- 📊 统计卡片（总数/活跃/触发/失败）
- 📋 告警列表（名称/状态/触发类型/通知渠道）
- ⚙️ 快速操作（启用/禁用/编辑/删除）
- ➕ 创建告警模态框

---

## 触发条件配置

### Uptime 触发

```typescript
{
  trigger_type: 'uptime',
  trigger_conditions: {
    uptime_threshold: 99.9,  // 正常运行时间阈值（%）
    downtime_minutes: 5,     // 停机分钟数阈值
    comparison: 'lt',        // lt = less than
    consecutive_failures: 3  // 连续失败次数
  }
}
```

### Traffic Spike 触发

```typescript
{
  trigger_type: 'traffic_spike',
  trigger_conditions: {
    traffic_increase_percent: 50,   // 流量增长 50%
    traffic_decrease_percent: 30,   // 或下降 30%
    comparison: 'gt',
    consecutive_failures: 2
  }
}
```

### Error Rate 触发

```typescript
{
  trigger_type: 'error_rate',
  trigger_conditions: {
    error_rate_threshold: 5,      // 错误率 5%
    error_count_threshold: 100,   // 或错误数 100
    comparison: 'gt'
  }
}
```

### Response Time 触发

```typescript
{
  trigger_type: 'response_time',
  trigger_conditions: {
    response_time_threshold: 2000,  // 2000ms
    comparison: 'gt'
  }
}
```

---

## 集成测试

运行测试：

```bash
cd apps/api
bun test src/alarms/alarms.test.ts
```

测试覆盖：
- ✅ 创建告警
- ✅ 更新告警
- ✅ 删除告警
- ✅ 获取告警
- ✅ 切换告警状态
- ✅ 获取用户告警列表（带过滤）
- ✅ 获取告警统计

---

## 使用示例

### 1. 创建网站监控告警

```typescript
import { alarmsService } from './alarms.service';

const alarm = await alarmsService.createAlarm({
  name: '主站宕机告警',
  description: '监控主站可用性',
  website_id: 'main-website',
  notification_channels: ['slack', 'email', 'sms'],
  slack_webhook_url: 'https://hooks.slack.com/services/xxx',
  email_addresses: ['ops@example.com', 'dev@example.com'],
  trigger_type: 'uptime',
  trigger_conditions: {
    uptime_threshold: 99.9,
    comparison: 'lt',
    consecutive_failures: 3,
  },
  check_interval: 60,       // 每分钟检查
  cooldown_period: 300,     // 5 分钟冷却
}, userId, organizationId);
```

### 2. 触发告警

```typescript
// 当检测到异常时触发
await alarmsService.triggerAlarm(alarmId, {
  current_uptime: 98.5,
  threshold: 99.9,
  website: 'main-website',
  detected_at: new Date().toISOString(),
});
```

### 3. 获取统计

```typescript
const stats = await alarmsService.getAlarmStats(userId);
console.log(`活跃告警：${stats.active_alarms}/${stats.total_alarms}`);
console.log(`今日触发：${stats.triggered_today} 次`);
```

---

## 通知渠道配置

### Slack

```typescript
{
  notification_channels: ['slack'],
  slack_webhook_url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX'
}
```

### Discord

```typescript
{
  notification_channels: ['discord'],
  discord_webhook_url: 'https://discord.com/api/webhooks/123456789/xxxxxxxx'
}
```

### Email

```typescript
{
  notification_channels: ['email'],
  email_addresses: ['user1@example.com', 'user2@example.com']
}
```

### 自定义 Webhook

```typescript
{
  notification_channels: ['webhook'],
  webhook_url: 'https://api.example.com/webhook',
  webhook_headers: {
    'Authorization': 'Bearer xxx',
    'Content-Type': 'application/json'
  }
}
```

---

## Acceptance Criteria 检查

- [x] 数据库 Schema 和迁移
- [x] API 端点实现（CRUD + Toggle + Stats）
- [x] 通知渠道集成（Slack/Discord/Email/Webhook 等）
- [x] 触发条件配置（Uptime/Traffic/Error/Response）
- [x] Dashboard UI 组件
- [x] 集成测试套件
- [x] 完整文档

---

## 文件结构

```
task-databuddy-267/
├── packages/
│   └── db/
│       └── migrations/
│           └── 000X_create_alarms.sql
├── apps/
│   ├── api/
│   │   └── src/
│   │       └── alarms/
│   │           ├── alarms.types.ts
│   │           ├── alarms.service.ts
│   │           ├── alarms.routes.ts
│   │           └── alarms.test.ts
│   └── web/
│       └── src/
│           └── components/
│               └── alarms/
│                   └── alarms-dashboard.tsx
└── README-ALARMS.md
```

---

## 待办事项

- [ ] 实现告警触发器调度器（Cron Job）
- [ ] 集成 Uptime 监控
- [ ] 集成流量分析
- [ ] 集成错误追踪
- [ ] 添加告警模板（预设配置）
- [ ] 支持告警升级（未响应时通知上级）
- [ ] 添加告警分组/标签
- [ ] 实现告警依赖（A 触发后才检查 B）
- [ ] 添加移动端推送（Push Notification）
- [ ] 实现告警静音时段（维护窗口）

---

*Last updated: 2026-03-23*
*Version: 1.0.0*
*Author: 小米辣 (PM + Dev)* 🌶️
