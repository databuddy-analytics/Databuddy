// Alarms Dashboard UI Component
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Bell, CheckCircle, XCircle, Plus, Trash2, Edit } from 'lucide-react';

interface Alarm {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger_type: string;
  notification_channels: string[];
  last_triggered_at?: string;
  created_at: string;
}

interface AlarmStats {
  total_alarms: number;
  active_alarms: number;
  triggered_today: number;
  failed_today: number;
}

export function AlarmsDashboard() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [stats, setStats] = useState<AlarmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadAlarms();
    loadStats();
  }, []);

  const loadAlarms = async () => {
    try {
      const response = await fetch('/api/alarms');
      const data = await response.json();
      if (data.success) {
        setAlarms(data.data);
      }
    } catch (error) {
      console.error('Failed to load alarms:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/alarms/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const toggleAlarm = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/alarms/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      
      if (response.ok) {
        setAlarms(alarms.map(alarm => 
          alarm.id === id ? { ...alarm, enabled } : alarm
        ));
        loadStats();
      }
    } catch (error) {
      console.error('Failed to toggle alarm:', error);
    }
  };

  const deleteAlarm = async (id: string) => {
    if (!confirm('确定要删除这个告警吗？')) return;
    
    try {
      const response = await fetch(`/api/alarms/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setAlarms(alarms.filter(alarm => alarm.id !== id));
        loadStats();
      }
    } catch (error) {
      console.error('Failed to delete alarm:', error);
    }
  };

  const getTriggerTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      uptime: '⏱️ 正常运行时间',
      traffic_spike: '📈 流量峰值',
      error_rate: '❌ 错误率',
      response_time: '⏳ 响应时间',
      custom: '⚙️ 自定义',
    };
    return labels[type] || type;
  };

  const getChannelIcon = (channel: string) => {
    const icons: Record<string, string> = {
      slack: 'slack',
      discord: 'discord',
      email: '📧',
      webhook: '🔗',
      teams: 'teams',
      telegram: '✈️',
      google_chat: '💬',
    };
    return icons[channel] || channel;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">告警系统</h1>
          <p className="text-muted-foreground">管理和监控你的告警规则</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          创建告警
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总告警数</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_alarms}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">活跃告警</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active_alarms}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">今日触发</CardTitle>
              <Bell className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.triggered_today}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">今日失败</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failed_today}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alarms List */}
      <Card>
        <CardHeader>
          <CardTitle>告警列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : alarms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无告警</p>
              <Button variant="link" onClick={() => setShowCreateModal(true)}>
                创建第一个告警
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {alarms.map((alarm) => (
                <div
                  key={alarm.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{alarm.name}</h3>
                      <Badge variant={alarm.enabled ? 'default' : 'secondary'}>
                        {alarm.enabled ? '活跃' : '已禁用'}
                      </Badge>
                      <Badge variant="outline">
                        {getTriggerTypeLabel(alarm.trigger_type)}
                      </Badge>
                    </div>
                    
                    {alarm.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {alarm.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        通知渠道：{alarm.notification_channels.map(getChannelIcon).join(' ')}
                      </span>
                      {alarm.last_triggered_at && (
                        <span>
                          最后触发：{new Date(alarm.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={alarm.enabled}
                      onCheckedChange={(checked) => toggleAlarm(alarm.id, checked)}
                    />
                    <Button variant="ghost" size="icon">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlarm(alarm.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>创建告警</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div>
                  <Label htmlFor="name">名称</Label>
                  <Input id="name" placeholder="输入告警名称" />
                </div>
                
                <div>
                  <Label htmlFor="description">描述</Label>
                  <Input id="description" placeholder="输入告警描述（可选）" />
                </div>
                
                <div>
                  <Label>触发类型</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择触发类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uptime">正常运行时间</SelectItem>
                      <SelectItem value="traffic_spike">流量峰值</SelectItem>
                      <SelectItem value="error_rate">错误率</SelectItem>
                      <SelectItem value="response_time">响应时间</SelectItem>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>通知渠道</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['slack', 'discord', 'email', 'webhook', 'teams', 'telegram', 'google-chat'].map((channel) => (
                      <Badge key={channel} variant="outline" className="cursor-pointer">
                        {getChannelIcon(channel)} {channel}
                      </Badge>
                    ))}
                  </div>
                </div>
              </form>
              
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  取消
                </Button>
                <Button>创建告警</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
