import { validationService } from '../../services/validation/validator';
import { eventRegistry } from '../../core/events/registry';
import { VALIDATION_LIMITS } from '../../utils/validation';
import { logger } from '../../lib/logger';
import { createHash } from 'crypto';
import { storageService } from '../../core/storage/interface';

export interface AnalyticsHandlerRequest {
  body: any;
  query: any;
  request: Request;
}

export interface AnalyticsHandlerResponse {
  status: string;
  type?: string;
  message?: string;
  batch?: boolean;
  processed?: number;
  results?: any[];
}

export class AnalyticsHandler {
  async getDailySalt(): Promise<string> {
    const saltKey = `salt:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
    let salt = await storageService.getCache(saltKey);
    
    if (!salt) {
      salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await storageService.setCache(saltKey, salt, 60 * 60 * 24);
    }
    
    return salt;
  }

  saltAnonymousId(anonymousId: string, salt: string): string {
    return createHash('sha256')
      .update(anonymousId + salt)
      .digest('hex');
  }

  async handleSingleEvent(request: AnalyticsHandlerRequest): Promise<AnalyticsHandlerResponse> {
    const validation = await validationService.validateRequest(request);
    
    if (!validation.success) {
      return {
        status: 'error',
        message: validation.error?.message || 'Validation failed'
      };
    }

    const { clientId, userAgent, ip, ownerId } = validation.data!;
    const salt = await this.getDailySalt();
    
    // Salt the anonymous ID if present
    if (request.body.anonymous_id) {
      request.body.anonymous_id = this.saltAnonymousId(request.body.anonymous_id, salt);
    }

    const eventType = request.body.type || 'track';
    const event = {
      ...request.body,
      type: eventType,
      clientId,
      timestamp: request.body.timestamp || Date.now()
    };

    const context = {
      ip,
      userAgent,
      clientId,
      ownerId,
      salt
    };

    const result = await eventRegistry.process(event, context);

    if (result.success) {
      return {
        status: 'success',
        type: eventType
      };
    } else {
      return {
        status: 'error',
        message: result.error || 'Processing failed'
      };
    }
  }

  async handleBatchEvents(request: AnalyticsHandlerRequest): Promise<AnalyticsHandlerResponse> {
    if (!Array.isArray(request.body)) {
      return {
        status: 'error',
        message: 'Batch endpoint expects array of events'
      };
    }

    if (request.body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
      return {
        status: 'error', 
        message: 'Batch too large'
      };
    }

    const validation = await validationService.validateRequest(request);
    
    if (!validation.success) {
      return {
        status: 'error',
        message: validation.error?.message || 'Validation failed',
        batch: true
      };
    }

    const { clientId, userAgent, ip, ownerId } = validation.data!;
    const salt = await this.getDailySalt();

    // Salt anonymous IDs
    for (const event of request.body) {
      if (event.anonymous_id) {
        event.anonymous_id = this.saltAnonymousId(event.anonymous_id, salt);
      }
    }

    const events = request.body.map((event: any) => ({
      ...event,
      type: event.type || 'track',
      clientId,
      timestamp: event.timestamp || Date.now()
    }));

    const context = {
      ip,
      userAgent,
      clientId,
      ownerId,
      salt
    };

    const results = await eventRegistry.processBatch(events, context);

    return {
      status: 'success',
      batch: true,
      processed: results.length,
      results
    };
  }
}

// Global analytics handler instance
export const analyticsHandler = new AnalyticsHandler();