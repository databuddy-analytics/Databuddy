import type { SeedContext } from '../context';

export interface ScenarioIds {
	adminUserId: string;
	websiteId: string;
}

export interface ScenarioResult {
	users: number;
	websites: number;
	events: number;
	errors: number;
	webVitals: number;
	customEvents: number;
	outgoingLinks: number;
	ids: ScenarioIds;
}

export type ScenarioRunner = (ctx: SeedContext) => Promise<ScenarioResult>;

export interface ScenarioDescriptor {
	name: string;
	run: ScenarioRunner;
	description?: string;
}
