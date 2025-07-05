import { StorageProvider, type StorageResult, type BatchStorageResult } from '../../core/storage/interface';
import { logger } from '../../lib/logger';
// @ts-ignore - @databuddy/db may not have type definitions
import { clickHouse } from '@databuddy/db';

export class ClickHouseProvider implements StorageProvider {
  name = 'clickhouse';

  async insert<T>(table: string, data: T): Promise<StorageResult<T>> {
    try {
      await clickHouse.insert({
        table,
        values: [data],
        format: 'JSONEachRow',
      });

      return {
        success: true,
        data
      };
    } catch (error) {
      logger.error(`Failed to insert data into ${table}`, { error: error as Error });
      return {
        success: false,
        error: `Failed to insert data: ${error}`
      };
    }
  }

  async insertBatch<T>(table: string, data: T[]): Promise<BatchStorageResult> {
    try {
      await clickHouse.insert({
        table,
        values: data,
        format: 'JSONEachRow',
      });

      return {
        success: true,
        processed: data.length,
        errors: []
      };
    } catch (error) {
      logger.error(`Failed to insert batch data into ${table}`, { error: error as Error });
      return {
        success: false,
        processed: 0,
        errors: [`Failed to insert batch data: ${error}`]
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check - try to query a lightweight operation
      await clickHouse.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('ClickHouse health check failed', { error: error as Error });
      return false;
    }
  }
}