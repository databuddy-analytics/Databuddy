export type CareerOpening = {
	id: string;
	title: string;
	type: string;
	location: string;
	summary: string;
	responsibilities: string[];
	requirements: string[];
	niceToHaves: string[];
	applyHref: string;
	applyLabel: string;
};

export const careerOpenings: CareerOpening[] = [
	{
		id: "founding-engineer",
		title: "Founding Engineer",
		type: "Full-time",
		location: "Remote",
		summary:
			"Help own the core product with the founders. You'll ship across the TypeScript monorepo — dashboard, API, ingestion, and analytics warehouse — and make real architecture calls while the company is still small.",
		responsibilities: [
			"Ship end-to-end features across Next.js, Elysia, Drizzle, ClickHouse, and Redis",
			"Own problems from product question to production: schema, API, UI, and observability",
			"Tighten ingestion, query performance, and reliability as volume grows",
			"Review PRs hard, keep the codebase simple, and raise the bar for everyone else",
			"Talk directly with users when something breaks or a design decision needs a sharp edge",
		],
		requirements: [
			"Strong TypeScript and comfort across full-stack web systems",
			"Experience shipping production SaaS, developer tools, or data products",
			"Solid judgment on SQL, APIs, and performance — not just framework familiarity",
			"Bias toward small PRs, clear writing, and deleting complexity",
			"Happy working async and remote with a tiny team",
		],
		niceToHaves: [
			"ClickHouse, analytics pipelines, or high-volume event ingestion",
			"Open-source contributions or public technical writing",
			"Prior founding / early-stage engineer experience",
			"Interest in privacy, GDPR, or cookieless analytics",
		],
		applyHref:
			"mailto:support@databuddy.cc?subject=Founding%20Engineer%20Application%20%E2%80%94%20Databuddy",
		applyLabel: "Apply for Founding Engineer",
	},
	{
		id: "sdr",
		title: "Sales Development Representative",
		type: "Full-time",
		location: "Remote",
		summary:
			"Own outbound and inbound qualification for Databuddy. You'll find teams that care about privacy-first analytics, start the conversation, and book qualified demos for the founders.",
		responsibilities: [
			"Run outbound sequences across email, LinkedIn, and warm intros",
			"Qualify inbound interest and book demos with decision-makers",
			"Keep a clean pipeline in our CRM and report weekly on activity and conversion",
			"Learn the product well enough to speak clearly about privacy, performance, and pricing",
			"Feed product and marketing with real objections, competitor notes, and win/loss signal",
		],
		requirements: [
			"1+ years in SDR, BDR, or similar outbound sales at a B2B SaaS company",
			"Comfortable writing concise cold outreach that sounds human",
			"Organized enough to run high volume without dropping follow-ups",
			"Clear written and spoken English",
			"Excited about developer tools, analytics, or privacy tech",
		],
		niceToHaves: [
			"Experience selling to founders, growth, or engineering buyers",
			"Familiarity with privacy, GDPR, or cookieless analytics",
			"Prior work at an early-stage startup where you wore more than one hat",
		],
		applyHref:
			"mailto:support@databuddy.cc?subject=SDR%20Application%20%E2%80%94%20Databuddy",
		applyLabel: "Apply for SDR",
	},
];
