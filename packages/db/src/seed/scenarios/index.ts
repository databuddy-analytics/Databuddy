import { runAnalyticsHeavyScenario } from './analyticsHeavy';
import { runBaseScenario } from './base';
import { runDemoScenario } from './demo';
import type { ScenarioDescriptor, ScenarioRunner } from './types';

const registry: Record<string, ScenarioDescriptor> = {
	base: {
		name: 'base',
		description: 'Admin user and single website with no analytics events.',
		run: runBaseScenario,
	},
	demo: {
		name: 'demo',
		description: 'Base scenario plus a small analytics dataset for demos.',
		run: runDemoScenario,
	},
	analyticsHeavy: {
		name: 'analyticsHeavy',
		description:
			'Base scenario plus a large analytics dataset for stress testing.',
		run: runAnalyticsHeavyScenario,
	},
};

export function getScenario(name: string): ScenarioRunner {
	const descriptor = registry[name];
	if (!descriptor) {
		throw new Error(
			`Unknown seed scenario "${name}". Available scenarios: ${Object.keys(
				registry
			).join(', ')}`
		);
	}
	return descriptor.run;
}

export function listScenarios(): ScenarioDescriptor[] {
	return Object.values(registry);
}
