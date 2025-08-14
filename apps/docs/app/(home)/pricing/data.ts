export type FeatureDisplay = { singular: string; plural: string };
export type RawFeature = {
	id: string;
	name: string;
	type: 'single_use';
	display: FeatureDisplay;
};
export type RawItem =
	| {
			type: 'price';
			interval: 'month';
			price: number;
			feature_id: null;
			feature: null;
	  }
	| {
			type: 'feature';
			feature_id: string;
			feature_type: 'single_use';
			feature: RawFeature;
			included_usage: number | 'inf';
			interval: 'day' | 'month' | null;
	  }
	| {
			type: 'priced_feature';
			feature_id: string;
			feature_type: 'single_use';
			feature: RawFeature;
			included_usage: number | 'inf';
			interval: 'month' | null;
			price?: number;
			tiers?: Array<{ to: number | 'inf'; amount: number }>;
			usage_model: 'pay_per_use';
	  };

export type RawPlan = { id: string; name: string; items: RawItem[] };

export const RAW_PLANS: RawPlan[] = [
	{
		id: 'free',
		name: 'Free',
		items: [
			{
				type: 'feature',
				feature_id: 'assistant_message',
				feature_type: 'single_use',
				feature: {
					id: 'assistant_message',
					name: 'Assistant Message',
					type: 'single_use',
					display: {
						singular: 'assistant message',
						plural: 'assistant messages',
					},
				},
				included_usage: 5,
				interval: 'day',
			},
			{
				type: 'feature',
				feature_id: 'events',
				feature_type: 'single_use',
				feature: {
					id: 'events',
					name: 'Events',
					type: 'single_use',
					display: { singular: 'event', plural: 'events' },
				},
				included_usage: 10_000,
				interval: 'month',
			},
			{
				type: 'feature',
				feature_id: 'websites',
				feature_type: 'single_use',
				feature: {
					id: 'websites',
					name: 'Websites',
					type: 'single_use',
					display: { singular: 'website', plural: 'websites' },
				},
				included_usage: 3,
				interval: null,
			},
		],
	},
	{
		id: 'hobby',
		name: 'Hobby',
		items: [
			{
				type: 'price',
				interval: 'month',
				price: 1.99,
				feature_id: null,
				feature: null,
			},
			{
				type: 'priced_feature',
				feature_id: 'events',
				feature_type: 'single_use',
				feature: {
					id: 'events',
					name: 'Events',
					type: 'single_use',
					display: { singular: 'event', plural: 'events' },
				},
				included_usage: 30_000,
				interval: 'month',
				tiers: [
					{ to: 2_000_000, amount: 0.000_035 },
					{ to: 10_000_000, amount: 0.000_03 },
					{ to: 50_000_000, amount: 0.000_02 },
					{ to: 250_000_000, amount: 0.000_015 },
					{ to: 'inf', amount: 0.000_01 },
				],
				usage_model: 'pay_per_use',
			},
			{
				type: 'priced_feature',
				feature_id: 'websites',
				feature_type: 'single_use',
				feature: {
					id: 'websites',
					name: 'Websites',
					type: 'single_use',
					display: { singular: 'website', plural: 'websites' },
				},
				included_usage: 5,
				interval: 'month',
				price: 0.5,
				usage_model: 'pay_per_use',
			},
			{
				type: 'feature',
				feature_id: 'assistant_message',
				feature_type: 'single_use',
				feature: {
					id: 'assistant_message',
					name: 'Assistant Message',
					type: 'single_use',
					display: {
						singular: 'assistant message',
						plural: 'assistant messages',
					},
				},
				included_usage: 10,
				interval: 'day',
			},
		],
	},
	{
		id: 'pro',
		name: 'Pro',
		items: [
			{
				type: 'price',
				interval: 'month',
				price: 29.99,
				feature_id: null,
				feature: null,
			},
			{
				type: 'priced_feature',
				feature_id: 'events',
				feature_type: 'single_use',
				feature: {
					id: 'events',
					name: 'Events',
					type: 'single_use',
					display: { singular: 'event', plural: 'events' },
				},
				included_usage: 500_000,
				interval: 'month',
				tiers: [
					{ to: 2_000_000, amount: 0.000_035 },
					{ to: 10_000_000, amount: 0.000_03 },
					{ to: 50_000_000, amount: 0.000_02 },
					{ to: 250_000_000, amount: 0.000_015 },
					{ to: 'inf', amount: 0.000_01 },
				],
				usage_model: 'pay_per_use',
			},
			{
				type: 'feature',
				feature_id: 'assistant_message',
				feature_type: 'single_use',
				feature: {
					id: 'assistant_message',
					name: 'Assistant Message',
					type: 'single_use',
					display: {
						singular: 'assistant message',
						plural: 'assistant messages',
					},
				},
				included_usage: 75,
				interval: 'day',
			},
			{
				type: 'feature',
				feature_id: 'websites',
				feature_type: 'single_use',
				feature: {
					id: 'websites',
					name: 'Websites',
					type: 'single_use',
					display: { singular: 'website', plural: 'websites' },
				},
				included_usage: 'inf',
				interval: null,
			},
		],
	},
	{
		id: 'scale',
		name: 'Scale',
		items: [
			{
				type: 'price',
				interval: 'month',
				price: 99.99,
				feature_id: null,
				feature: null,
			},
			{
				type: 'priced_feature',
				feature_id: 'events',
				feature_type: 'single_use',
				feature: {
					id: 'events',
					name: 'Events',
					type: 'single_use',
					display: { singular: 'event', plural: 'events' },
				},
				included_usage: 3_000_000,
				interval: 'month',
				tiers: [
					{ to: 2_000_000, amount: 0.000_035 },
					{ to: 10_000_000, amount: 0.000_03 },
					{ to: 50_000_000, amount: 0.000_02 },
					{ to: 250_000_000, amount: 0.000_015 },
					{ to: 'inf', amount: 0.000_01 },
				],
				usage_model: 'pay_per_use',
			},
			{
				type: 'feature',
				feature_id: 'assistant_message',
				feature_type: 'single_use',
				feature: {
					id: 'assistant_message',
					name: 'Assistant Message',
					type: 'single_use',
					display: {
						singular: 'assistant message',
						plural: 'assistant messages',
					},
				},
				included_usage: 250,
				interval: 'day',
			},
			{
				type: 'feature',
				feature_id: 'websites',
				feature_type: 'single_use',
				feature: {
					id: 'websites',
					name: 'Websites',
					type: 'single_use',
					display: { singular: 'website', plural: 'websites' },
				},
				included_usage: 'inf',
				interval: null,
			},
		],
	},
];
