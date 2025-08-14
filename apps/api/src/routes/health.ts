import { chQuery, db } from '@databuddy/db';
import { redis as redisClient } from '@databuddy/redis';
import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

const checkClickhouse = async () => {
	try {
		const result = await chQuery('SELECT 1 FROM analytics.events LIMIT 1');
		return result.length > 0;
	} catch (error) {
		logger.error('ClickHouse health check failed:', { error });
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
		logger.error('Database health check failed:', { error });
		return false;
	}
};

const checkRedis = async () => {
	try {
		const result = await redisClient.ping();
		return result === 'PONG';
	} catch (error) {
		logger.error('Redis health check failed:', { error });
		return false;
	}
};

export const health = new Elysia().get('/health', async () => {
	const [clickhouse, database, redis] = await Promise.all([
		checkClickhouse(),
		checkDatabase(),
		checkRedis(),
	]);

	const success = clickhouse && database && redis;
	const status = success ? 200 : 503;

	return new Response(
		JSON.stringify({
			clickhouse,
			database,
			redis,
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
