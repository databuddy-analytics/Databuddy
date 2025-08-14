import type { RawItem, RawPlan } from '../data';
import type { NormalizedPlan } from './types';

export function getPriceMonthly(items: RawItem[]): number {
	for (const item of items) {
		if (item.type === 'price') {
			return item.price;
		}
	}
	return 0;
}

export function getEventsInfo(items: RawItem[]): {
	included: number;
	tiers: Array<{ to: number | 'inf'; amount: number }> | null;
} {
	let included = 0;
	let tiers: Array<{ to: number | 'inf'; amount: number }> | null = null;
	for (const item of items) {
		const isEvent =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'events';
		if (!isEvent) {
			continue;
		}
		if (typeof item.included_usage === 'number') {
			included = item.included_usage;
		}
		if (item.type === 'priced_feature' && item.tiers) {
			tiers = item.tiers;
		}
	}
	return { included, tiers };
}

export function getWebsitesInfo(items: RawItem[]): {
	included: number | 'inf' | null;
	overage: number | null;
} {
	let included: number | 'inf' | null = null;
	let overage: number | null = null;
	for (const item of items) {
		const isWeb =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'websites';
		if (!isWeb) {
			continue;
		}
		included = item.included_usage as number | 'inf';
		if (item.type === 'priced_feature' && typeof item.price === 'number') {
			overage = item.price;
		}
	}
	return { included, overage };
}

export function getAssistantMessagesPerDay(items: RawItem[]): number | null {
	for (const item of items) {
		const isAssistant =
			(item.type === 'feature' || item.type === 'priced_feature') &&
			item.feature_id === 'assistant_message' &&
			item.interval === 'day' &&
			typeof item.included_usage === 'number';
		if (isAssistant) {
			return item.included_usage as number;
		}
	}
	return null;
}

export function normalizePlans(raw: RawPlan[]): NormalizedPlan[] {
	return raw.map((plan) => {
		const priceMonthly = getPriceMonthly(plan.items);
		const { included: includedEventsMonthly, tiers: eventTiers } =
			getEventsInfo(plan.items);
		const { included: websitesIncluded, overage: websitesOveragePerUnit } =
			getWebsitesInfo(plan.items);
		const assistantMessagesPerDay = getAssistantMessagesPerDay(plan.items);
		return {
			id: plan.id,
			name: plan.name,
			priceMonthly,
			includedEventsMonthly,
			eventTiers,
			websitesIncluded,
			websitesOveragePerUnit,
			assistantMessagesPerDay,
		};
	});
}
