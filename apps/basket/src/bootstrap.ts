import { storageService } from './core/storage/interface';
import { eventRegistry } from './core/events/registry';
import { ClickHouseProvider } from './infrastructure/storage/clickhouse-provider';
import { RedisProvider } from './infrastructure/storage/redis-provider';
import { TrackEventProcessor } from './services/analytics/processors/track-processor';
import { logger } from './lib/logger';

/**
 * Bootstrap function to initialize all services and providers
 */
export async function bootstrap() {
  try {
    // Initialize storage providers
    const clickHouseProvider = new ClickHouseProvider();
    const redisProvider = new RedisProvider();
    
    // Register providers
    storageService.registerProvider(clickHouseProvider);
    storageService.registerCacheProvider(redisProvider);
    
    // Initialize event processors
    const trackEventProcessor = new TrackEventProcessor();
    
    // Register event processors
    eventRegistry.register('track', trackEventProcessor);
    
    // Health checks
    const clickHouseHealthy = await clickHouseProvider.isHealthy();
    const redisHealthy = await redisProvider.isHealthy();
    
    logger.info('Bootstrap completed', {
      clickHouseHealthy,
      redisHealthy,
      registeredEventTypes: eventRegistry.getRegisteredTypes(),
    });
    
    if (!clickHouseHealthy) {
      logger.warn('ClickHouse is not healthy');
    }
    
    if (!redisHealthy) {
      logger.warn('Redis is not healthy');
    }
    
  } catch (error) {
    logger.error('Bootstrap failed', { error: error as Error });
    throw error;
  }
}

/**
 * Graceful shutdown function
 */
export async function shutdown() {
  logger.info('Shutting down services...');
  // Add any cleanup logic here
  logger.info('Shutdown complete');
}