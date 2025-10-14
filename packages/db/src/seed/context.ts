import { db } from '../client';
import { clickHouse } from '../clickhouse/client';
import { createFaker, type Faker } from './utils/faker';
import type { SeedConfig } from './config';

export interface SeedEventCounters {
	events: number;
	customEvents: number;
	outgoingLinks: number;
	errors: number;
	webVitals: number;
}

export interface SeedCaches {
	users: unknown[];
	websites: unknown[];
	sessions: unknown[];
	eventsGenerated: SeedEventCounters;
}

export interface SeedContext {
	db: typeof db;
	clickHouse: typeof clickHouse;
	config: SeedConfig;
	faker: Faker;
	now: Date;
	caches: SeedCaches;
}

export function createSeedContext(config: SeedConfig): SeedContext {
	const faker = createFaker(config.fakerSeed);
	const now = new Date();

	return {
		db,
		clickHouse,
		config,
		faker,
		now,
		caches: {
			users: [],
			websites: [],
			sessions: [],
			eventsGenerated: {
				events: 0,
				customEvents: 0,
				outgoingLinks: 0,
				errors: 0,
				webVitals: 0,
			},
		},
	};
}
