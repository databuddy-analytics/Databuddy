import type { BaseEvent, EventProcessor, EventContext, EventResult } from './base';

export class EventRegistry {
  private processors = new Map<string, EventProcessor>();
  
  register<T extends BaseEvent>(eventType: string, processor: EventProcessor<T>): void {
    this.processors.set(eventType, processor);
  }
  
  async process(event: BaseEvent, context: EventContext): Promise<EventResult> {
    const processor = this.processors.get(event.type);
    
    if (!processor) {
      return {
        success: false,
        type: event.type,
        error: 'Unknown event type'
      };
    }
    
    try {
      const isValid = await processor.validate(event);
      if (!isValid) {
        return {
          success: false,
          type: event.type,
          error: 'Invalid event data'
        };
      }
      
      await processor.process(event, context);
      
      return {
        success: true,
        type: event.type,
        eventId: event.id
      };
    } catch (error) {
      return {
        success: false,
        type: event.type,
        error: String(error)
      };
    }
  }
  
  async processBatch(events: BaseEvent[], context: EventContext): Promise<EventResult[]> {
    const results = await Promise.all(
      events.map(event => this.process(event, context))
    );
    
    return results;
  }
  
  getRegisteredTypes(): string[] {
    return Array.from(this.processors.keys());
  }
}

// Global registry instance
export const eventRegistry = new EventRegistry();