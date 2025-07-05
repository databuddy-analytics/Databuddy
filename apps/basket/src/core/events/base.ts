export interface BaseEvent {
  id?: string;
  type: string;
  timestamp: number;
  clientId: string;
  sessionId?: string;
  anonymousId?: string;
}

export interface EventContext {
  ip: string;
  userAgent: string;
  clientId: string;
  ownerId?: string;
  salt: string;
}

export interface EventProcessor<T extends BaseEvent = BaseEvent> {
  process(event: T, context: EventContext): Promise<void>;
  validate(event: T): Promise<boolean>;
}

export interface EventResult {
  success: boolean;
  eventId?: string;
  type: string;
  error?: string;
}

export abstract class BaseEventProcessor<T extends BaseEvent = BaseEvent> implements EventProcessor<T> {
  abstract process(event: T, context: EventContext): Promise<void>;
  abstract validate(event: T): Promise<boolean>;
  
  protected async checkDuplicate(eventId: string, eventType: string): Promise<boolean> {
    // This will be implemented by the storage service
    return false;
  }
}