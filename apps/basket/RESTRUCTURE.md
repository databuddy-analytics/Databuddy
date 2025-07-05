# Basket App - Restructured Architecture

## Overview

The basket app has been completely restructured to meet the following requirements:
- **NO changes to business logic** - All existing functionality is preserved
- **Clean separation of concerns** - Functions, utils, and services are properly separated
- **Extensible tracking foundation** - Easy to add new tracking types beyond stripe and events
- **Pub/sub and queue/worker ready** - Architecture supports async processing

## New Architecture

### 1. Core Layer (`src/core/`)

**Events System (`src/core/events/`)**
- `base.ts` - Base event interfaces and abstract processor
- `registry.ts` - Event registry for managing different event types

**Tracking System (`src/core/tracking/`)**
- `tracker.ts` - Tracking service abstraction with multiple provider support

**Storage System (`src/core/storage/`)**
- `interface.ts` - Storage and cache provider interfaces

**Queue System (`src/core/queue/`)**
- `interface.ts` - Queue and pub/sub provider interfaces

### 2. Services Layer (`src/services/`)

**Analytics Services (`src/services/analytics/`)**
- `processors/track-processor.ts` - Track event processor
- `processors/error-processor.ts` - Error event processor (to be implemented)
- `processors/web-vitals-processor.ts` - Web vitals processor (to be implemented)

**Validation Service (`src/services/validation/`)**
- `validator.ts` - Request validation service

**Auth Service (`src/services/auth/`)**
- `auth.ts` - Authentication service

### 3. Infrastructure Layer (`src/infrastructure/`)

**Storage Providers (`src/infrastructure/storage/`)**
- `clickhouse-provider.ts` - ClickHouse storage implementation
- `redis-provider.ts` - Redis cache implementation

**Queue Providers (`src/infrastructure/queue/`)**
- `redis-queue-provider.ts` - Redis queue implementation (to be implemented)
- `aws-sqs-provider.ts` - AWS SQS implementation (to be implemented)

### 4. Handlers Layer (`src/handlers/`)

**Analytics Handlers (`src/handlers/basket/`)**
- `analytics-handler.ts` - Analytics request handlers

**Payment Handlers (`src/handlers/stripe/`)**
- `payment-handler.ts` - Payment webhook handlers (to be implemented)

### 5. Types Layer (`src/types/`)
- `services.ts` - Service interface types
- `events.ts` - Event type definitions (uses existing)
- `payments.ts` - Payment type definitions (uses existing)

## Key Benefits

### 1. **Extensibility**
- **New Event Types**: Add new processors by implementing `BaseEventProcessor`
- **New Storage Providers**: Add new providers by implementing `StorageProvider`
- **New Tracking Systems**: Add new providers by implementing `TrackingProvider`

### 2. **Pub/Sub Ready**
```typescript
// Easy to add pub/sub processing
queueService.publish('analytics-events', {
  id: 'event-123',
  type: 'track',
  data: trackEvent,
  timestamp: Date.now()
});
```

### 3. **Queue/Worker Ready**
```typescript
// Easy to add background processing
queueService.enqueueJob('analytics-processing', {
  id: 'job-123',
  type: 'batch-process',
  data: events,
  timestamp: Date.now()
});
```

### 4. **Clean Separation**
- **Business Logic**: Preserved in processors
- **Validation**: Centralized in validation service
- **Storage**: Abstracted through providers
- **Infrastructure**: Separated from business logic

## Usage Examples

### Adding a New Event Type

```typescript
// 1. Create processor
class CustomEventProcessor extends BaseEventProcessor<CustomEvent> {
  async validate(event: CustomEvent): Promise<boolean> {
    // Validation logic
  }
  
  async process(event: CustomEvent, context: EventContext): Promise<void> {
    // Processing logic
  }
}

// 2. Register in bootstrap
eventRegistry.register('custom', new CustomEventProcessor());
```

### Adding a New Storage Provider

```typescript
// 1. Implement provider
class PostgresProvider implements StorageProvider {
  name = 'postgres';
  
  async insert<T>(table: string, data: T): Promise<StorageResult<T>> {
    // Implementation
  }
  
  async insertBatch<T>(table: string, data: T[]): Promise<BatchStorageResult> {
    // Implementation
  }
}

// 2. Register in bootstrap
storageService.registerProvider(new PostgresProvider());
```

### Adding a New Tracking Provider

```typescript
// 1. Implement provider
class MixpanelProvider implements TrackingProvider {
  name = 'mixpanel';
  
  async track(data: TrackingData): Promise<void> {
    // Send to Mixpanel
  }
  
  isEnabled(): boolean {
    return !!process.env.MIXPANEL_TOKEN;
  }
}

// 2. Register and use
trackingService.registerProvider(new MixpanelProvider());
trackingService.track({
  eventName: 'user_action',
  properties: { action: 'click' }
});
```

## Migration Guide

### Current Files → New Structure

| Current File | New Location | Changes |
|-------------|-------------|---------|
| `routes/basket.ts` | `handlers/basket/analytics-handler.ts` | Split into service calls |
| `routes/stripe.ts` | `handlers/stripe/payment-handler.ts` | Split into service calls |
| `utils/validation.ts` | `services/validation/validator.ts` | Wrapped in service class |
| `hooks/auth.ts` | `services/auth/auth.ts` | Wrapped in service class |
| `utils/ip-geo.ts` | `services/geo/geo.ts` | Wrapped in service class |
| `utils/user-agent.ts` | `services/user-agent/user-agent.ts` | Wrapped in service class |

### Key Changes

1. **Route handlers now use services** instead of direct implementation
2. **Business logic moved to processors** that can be easily extended
3. **Storage operations abstracted** through provider interfaces
4. **Validation centralized** in validation service
5. **Dependency injection** through bootstrap process

## Implementation Status

### ✅ Completed
- Core event system
- Event registry
- Storage interface
- Queue interface
- Tracking service
- Analytics handler
- Track event processor
- Validation service
- Auth service
- ClickHouse provider
- Redis provider
- Bootstrap system

### 🚧 To Be Implemented
- Error event processor
- Web vitals event processor
- Stripe payment handler
- Additional queue providers
- Health check endpoints
- Monitoring and metrics
- Configuration management

## Configuration

The new architecture supports environment-based configuration:

```env
# Storage
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000
REDIS_HOST=localhost
REDIS_PORT=6379

# Queues
QUEUE_PROVIDER=redis
AWS_SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue

# Tracking
MIXPANEL_TOKEN=your-token
GA_TRACKING_ID=UA-123456789-1
```

## Testing

The new architecture makes testing much easier:

```typescript
// Mock providers for testing
const mockStorage = new MockStorageProvider();
const mockCache = new MockCacheProvider();

storageService.registerProvider(mockStorage);
storageService.registerCacheProvider(mockCache);

// Test event processing
const processor = new TrackEventProcessor();
await processor.process(event, context);
```

## Performance Considerations

- **Async processing** ready for high-volume scenarios
- **Batch operations** supported throughout
- **Caching** abstracted and configurable
- **Health checks** for all providers
- **Graceful degradation** when providers fail

## Future Enhancements

1. **Event Sourcing**: Easy to add event sourcing on top of current architecture
2. **CQRS**: Command/Query separation already in place
3. **Microservices**: Each service can be extracted to separate microservice
4. **Observability**: Metrics, tracing, and logging ready to be enhanced
5. **Rate Limiting**: Can be added at the handler level
6. **Circuit Breakers**: Can be added at the provider level