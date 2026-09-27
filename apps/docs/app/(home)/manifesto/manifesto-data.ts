export type ManifestoBlock =
	| { type: "paragraph"; text: string }
	| { type: "callout"; text: string }
	| { type: "prompts"; items: readonly string[] };

type ManifestoChapterId =
	| "analytics-is-broken"
	| "context-is-everything"
	| "privacy-is-the-default"
	| "ask-your-data"
	| "build-for-builders";

export interface ManifestoChapter {
	blocks: readonly ManifestoBlock[];
	id: ManifestoChapterId;
	number: string;
	title: string;
}

export const manifestoIntro = {
	title: "The Databuddy Manifesto",
	lead: [
		"I built Databuddy because I wanted to understand what changed in my product without reconstructing the answer across separate analytics, error, and performance tools.",
		"Here's what guides the product.",
	],
} as const;

export const manifestoSections: readonly ManifestoChapter[] = [
	{
		id: "analytics-is-broken",
		number: "01",
		title: "Analytics Is Broken",
		blocks: [
			{
				type: "paragraph",
				text: "A traffic chart can show a drop without explaining it. An error report can show a failure without showing its effect on conversions. I wanted those pieces connected.",
			},
			{
				type: "paragraph",
				text: "Every feature we add should help someone answer a product question or act on a finding. If it only adds another screen to maintain, we should question it.",
			},
			{
				type: "callout",
				text: "Make the answer easier to find.",
			},
		],
	},
	{
		id: "context-is-everything",
		number: "02",
		title: "Context Is Everything",
		blocks: [
			{
				type: "paragraph",
				text: "Traffic, errors, and conversions are more useful when you can examine them together.",
			},
			{
				type: "paragraph",
				text: "Pageviews, bounce rates, and referrers are useful starting points. The next step is understanding the activity behind them.",
			},
			{
				type: "paragraph",
				text: "Knowing 500 people signed up yesterday tells you nothing. Knowing that 400 came from a Hacker News post, 60% hit an error on onboarding, and only 12 activated a core feature? That tells you exactly where to spend your morning.",
			},
			{
				type: "paragraph",
				text: "Raw data is not insight. Context is. That means connecting web analytics to product analytics to errors to performance, all in one place, so you can trace a user’s journey from first click to “aha” moment without duct-taping four tools together.",
			},
			{
				type: "paragraph",
				text: "I want Databuddy to show the evidence behind a finding so you can inspect it, challenge it, and decide what to do.",
			},
			{
				type: "callout",
				text: "I’m building the tool that tells you the story.",
			},
		],
	},
	{
		id: "privacy-is-the-default",
		number: "03",
		title: "Privacy Is the Default, Not the Feature",
		blocks: [
			{
				type: "paragraph",
				text: "Privacy decisions should be visible in the collection settings and documentation. People should be able to understand what is collected and why.",
			},
			{
				type: "callout",
				text: "Privacy isn’t a feature. It’s the bare minimum.",
			},
			{
				type: "paragraph",
				text: "Databuddy’s tracker is about 13 KB gzipped and uses browser storage instead of analytics cookies. User identification is optional. Website owners choose what to collect and remain responsible for their privacy notices and consent requirements.",
			},
			{
				type: "paragraph",
				text: "Collect what you need, explain it clearly, and respect the choices people make.",
			},
		],
	},
	{
		id: "ask-your-data",
		number: "04",
		title: "Ask Your Data Questions, Not Your Dashboard",
		blocks: [
			{
				type: "callout",
				text: "The best analytics UI is a conversation.",
			},
			{
				type: "paragraph",
				text: "I don’t think you should need to learn a query builder, memorize filter syntax, or drag widgets around a canvas to understand your own product. You should just ask.",
			},
			{
				type: "prompts",
				items: [
					"How many users signed up yesterday?",
					"Show me errors from production in the last hour.",
					"Which feature has the highest drop-off after onboarding?",
				],
			},
			{
				type: "paragraph",
				text: "Databunny, the AI agent inside Databuddy, answers questions, builds charts, and runs investigations. When you configure a schedule and Slack delivery, it sends actionable investigations to your chosen channels.",
			},
			{
				type: "paragraph",
				text: "The future of analytics isn’t more dashboards. It’s fewer. It’s an agent that knows your data well enough to surface what matters and shut up about what doesn’t.",
			},
		],
	},
	{
		id: "build-for-builders",
		number: "05",
		title: "Build for Builders",
		blocks: [
			{
				type: "paragraph",
				text: "Databuddy is for the founder who checks analytics between deploys. The engineer who wants to know if the feature they shipped last night actually moved a number. The two-person team that doesn’t have a “data person” and shouldn’t need one.",
			},
			{
				type: "paragraph",
				text: "I’m not building for enterprises with 50-person data teams. I’m building for the people who are actually making things, and who need their tools to stay out of the way while they do it.",
			},
			{
				type: "callout",
				text: "One script. One platform. The full picture.",
			},
			{
				type: "paragraph",
				text: "That’s it. That’s Databuddy.",
			},
		],
	},
] as const;

export const manifestoSignature = {
	name: "Issa Nassar",
	role: "Founder",
	company: "Databuddy Analytics",
} as const;
