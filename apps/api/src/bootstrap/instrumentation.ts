import { setAiRequestLoggerProvider } from "@databuddy/ai/lib/request-logger";
import { setPgErrorFn, setPgTimingFn } from "@databuddy/db";
import { setChTimingFn } from "@databuddy/db/clickhouse";
import { type CacheLookupEvent, setCacheTimingFn } from "@databuddy/redis";
import { setRpcRequestLoggerProvider, setTrackingFn } from "@databuddy/rpc";
import { log, type RequestLogger } from "evlog";
import { useLogger } from "evlog/elysia";
import { trackMutationEvent } from "@databuddy/ai/lib/databuddy";
import { initTccTracing } from "@/lib/tcc-otel";

export function configureApiInstrumentation() {
	setTrackingFn(trackMutationEvent);
	setRpcRequestLoggerProvider(useLogger);
	setAiRequestLoggerProvider(useLogger);
	setPgErrorFn(recordPostgresPoolError);
	setPgTimingFn(recordPgQuery);
	setChTimingFn(recordChQuery);
	setCacheTimingFn(recordCacheLookup);
	startTccTracing();
}

interface StageCounters {
	cacheHits: number;
	cacheMisses: number;
	cacheMs: number;
	chCount: number;
	chMs: number;
	pgCount: number;
	pgMs: number;
}

const countersByLogger = new WeakMap<RequestLogger, StageCounters>();

function activeStageCounters(): {
	counters: StageCounters;
	logger: RequestLogger;
} | null {
	let logger: RequestLogger;
	try {
		logger = useLogger();
	} catch {
		return null;
	}
	let counters = countersByLogger.get(logger);
	if (!counters) {
		counters = {
			cacheHits: 0,
			cacheMisses: 0,
			cacheMs: 0,
			chCount: 0,
			chMs: 0,
			pgCount: 0,
			pgMs: 0,
		};
		countersByLogger.set(logger, counters);
	}
	return { counters, logger };
}

function recordPgQuery(durationMs: number) {
	const active = activeStageCounters();
	if (!active) {
		return;
	}
	active.counters.pgCount += 1;
	active.counters.pgMs += durationMs;
	active.logger.set({
		pg_query_count: active.counters.pgCount,
		"timing.pg_total_ms": Math.round(active.counters.pgMs),
	});
}

function recordChQuery(durationMs: number) {
	const active = activeStageCounters();
	if (!active) {
		return;
	}
	active.counters.chCount += 1;
	active.counters.chMs += durationMs;
	active.logger.set({
		ch_query_count: active.counters.chCount,
		"timing.ch_total_ms": Math.round(active.counters.chMs),
	});
}

function recordCacheLookup(event: CacheLookupEvent) {
	const active = activeStageCounters();
	if (!active) {
		return;
	}
	if (event.hit) {
		active.counters.cacheHits += 1;
	} else {
		active.counters.cacheMisses += 1;
	}
	active.counters.cacheMs += event.durationMs;
	active.logger.set({
		cache_hit_count: active.counters.cacheHits,
		cache_miss_count: active.counters.cacheMisses,
		"timing.cache_total_ms": Math.round(active.counters.cacheMs),
	});
}

function recordPostgresPoolError(error: Error) {
	log.error({
		service: "api",
		component: "postgres_pool",
		error_message: error.message,
		error_stack: error.stack,
	});
}

function startTccTracing() {
	try {
		initTccTracing();
	} catch (error) {
		log.warn({
			service: "api",
			component: "tcc_otel",
			message: "TCC tracing disabled (init failed)",
			error_message: error instanceof Error ? error.message : String(error),
		});
	}
}
