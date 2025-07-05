import { BaseEventProcessor, type EventContext } from '../../../core/events/base';
import { sanitizeString, validateSessionId, VALIDATION_LIMITS } from '../../../utils/validation';
import { getGeo } from '../../../utils/ip-geo';
import { parseUserAgent } from '../../../utils/user-agent';
import { storageService } from '../../../core/storage/interface';
import { logger } from '../../../lib/logger';
// @ts-ignore - @databuddy/db may not have type definitions
import type { AnalyticsEvent } from '@databuddy/db';

export interface TrackEvent {
  id?: string;
  type: 'track';
  timestamp: number;
  clientId: string;
  sessionId?: string;
  anonymousId?: string;
  eventId?: string;
  name?: string;
  sessionStartTime?: number;
  path?: string;
  title?: string;
  referrer?: string;
  screen_resolution?: string;
  viewport_size?: string;
  language?: string;
  timezone?: string;
  connection_type?: string;
  rtt?: number;
  downlink?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  load_time?: number;
  dom_ready_time?: number;
  dom_interactive?: number;
  ttfb?: number;
  connection_time?: number;
  request_time?: number;
  render_time?: number;
  redirect_time?: number;
  domain_lookup_time?: number;
  time_on_page?: number;
  scroll_depth?: number;
  interaction_count?: number;
  exit_intent?: number;
  page_count?: number;
  is_bounce?: number;
  has_exit_intent?: boolean;
  page_size?: number;
  fcp?: number;
  lcp?: number;
  cls?: number;
  fid?: number;
  inp?: number;
  href?: string;
  text?: string;
  value?: string | number | boolean;
}

export class TrackEventProcessor extends BaseEventProcessor<TrackEvent> {
  async validate(event: TrackEvent): Promise<boolean> {
    return (
      event.type === 'track' &&
      typeof event.timestamp === 'number' &&
      typeof event.clientId === 'string' &&
      event.clientId.length > 0
    );
  }

  async process(event: TrackEvent, context: EventContext): Promise<void> {
    const eventId = sanitizeString(
      event.eventId,
      VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
    );
    
    if (eventId && await this.checkDuplicate(eventId, 'track')) {
      return;
    }

    const { anonymizedIP, country, region } = await getGeo(context.ip);
    const {
      browserName,
      browserVersion,
      osName,
      osVersion,
      deviceType,
      deviceBrand,
      deviceModel,
    } = parseUserAgent(context.userAgent);
    
    const now = new Date().getTime();

    const trackEvent: any = {
      id: this.generateUUID(),
      client_id: context.clientId,
      event_name: sanitizeString(
        event.name,
        VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
      ),
      anonymous_id: sanitizeString(
        event.anonymousId,
        VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
      ),
      time: typeof event.timestamp === 'number' ? event.timestamp : now,
      session_id: validateSessionId(event.sessionId),
      event_type: 'track',
      event_id: eventId,
      session_start_time:
        typeof event.sessionStartTime === 'number' ? event.sessionStartTime : now,
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : now,

      referrer: sanitizeString(
        event.referrer,
        VALIDATION_LIMITS.STRING_MAX_LENGTH,
      ),
      url: sanitizeString(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
      path: sanitizeString(event.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
      title: sanitizeString(event.title, VALIDATION_LIMITS.STRING_MAX_LENGTH),

      ip: anonymizedIP || '',
      user_agent:
        sanitizeString(context.userAgent, VALIDATION_LIMITS.STRING_MAX_LENGTH) || '',
      browser_name: browserName || '',
      browser_version: browserVersion || '',
      os_name: osName || '',
      os_version: osVersion || '',
      device_type: deviceType || '',
      device_brand: deviceBrand || '',
      device_model: deviceModel || '',
      country: country || '',
      region: region || '',
      city: '',

      screen_resolution: event.screen_resolution,
      viewport_size: event.viewport_size,
      language: event.language,
      timezone: event.timezone,

      connection_type: event.connection_type,
      rtt: event.rtt,
      downlink: event.downlink,

      time_on_page: event.time_on_page,
      scroll_depth: event.scroll_depth,
      interaction_count: event.interaction_count,
      exit_intent: event.exit_intent || 0,
      page_count: event.page_count || 1,
      is_bounce: event.is_bounce || 0,
      has_exit_intent: event.has_exit_intent,
      page_size: event.page_size,

      utm_source: event.utm_source,
      utm_medium: event.utm_medium,
      utm_campaign: event.utm_campaign,
      utm_term: event.utm_term,
      utm_content: event.utm_content,

      load_time: this.validatePerformanceMetric(event.load_time),
      dom_ready_time: this.validatePerformanceMetric(event.dom_ready_time),
      dom_interactive: this.validatePerformanceMetric(event.dom_interactive),
      ttfb: this.validatePerformanceMetric(event.ttfb),
      connection_time: this.validatePerformanceMetric(event.connection_time),
      request_time: this.validatePerformanceMetric(event.request_time),
      render_time: this.validatePerformanceMetric(event.render_time),
      redirect_time: this.validatePerformanceMetric(event.redirect_time),
      domain_lookup_time: this.validatePerformanceMetric(event.domain_lookup_time),

      fcp: this.validatePerformanceMetric(event.fcp),
      lcp: this.validatePerformanceMetric(event.lcp),
      cls: this.validatePerformanceMetric(event.cls),
      fid: this.validatePerformanceMetric(event.fid),
      inp: this.validatePerformanceMetric(event.inp),

      href: event.href,
      text: event.text,
      value: event.value,

      error_message: undefined,
      error_filename: undefined,
      error_lineno: undefined,
      error_colno: undefined,
      error_stack: undefined,
      error_type: undefined,

      properties: '{}',
      created_at: now,
    };

    const result = await storageService.insert('analytics.events', trackEvent);
    
    if (!result.success) {
      logger.error('Failed to insert track event', {
        error: result.error,
        eventId,
      });
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private validatePerformanceMetric(value: unknown): number | undefined {
    if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
      const rounded = Math.round(value);
      return rounded >= 0 && rounded <= 300000 ? rounded : undefined;
    }
    return undefined;
  }

  protected async checkDuplicate(eventId: string, eventType: string): Promise<boolean> {
    const key = `dedup:${eventType}:${eventId}`;
    const exists = await storageService.existsInCache(key);
    
    if (exists) {
      return true;
    }

    const ttl = eventId.startsWith('exit_') ? 172800 : 86400;
    await storageService.setCache(key, '1', ttl);
    return false;
  }
}