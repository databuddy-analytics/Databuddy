import { BaseEventProcessor, type EventContext } from '../../../core/events/base';
import { sanitizeString, validateSessionId, VALIDATION_LIMITS } from '../../../utils/validation';
import { storageService } from '../../../core/storage/interface';
import { logger } from '../../../lib/logger';

export interface ErrorEvent {
  id?: string;
  type: 'error';
  timestamp: number;
  clientId: string;
  sessionId?: string;
  anonymousId?: string;
  eventId?: string;
  payload?: {
    path?: string;
    message?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
    errorType?: string;
  };
}

export class ErrorEventProcessor extends BaseEventProcessor<ErrorEvent> {
  async validate(event: ErrorEvent): Promise<boolean> {
    return (
      event.type === 'error' &&
      typeof event.timestamp === 'number' &&
      typeof event.clientId === 'string' &&
      event.clientId.length > 0 &&
      event.payload !== undefined
    );
  }

  async process(event: ErrorEvent, context: EventContext): Promise<void> {
    const eventId = sanitizeString(
      event.eventId || event.payload?.eventId,
      VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
    );
    
    if (eventId && await this.checkDuplicate(eventId, 'error')) {
      return;
    }

    const payload = event.payload || {};
    const now = new Date().getTime();

    const errorEvent: any = {
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
      message: sanitizeString(
        payload.message,
        VALIDATION_LIMITS.STRING_MAX_LENGTH,
      ),
      filename: sanitizeString(
        payload.filename,
        VALIDATION_LIMITS.STRING_MAX_LENGTH,
      ),
      lineno: payload.lineno,
      colno: payload.colno,
      stack: sanitizeString(payload.stack, VALIDATION_LIMITS.STRING_MAX_LENGTH),
      error_type: sanitizeString(
        payload.errorType,
        VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
      ),
      created_at: now,
    };

    const result = await storageService.insert('analytics.errors', errorEvent);
    
    if (!result.success) {
      logger.error('Failed to insert error event', {
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