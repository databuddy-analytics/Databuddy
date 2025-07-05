# Migration Guide: Old to New Architecture

## Overview

This guide helps you migrate from the old monolithic basket app structure to the new layered architecture. The migration preserves all business logic while providing a cleaner, more maintainable structure.

## Pre-Migration Checklist

- [ ] Backup existing code
- [ ] Ensure all tests pass
- [ ] Document any custom modifications
- [ ] Review performance benchmarks

## Migration Steps

### Step 1: Install New Dependencies

```bash
# If using the new structure, you may need additional type definitions
npm install --save-dev @types/node
```

### Step 2: Update Entry Point

Replace your current `src/index.ts` with the new structured version:

```typescript
// Old: src/index.ts
import { Elysia } from "elysia";
import basketRouter from "./routes/basket";
import stripeRouter from "./routes/stripe";

// New: src/index.ts (or src/index-new.ts)
import { Elysia } from 'elysia';
import { bootstrap } from './bootstrap';
import basketRouter from './routes/basket-new';
import stripeRouter from './routes/stripe';
```

### Step 3: Bootstrap Services

The new architecture requires bootstrapping services:

```typescript
// Add to your startup
import { bootstrap } from './bootstrap';

bootstrap().catch((error) => {
  console.error('Failed to bootstrap application', error);
  process.exit(1);
});
```

### Step 4: Update Route Usage

#### Old Route Usage (basket.ts):
```typescript
// Direct implementation in route
.post("/", async ({ body, query, request }) => {
  // 600+ lines of validation, processing, storage logic
});
```

#### New Route Usage (basket-new.ts):
```typescript
// Service-based approach
.post("/", async ({ body, query, request }) => {
  const response = await analyticsHandler.handleSingleEvent({
    body, query, request
  });
  return response;
});
```

### Step 5: Environment Variables

Add new environment variables for enhanced configuration:

```env
# Storage Configuration
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000
REDIS_HOST=localhost
REDIS_PORT=6379

# Queue Configuration (optional)
QUEUE_PROVIDER=redis
AWS_SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue

# Tracking Providers (optional)
MIXPANEL_TOKEN=your-token
GA_TRACKING_ID=UA-123456789-1
```

## Code Migration Examples

### 1. Validation Logic

#### Old Approach:
```typescript
// In routes/basket.ts
async function validateRequest(body: any, query: any, request: Request) {
  // 100+ lines of validation logic
}
```

#### New Approach:
```typescript
// In services/validation/validator.ts
export class ValidationService {
  async validateRequest(request: ValidationRequest): Promise<ValidationResult> {
    // Same logic, but organized and testable
  }
}

// Usage
const validation = await validationService.validateRequest(request);
```

### 2. Event Processing

#### Old Approach:
```typescript
// In routes/basket.ts
async function insertTrackEvent(trackData: any, clientId: string, userAgent: string, ip: string) {
  // 80+ lines of processing logic
}
```

#### New Approach:
```typescript
// In services/analytics/processors/track-processor.ts
export class TrackEventProcessor extends BaseEventProcessor<TrackEvent> {
  async process(event: TrackEvent, context: EventContext): Promise<void> {
    // Same logic, but organized and extensible
  }
}
```

### 3. Storage Operations

#### Old Approach:
```typescript
// Direct ClickHouse calls
clickHouse.insert({
  table: "analytics.events",
  values: [trackEvent],
  format: "JSONEachRow",
});
```

#### New Approach:
```typescript
// Abstracted through storage service
const result = await storageService.insert('analytics.events', trackEvent);
```

## Testing Migration

### 1. Unit Tests

The new architecture makes unit testing much easier:

```typescript
// Old: Testing was difficult due to mixed concerns
// New: Test individual components
describe('TrackEventProcessor', () => {
  it('should process track events correctly', async () => {
    const processor = new TrackEventProcessor();
    const event = { /* test event */ };
    const context = { /* test context */ };
    
    await processor.process(event, context);
    
    // Assert storage was called correctly
  });
});
```

### 2. Integration Tests

```typescript
// Test with mock providers
const mockStorage = new MockStorageProvider();
storageService.registerProvider(mockStorage);

const response = await analyticsHandler.handleSingleEvent(request);
expect(response.status).toBe('success');
```

## Performance Validation

### 1. Benchmark Comparison

Run performance tests before and after migration:

```bash
# Before migration
npm run test:performance

# After migration
npm run test:performance:new
```

### 2. Memory Usage

Monitor memory usage patterns:

```typescript
// Add memory monitoring
process.on('beforeExit', () => {
  console.log('Memory usage:', process.memoryUsage());
});
```

## Rollback Plan

### Option 1: Gradual Migration

Keep both old and new routes during transition:

```typescript
// Support both endpoints
.use('/v1', oldBasketRouter)    // Old implementation
.use('/v2', newBasketRouter)    // New implementation
```

### Option 2: Feature Flag

Use environment variables to switch between implementations:

```typescript
const useNewArchitecture = process.env.USE_NEW_ARCHITECTURE === 'true';
const basketRouter = useNewArchitecture ? newBasketRouter : oldBasketRouter;
```

## Validation Steps

### 1. Functional Testing

- [ ] All existing API endpoints work
- [ ] Event processing produces same results
- [ ] Validation logic behaves identically
- [ ] Storage operations are equivalent

### 2. Performance Testing

- [ ] Response times are comparable
- [ ] Memory usage is acceptable
- [ ] Error rates are not increased
- [ ] Database load is similar

### 3. Error Handling

- [ ] Error responses match old format
- [ ] Logging continues to work
- [ ] Monitoring alerts still fire
- [ ] Graceful degradation works

## Common Issues and Solutions

### Issue 1: Missing Dependencies

```bash
# Error: Cannot find module 'elysia'
npm install elysia

# Error: Missing type definitions
npm install --save-dev @types/node
```

### Issue 2: Type Errors

```typescript
// If you encounter type errors, use @ts-ignore temporarily
// @ts-ignore - TODO: Fix type definitions
import { someModule } from 'problematic-module';
```

### Issue 3: Service Initialization

```typescript
// Ensure services are initialized before use
if (!storageService.initialized) {
  await bootstrap();
}
```

## Post-Migration Tasks

### 1. Remove Old Code

After successful migration and validation:

```bash
# Archive old implementation
mkdir -p backup
mv src/routes/basket.ts backup/
mv src/routes/stripe.ts backup/
```

### 2. Update Documentation

- [ ] Update API documentation
- [ ] Update deployment guides
- [ ] Update monitoring dashboards
- [ ] Update team onboarding docs

### 3. Monitor and Optimize

- [ ] Set up performance monitoring
- [ ] Optimize slow queries
- [ ] Add missing indexes
- [ ] Review error rates

## Benefits Achieved

After migration, you'll have:

✅ **Cleaner Code Structure**: Separated concerns and organized layers
✅ **Better Testability**: Isolated components and dependency injection
✅ **Enhanced Extensibility**: Easy to add new event types and providers
✅ **Improved Maintainability**: Clear separation of business logic
✅ **Future-Ready Architecture**: Ready for pub/sub, queues, and microservices

## Support

If you encounter issues during migration:

1. Check the [troubleshooting guide](./TROUBLESHOOTING.md)
2. Review the [architecture documentation](./RESTRUCTURE.md)
3. Compare with reference implementation
4. Reach out to the team for support

## Next Steps

After successful migration, consider:

1. **Adding New Event Types**: Implement custom event processors
2. **Queue Integration**: Add background processing capabilities
3. **Monitoring Enhancement**: Implement comprehensive observability
4. **Performance Optimization**: Fine-tune for your specific use case