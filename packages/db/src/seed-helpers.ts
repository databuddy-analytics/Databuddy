import { faker } from "@faker-js/faker";

const DEFAULT_SEED = 42;

export function extractFlag(args: string[], name: string): string | undefined {
	const eqPrefix = `--${name}=`;
	const index = args.findIndex(
		(arg) => arg === `--${name}` || arg.startsWith(eqPrefix)
	);
	if (index === -1) {
		return;
	}
	const arg = args[index] as string;
	if (arg.startsWith(eqPrefix)) {
		const value = arg.slice(eqPrefix.length);
		args.splice(index, 1);
		return value;
	}
	const value = args[index + 1];
	args.splice(index, value === undefined ? 1 : 2);
	return value;
}

export function resolveSeedValue(seedArg: string | undefined): number {
	return seedArg !== undefined &&
		seedArg.trim() !== "" &&
		Number.isFinite(Number(seedArg))
		? Number(seedArg)
		: DEFAULT_SEED;
}

// Weighted page-to-page transitions so a meaningful, stable share of visitors
// who view one page go on to view a related next page (e.g. pricing -> signup),
// instead of every event picking an independent, uncorrelated random path.
export const START_TRANSITIONS = [
	{ path: "/", weight: 35 },
	{ path: "/home", weight: 15 },
	{ path: "/pricing", weight: 10 },
	{ path: "/features", weight: 10 },
	{ path: "/blog", weight: 10 },
	{ path: "/docs", weight: 8 },
	{ path: "/about", weight: 7 },
	{ path: "/login", weight: 5 },
] as const;

export const PAGE_TRANSITIONS = {
	"/": [
		{ path: "/features", weight: 25 },
		{ path: "/pricing", weight: 25 },
		{ path: "/docs", weight: 10 },
		{ path: "/blog", weight: 10 },
		{ path: "/login", weight: 10 },
		{ path: "/about", weight: 10 },
		{ path: "/contact", weight: 5 },
		{ path: "/", weight: 5 },
	],
	"/home": [
		{ path: "/features", weight: 25 },
		{ path: "/pricing", weight: 25 },
		{ path: "/docs", weight: 10 },
		{ path: "/blog", weight: 10 },
		{ path: "/login", weight: 10 },
		{ path: "/about", weight: 10 },
		{ path: "/contact", weight: 5 },
		{ path: "/home", weight: 5 },
	],
	"/features": [
		{ path: "/pricing", weight: 40 },
		{ path: "/docs", weight: 20 },
		{ path: "/signup", weight: 10 },
		{ path: "/blog", weight: 10 },
		{ path: "/contact", weight: 10 },
		{ path: "/", weight: 10 },
	],
	"/pricing": [
		{ path: "/signup", weight: 45 },
		{ path: "/features", weight: 15 },
		{ path: "/login", weight: 10 },
		{ path: "/contact", weight: 10 },
		{ path: "/about", weight: 10 },
		{ path: "/", weight: 10 },
	],
	"/signup": [
		{ path: "/dashboard", weight: 65 },
		{ path: "/pricing", weight: 15 },
		{ path: "/login", weight: 10 },
		{ path: "/", weight: 10 },
	],
	"/login": [
		{ path: "/dashboard", weight: 60 },
		{ path: "/signup", weight: 15 },
		{ path: "/", weight: 15 },
		{ path: "/contact", weight: 10 },
	],
	"/dashboard": [
		{ path: "/dashboard", weight: 35 },
		{ path: "/settings", weight: 25 },
		{ path: "/profile", weight: 20 },
		{ path: "/docs", weight: 10 },
		{ path: "/", weight: 10 },
	],
	"/settings": [
		{ path: "/dashboard", weight: 50 },
		{ path: "/profile", weight: 20 },
		{ path: "/settings", weight: 15 },
		{ path: "/", weight: 15 },
	],
	"/profile": [
		{ path: "/dashboard", weight: 50 },
		{ path: "/settings", weight: 20 },
		{ path: "/profile", weight: 15 },
		{ path: "/", weight: 15 },
	],
	"/docs": [
		{ path: "/docs", weight: 25 },
		{ path: "/features", weight: 20 },
		{ path: "/pricing", weight: 20 },
		{ path: "/", weight: 20 },
		{ path: "/dashboard", weight: 15 },
	],
	"/blog": [
		{ path: "/blog", weight: 25 },
		{ path: "/", weight: 25 },
		{ path: "/pricing", weight: 15 },
		{ path: "/features", weight: 15 },
		{ path: "/about", weight: 10 },
		{ path: "/contact", weight: 10 },
	],
	"/about": [
		{ path: "/", weight: 25 },
		{ path: "/about", weight: 20 },
		{ path: "/pricing", weight: 20 },
		{ path: "/contact", weight: 20 },
		{ path: "/features", weight: 15 },
	],
	"/contact": [
		{ path: "/", weight: 35 },
		{ path: "/contact", weight: 30 },
		{ path: "/pricing", weight: 20 },
		{ path: "/about", weight: 15 },
	],
} as const;

export type PathTransition =
	| (typeof START_TRANSITIONS)[number]
	| (typeof PAGE_TRANSITIONS)[keyof typeof PAGE_TRANSITIONS][number];

const PAGE_TRANSITIONS_LOOKUP = PAGE_TRANSITIONS as Record<
	string,
	readonly PathTransition[]
>;

export function pickWeightedPath(
	transitions: readonly PathTransition[],
	fallbackPath: string
): string {
	const total = transitions.reduce((sum, entry) => sum + entry.weight, 0);
	let roll = faker.number.float({ min: 0, max: total });
	for (const entry of transitions) {
		if (roll < entry.weight) {
			return entry.path;
		}
		roll -= entry.weight;
	}
	return transitions.at(-1)?.path ?? fallbackPath;
}

export function nextPath(
	previousPath: string | undefined,
	fallbackPath: string
): string {
	const transitions = previousPath
		? (PAGE_TRANSITIONS_LOOKUP[previousPath] ?? START_TRANSITIONS)
		: START_TRANSITIONS;
	return pickWeightedPath(transitions, fallbackPath);
}
