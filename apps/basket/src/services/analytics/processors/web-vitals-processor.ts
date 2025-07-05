import { BaseEventProcessor, type EventContext } from '../../../core/events/base';
import { sanitizeString, validateSessionId, VALIDATION_LIMITS } from '../../../utils/validation';
import { storageService } from '../../../core/storage/interface';
import { logger } from '../../../lib/logger';

export interface WebVitalsEvent {
  id?: string;
  type: 'web_vitals';
  timestamp: number;
  clientId: string;
  sessionId?: string;
  anonymousId?: string;
  eventId?: string;
  payload?: {
    path?: string;
    fcp?: number;
    lcp?: number;
    cls?: number;
    fid?: number;
    inp?: number;
  };
}

export class WebVitalsEventProcessor extends BaseEventProcessor<WebVitalsEvent> {
  async validate(event: WebVitalsEvent): Promise<boolean> {
    return (
      event.type === 'web_vitals' &&
      typeof event.timestamp === 'number' &&
      typeof event.clientId === 'string' &&
      event.clientId.length > 0 &&
      event.payload !== undefined
    );
  }

  async process(event: WebVitalsEvent, context: EventContext): Promise<void> {
    const eventId = sanitizeString(
      event.eventId || event.payload?.eventId,
      VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
    );
    
    if (eventId && await this.checkDuplicate(eventId, 'web_vitals')) {
      return;
    }

    const payload = event.payload || {};
    const now = new Date().getTime();

    const webVitalsEvent: any = {
      id: this.generateUUID(),
      client_id: context.clientId,
      event_id: eventId,
      anonymous_id: sanitizeString(
        event.anonymousId || payload.anonymousId,
        VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
      ),
      session_id: validateSessionId(event.sessionId || payload.sessionId),
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : now,
      path: sanitizeString(payload.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
      fcp: this.validatePerformanceMetric(payload.fcp),
      lcp: this.validatePerformanceMetric(payload.lcp),
      cls: this.validatePerformanceMetric(payload.cls),
      fid: this.validatePerformanceMetric(payload.fid),
      inp: this.validatePerformanceMetric(payload.inp),
      created_at: now,
    };

    const result = await storageService.insert('analytics.web_vitals', webVitalsEvent);
    
    if (!result.success) {
      logger.error('Failed to insert web vitals event', {
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