// Alarms System Integration Tests
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AlarmsService } from '../alarms.service';
import { db } from '@databuddy/db';
import type { CreateAlarmInput } from '../alarms.types';

describe('AlarmsService', () => {
  let service: AlarmsService;
  const testUserId = 'test-user-123';
  const testOrgId = 'test-org-456';

  beforeEach(async () => {
    service = new AlarmsService();
    // 清理测试数据
    await db.alarms.deleteMany({ where: { user_id: testUserId } });
    await db.alarm_logs.deleteMany({});
  });

  afterEach(async () => {
    // 清理测试数据
    await db.alarms.deleteMany({ where: { user_id: testUserId } });
    await db.alarm_logs.deleteMany({});
  });

  describe('createAlarm', () => {
    it('应该成功创建告警', async () => {
      const input: CreateAlarmInput = {
        name: '测试告警',
        description: '这是一个测试告警',
        notification_channels: ['email', 'slack'],
        email_addresses: ['test@example.com'],
        trigger_type: 'uptime',
        trigger_conditions: {
          uptime_threshold: 99.9,
          comparison: 'lt',
        },
        check_interval: 300,
        cooldown_period: 3600,
      };

      const alarm = await service.createAlarm(input, testUserId, testOrgId);

      expect(alarm.id).toBeDefined();
      expect(alarm.name).toBe('测试告警');
      expect(alarm.enabled).toBe(true);
      expect(alarm.notification_channels).toEqual(['email', 'slack']);
      expect(alarm.trigger_type).toBe('uptime');
    });

    it('应该创建启用的告警', async () => {
      const input: CreateAlarmInput = {
        name: '启用的告警',
        notification_channels: ['webhook'],
        webhook_url: 'https://example.com/webhook',
        trigger_type: 'custom',
        trigger_conditions: {},
        enabled: true,
      };

      const alarm = await service.createAlarm(input, testUserId);

      expect(alarm.enabled).toBe(true);
    });

    it('应该创建禁用的告警', async () => {
      const input: CreateAlarmInput = {
        name: '禁用的告警',
        notification_channels: ['discord'],
        discord_webhook_url: 'https://discord.com/api/webhooks/xxx',
        trigger_type: 'error_rate',
        trigger_conditions: {
          error_rate_threshold: 5,
        },
        enabled: false,
      };

      const alarm = await service.createAlarm(input, testUserId);

      expect(alarm.enabled).toBe(false);
    });
  });

  describe('updateAlarm', () => {
    it('应该成功更新告警', async () => {
      // 先创建告警
      const created = await service.createAlarm(
        {
          name: '原始名称',
          notification_channels: ['email'],
          email_addresses: ['original@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
        },
        testUserId
      );

      // 更新告警
      const updated = await service.updateAlarm({
        id: created.id,
        name: '更新后的名称',
        enabled: false,
      });

      expect(updated.name).toBe('更新后的名称');
      expect(updated.enabled).toBe(false);
      expect(updated.id).toBe(created.id);
    });

    it('应该只更新提供的字段', async () => {
      const created = await service.createAlarm(
        {
          name: '测试告警',
          notification_channels: ['slack'],
          slack_webhook_url: 'https://hooks.slack.com/xxx',
          trigger_type: 'traffic_spike',
          trigger_conditions: {
            traffic_increase_percent: 50,
          },
        },
        testUserId
      );

      const updated = await service.updateAlarm({
        id: created.id,
        name: '新名称',
      });

      expect(updated.name).toBe('新名称');
      expect(updated.notification_channels).toEqual(['slack']);
      expect(updated.trigger_type).toBe('traffic_spike');
    });
  });

  describe('deleteAlarm', () => {
    it('应该成功删除告警', async () => {
      const created = await service.createAlarm(
        {
          name: '待删除告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
        },
        testUserId
      );

      await service.deleteAlarm(created.id);

      const deleted = await service.getAlarm(created.id);
      expect(deleted).toBeNull();
    });
  });

  describe('getAlarm', () => {
    it('应该获取告警详情', async () => {
      const created = await service.createAlarm(
        {
          name: '测试告警',
          description: '测试描述',
          notification_channels: ['email', 'webhook'],
          email_addresses: ['test@example.com'],
          webhook_url: 'https://example.com/webhook',
          trigger_type: 'error_rate',
          trigger_conditions: {
            error_rate_threshold: 10,
          },
        },
        testUserId
      );

      const alarm = await service.getAlarm(created.id);

      expect(alarm).not.toBeNull();
      expect(alarm?.id).toBe(created.id);
      expect(alarm?.name).toBe('测试告警');
      expect(alarm?.description).toBe('测试描述');
    });

    it('应该返回 null 对于不存在的告警', async () => {
      const alarm = await service.getAlarm('non-existent-id');
      expect(alarm).toBeNull();
    });
  });

  describe('toggleAlarm', () => {
    it('应该启用告警', async () => {
      const created = await service.createAlarm(
        {
          name: '测试告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
          enabled: false,
        },
        testUserId
      );

      const toggled = await service.toggleAlarm(created.id, true);

      expect(toggled.enabled).toBe(true);
    });

    it('应该禁用告警', async () => {
      const created = await service.createAlarm(
        {
          name: '测试告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
          enabled: true,
        },
        testUserId
      );

      const toggled = await service.toggleAlarm(created.id, false);

      expect(toggled.enabled).toBe(false);
    });
  });

  describe('getUserAlarms', () => {
    it('应该获取用户的告警列表', async () => {
      // 创建多个告警
      await service.createAlarm(
        {
          name: '告警 1',
          notification_channels: ['email'],
          email_addresses: ['test1@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
        },
        testUserId
      );

      await service.createAlarm(
        {
          name: '告警 2',
          notification_channels: ['slack'],
          slack_webhook_url: 'https://hooks.slack.com/xxx',
          trigger_type: 'error_rate',
          trigger_conditions: {},
        },
        testUserId
      );

      const alarms = await service.getUserAlarms(testUserId);

      expect(alarms.length).toBe(2);
      expect(alarms.map(a => a.name)).toEqual(expect.arrayContaining(['告警 1', '告警 2']));
    });

    it('应该按 enabled 过滤', async () => {
      await service.createAlarm(
        {
          name: '启用的告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
          enabled: true,
        },
        testUserId
      );

      await service.createAlarm(
        {
          name: '禁用的告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
          enabled: false,
        },
        testUserId
      );

      const enabledAlarms = await service.getUserAlarms(testUserId, { enabled: true });
      expect(enabledAlarms.length).toBe(1);
      expect(enabledAlarms[0].name).toBe('启用的告警');

      const disabledAlarms = await service.getUserAlarms(testUserId, { enabled: false });
      expect(disabledAlarms.length).toBe(1);
      expect(disabledAlarms[0].name).toBe('禁用的告警');
    });

    it('应该按 trigger_type 过滤', async () => {
      await service.createAlarm(
        {
          name: 'Uptime 告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
        },
        testUserId
      );

      await service.createAlarm(
        {
          name: 'Error Rate 告警',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'error_rate',
          trigger_conditions: {},
        },
        testUserId
      );

      const uptimeAlarms = await service.getUserAlarms(testUserId, { trigger_type: 'uptime' });
      expect(uptimeAlarms.length).toBe(1);
      expect(uptimeAlarms[0].name).toBe('Uptime 告警');
    });
  });

  describe('getAlarmStats', () => {
    it('应该返回告警统计', async () => {
      // 创建测试告警
      await service.createAlarm(
        {
          name: '告警 1',
          notification_channels: ['email'],
          email_addresses: ['test@example.com'],
          trigger_type: 'uptime',
          trigger_conditions: {},
          enabled: true,
        },
        testUserId
      );

      await service.createAlarm(
        {
          name: '告警 2',
          notification_channels: ['slack'],
          slack_webhook_url: 'https://hooks.slack.com/xxx',
          trigger_type: 'error_rate',
          trigger_conditions: {},
          enabled: false,
        },
        testUserId
      );

      const stats = await service.getAlarmStats(testUserId);

      expect(stats.total_alarms).toBe(2);
      expect(stats.active_alarms).toBe(1);
      expect(stats.triggered_today).toBe(0);
      expect(stats.failed_today).toBe(0);
    });
  });
});
