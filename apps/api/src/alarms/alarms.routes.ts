// Alarms API Routes
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { alarmsService } from './alarms.service';
import { authMiddleware } from '../middleware/auth';
import type { CreateAlarmInput, UpdateAlarmInput } from './alarms.types';

const alarmsRouter = new Hono();

// 使用认证中间件
alarmsRouter.use('/*', authMiddleware);

// ========== Schema 验证 ==========

const createAlarmSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  website_id: z.string().optional(),
  enabled: z.boolean().default(true),
  notification_channels: z.array(z.enum(['slack', 'discord', 'email', 'webhook', 'teams', 'telegram', 'google-chat'])),
  slack_webhook_url: z.string().url().optional(),
  discord_webhook_url: z.string().url().optional(),
  teams_webhook_url: z.string().url().optional(),
  telegram_bot_token: z.string().optional(),
  telegram_chat_id: z.string().optional(),
  google_chat_webhook_url: z.string().url().optional(),
  email_addresses: z.array(z.string().email()).optional(),
  webhook_url: z.string().url().optional(),
  webhook_headers: z.record(z.string()).optional(),
  trigger_type: z.enum(['uptime', 'traffic_spike', 'error_rate', 'response_time', 'custom']),
  trigger_conditions: z.object({
    uptime_threshold: z.number().min(0).max(100).optional(),
    downtime_minutes: z.number().min(0).optional(),
    traffic_increase_percent: z.number().min(0).optional(),
    traffic_decrease_percent: z.number().min(0).optional(),
    error_rate_threshold: z.number().min(0).max(100).optional(),
    error_count_threshold: z.number().min(0).optional(),
    response_time_threshold: z.number().min(0).optional(),
    comparison: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']).optional(),
    consecutive_failures: z.number().min(1).optional(),
  }),
  check_interval: z.number().min(60).max(86400).default(300),
  cooldown_period: z.number().min(60).max(86400).default(3600),
});

const updateAlarmSchema = createAlarmSchema.partial().extend({
  id: z.string(),
  enabled: z.boolean().optional(),
});

// ========== 路由 ==========

/**
 * POST /api/alarms
 * 创建告警
 */
alarmsRouter.post('/', zValidator('json', createAlarmSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  
  try {
    const alarm = await alarmsService.createAlarm(
      body as CreateAlarmInput,
      user.id,
      user.organization_id
    );
    
    return c.json({
      success: true,
      data: alarm,
      message: 'Alarm created successfully',
    }, 201);
  } catch (error) {
    console.error('Failed to create alarm:', error);
    return c.json({
      success: false,
      error: 'Failed to create alarm',
    }, 500);
  }
});

/**
 * PUT /api/alarms/:id
 * 更新告警
 */
alarmsRouter.put('/:id', zValidator('json', updateAlarmSchema), async (c) => {
  const body = c.req.valid('json');
  
  try {
    const alarm = await alarmsService.updateAlarm(body as UpdateAlarmInput);
    
    return c.json({
      success: true,
      data: alarm,
      message: 'Alarm updated successfully',
    });
  } catch (error) {
    console.error('Failed to update alarm:', error);
    return c.json({
      success: false,
      error: 'Failed to update alarm',
    }, 500);
  }
});

/**
 * DELETE /api/alarms/:id
 * 删除告警
 */
alarmsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    await alarmsService.deleteAlarm(id);
    
    return c.json({
      success: true,
      message: 'Alarm deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete alarm:', error);
    return c.json({
      success: false,
      error: 'Failed to delete alarm',
    }, 500);
  }
});

/**
 * GET /api/alarms/:id
 * 获取告警详情
 */
alarmsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const alarm = await alarmsService.getAlarm(id);
    
    if (!alarm) {
      return c.json({
        success: false,
        error: 'Alarm not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: alarm,
    });
  } catch (error) {
    console.error('Failed to get alarm:', error);
    return c.json({
      success: false,
      error: 'Failed to get alarm',
    }, 500);
  }
});

/**
 * GET /api/alarms
 * 获取用户的告警列表
 */
alarmsRouter.get('/', async (c) => {
  const user = c.get('user');
  const enabled = c.req.query('enabled');
  const trigger_type = c.req.query('trigger_type') as any;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  
  try {
    const alarms = await alarmsService.getUserAlarms(user.id, {
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
      trigger_type,
      limit,
      offset,
    });
    
    return c.json({
      success: true,
      data: alarms,
      pagination: {
        limit,
        offset,
        total: alarms.length,
      },
    });
  } catch (error) {
    console.error('Failed to get alarms:', error);
    return c.json({
      success: false,
      error: 'Failed to get alarms',
    }, 500);
  }
});

/**
 * POST /api/alarms/:id/toggle
 * 启用/禁用告警
 */
alarmsRouter.post('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const { enabled } = await c.req.json();
  
  try {
    const alarm = await alarmsService.toggleAlarm(id, enabled);
    
    return c.json({
      success: true,
      data: alarm,
      message: `Alarm ${enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    console.error('Failed to toggle alarm:', error);
    return c.json({
      success: false,
      error: 'Failed to toggle alarm',
    }, 500);
  }
});

/**
 * GET /api/alarms/stats
 * 获取告警统计
 */
alarmsRouter.get('/stats', async (c) => {
  const user = c.get('user');
  
  try {
    const stats = await alarmsService.getAlarmStats(user.id);
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Failed to get alarm stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get alarm stats',
    }, 500);
  }
});

export { alarmsRouter };
