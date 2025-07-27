import { chQuery, db } from '@databuddy/db';
import { redis } from '@databuddy/redis';
import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

const checkClickhouse = async () => {
	try {
		const result = await chQuery('SELECT 1 FROM analytics.events LIMIT 1');
		return result.length > 0;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error('[ClickHouse]: Health check failed', {
			error: errorMessage,
		});
		return false;
	}
};

const checkDatabase = async () => {
	try {
		const result = await db.query.websites.findMany({
			limit: 1,
		});
		return result.length > 0;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error('[Database]: Health check failed', {
			errorMessage,
		});
		return false;
	}
};

const checkRedis = async () => {
	try {
		const result = await redis.ping();
		return result === 'PONG';
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error('[Redis]: Health check failed', {
			error: errorMessage,
		});
		return false;
	}
};

export const health = new Elysia({ prefix: '/health' }).get('/', async () => {
	const [clickhouseStatus, databaseStatus, redisStatus] = await Promise.all([
		checkClickhouse(),
		checkDatabase(),
		checkRedis(),
	]);

	const success = clickhouseStatus && databaseStatus && redisStatus;
	const status = success ? 200 : 503;

	return new Response(
		JSON.stringify({
			clickhouse: clickhouseStatus,
			database: databaseStatus,
			redis: redisStatus,
			success,
			version: '1.0.0',
			timestamp: new Date().toISOString(),
		}),
		{
			status,
			headers: { 'Content-Type': 'application/json' },
		}
	);
});
