import { TABLE_NAMES } from '../../clickhouse/client';
import type { SeedContext } from '../context';
import {
	buildSessionPool,
	buildUserPool,
	createAnalyticsResources,
	isCustomEvent,
	makeSessionEvents,
	makeErrorEvent,
	makeWebVitalsEvent,
	toCustomEventRecord,
	toOutgoingLinkRecord,
	AnalyticsEventRecord,
	AnalyticsCustomEventRecord,
	AnalyticsOutgoingLinkRecord,
} from '../factories/analytics';
import type { ScenarioResult } from './types';
import { runBaseScenario } from './base';
import { insertClickHouseBatched } from './helpers';

export async function runDemoScenario(ctx: SeedContext): Promise<ScenarioResult> {
	const baseResult = await runBaseScenario(ctx);

	const websiteRecord = ctx.caches.websites.find(
		(entry) => (entry as { id?: string }).id === baseResult.ids.websiteId
	) as { id?: string; domain?: string } | undefined;

	const clientId = websiteRecord?.id ?? baseResult.ids.websiteId;
	const domain = websiteRecord?.domain ?? ctx.config.domain ?? 'example.com';

	const totalEvents = ctx.config.events ?? 300;
	const usersTarget = ctx.config.users ?? Math.max(10, Math.floor(totalEvents / 8));
	const sessionsPerUser = 2.5;
	const sessionTarget = Math.max(1, Math.floor(usersTarget * sessionsPerUser));

	const resources = createAnalyticsResources(ctx);
	const userPool = buildUserPool(ctx, usersTarget);
	const sessionPool = buildSessionPool(
		ctx,
		userPool,
		sessionTarget,
		resources
	);

	ctx.caches.sessions.push(...sessionPool);

	const mainEvents: AnalyticsEventRecord[] = [];
	const customEvents: AnalyticsCustomEventRecord[] = [];
	const outgoingLinks: AnalyticsOutgoingLinkRecord[] = [];

	// Generate events per session for realistic flow
	for (const session of sessionPool) {
		const sessionEvents = makeSessionEvents(ctx, {
			clientId,
			domain,
			session,
			resources,
		});

		for (const event of sessionEvents) {
			if (isCustomEvent(event.event_name)) {
				customEvents.push(toCustomEventRecord(event));
			} else if (event.event_name === 'link_out') {
				outgoingLinks.push(toOutgoingLinkRecord(event));
			} else {
				mainEvents.push(event);
			}
		}
	}

	mainEvents.sort((a, b) => a.time - b.time);

	const errorCount = Math.floor(totalEvents * 0.05);
	const errors = Array.from({ length: errorCount }, () =>
		makeErrorEvent(ctx, { clientId, domain, sessions: sessionPool, resources })
	);

	const webVitalsCount = Math.floor(totalEvents * 0.1);
	const webVitals = Array.from({ length: webVitalsCount }, () =>
		makeWebVitalsEvent(ctx, {
			clientId,
			domain,
			sessions: sessionPool,
			resources,
		})
	);

	if (!ctx.config.dryRun) {
		await insertClickHouseBatched(ctx, TABLE_NAMES.events, mainEvents);
		await insertClickHouseBatched(
			ctx,
			TABLE_NAMES.custom_events,
			customEvents
		);
		await insertClickHouseBatched(
			ctx,
			TABLE_NAMES.outgoing_links,
			outgoingLinks
		);
		await insertClickHouseBatched(ctx, TABLE_NAMES.errors, errors);
		await insertClickHouseBatched(ctx, TABLE_NAMES.web_vitals, webVitals);
	}

	ctx.caches.eventsGenerated.events += mainEvents.length;
	ctx.caches.eventsGenerated.customEvents += customEvents.length;
	ctx.caches.eventsGenerated.outgoingLinks += outgoingLinks.length;
	ctx.caches.eventsGenerated.errors += errors.length;
	ctx.caches.eventsGenerated.webVitals += webVitals.length;

	return {
		...baseResult,
		events: ctx.caches.eventsGenerated.events,
		errors: ctx.caches.eventsGenerated.errors,
		webVitals: ctx.caches.eventsGenerated.webVitals,
		customEvents: ctx.caches.eventsGenerated.customEvents,
		outgoingLinks: ctx.caches.eventsGenerated.outgoingLinks,
	};
}
