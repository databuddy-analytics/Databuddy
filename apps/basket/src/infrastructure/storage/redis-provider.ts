import { CacheProvider } from '../../core/storage/interface';
import { logger } from '../../lib/logger';
// @ts-ignore - @databuddy/redis may not have type definitions
import { redis } from '@databuddy/redis';

export class RedisProvider implements CacheProvider {
  name = 'redis';

  async get(key: string): Promise<string | null> {
    try {
      return await redis.get(key);
    } catch (error) {
      logger.error(`Failed to get key ${key} from Redis`, { error: error as Error });
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      logger.error(`Failed to set key ${key} in Redis`, { error: error as Error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Failed to check existence of key ${key} in Redis`, { error: error as Error });
      return false;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error(`Failed to delete key ${key} from Redis`, { error: error as Error });
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await redis.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed', { error: error as Error });
      return false;
    }
  }
}