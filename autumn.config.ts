import {
	feature,
	featureItem,
	pricedFeatureItem,
	priceItem,
	product,
} from "atmn";

// Features
export const assistantMessage = feature({
	id: "assistant_message",
	name: "Assistant Message",
	type: "single_use",
});

export const websites = feature({
	id: "websites",
	name: "Websites",
	type: "single_use",
});

export const events = feature({
	id: "events",
	name: "Events",
	type: "single_use",
});

// Products
export const free = product({
	id: "free",
	name: "Free",
	items: [
		featureItem({
			feature_id: assistantMessage.id,
			included_usage: 5,
			interval: "day",
		}),

		featureItem({
			feature_id: events.id,
			included_usage: 10_000,
			interval: "month",
		}),
	],
});

export const hobby = product({
	id: "hobby",
	name: "Hobby",
	items: [
		priceItem({
			price: 1.99,
			interval: "month",
		}),

		pricedFeatureItem({
			feature_id: events.id,

			tiers: [
				{ to: 2_000_000, amount: 0.000_035 },
				{ to: 10_000_000, amount: 0.000_03 },
				{ to: 50_000_000, amount: 0.000_02 },
				{ to: 250_000_000, amount: 0.000_015 },
				{ to: "inf", amount: 0.000_01 },
			],
			interval: "month",
			included_usage: 30_000,
			billing_units: 1,
			usage_model: "pay_per_use",
			reset_usage_when_enabled: false,
		}),

		featureItem({
			feature_id: assistantMessage.id,
			included_usage: 10,
			interval: "day",
		}),
	],
});

export const pro = product({
	id: "pro",
	name: "Pro",
	items: [
		priceItem({
			price: 29.99,
			interval: "month",
		}),

		pricedFeatureItem({
			feature_id: events.id,

			tiers: [
				{ to: 2_000_000, amount: 0.000_035 },
				{ to: 10_000_000, amount: 0.000_03 },
				{ to: 50_000_000, amount: 0.000_02 },
				{ to: 250_000_000, amount: 0.000_015 },
				{ to: "inf", amount: 0.000_01 },
			],
			interval: "month",
			included_usage: 500_000,
			billing_units: 1,
			usage_model: "pay_per_use",
			reset_usage_when_enabled: false,
		}),

		featureItem({
			feature_id: assistantMessage.id,
			included_usage: 75,
			interval: "day",
		}),
	],
});

export const scale = product({
	id: "scale",
	name: "Scale",
	items: [
		priceItem({
			price: 99.99,
			interval: "month",
		}),

		pricedFeatureItem({
			feature_id: events.id,

			tiers: [
				{ to: 2_000_000, amount: 0.000_035 },
				{ to: 10_000_000, amount: 0.000_03 },
				{ to: 50_000_000, amount: 0.000_02 },
				{ to: 250_000_000, amount: 0.000_015 },
				{ to: "inf", amount: 0.000_01 },
			],
			interval: "month",
			included_usage: 3_000_000,
			billing_units: 1,
			usage_model: "pay_per_use",
			reset_usage_when_enabled: false,
		}),

		featureItem({
			feature_id: assistantMessage.id,
			included_usage: 250,
			interval: "day",
		}),
	],
});
