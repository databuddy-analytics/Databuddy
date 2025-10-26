// Generate realistic but unique profile names based on visitor ID
const firstNames = [
	'Alex',
	'Jordan',
	'Sam',
	'Morgan',
	'Casey',
	'Riley',
	'Quinn',
	'Dakota',
	'Skyler',
	'Phoenix',
	'River',
	'Sage',
	'Blake',
	'Rowan',
	'Avery',
	'Finley',
	'Emery',
	'Payton',
	'Drew',
	'Taylor',
	'Logan',
	'Jamie',
	'Kai',
	'Reese',
	'Cameron',
	'Devon',
	'Ellis',
	'Gray',
	'Hayden',
	'Kelly',
	'Lee',
	'Mason',
	'Noah',
	'Perry',
	'Remy',
	'Shane',
	'Tate',
	'West',
	'Zane',
	'Brook',
	'Clarke',
	'Dale',
	'Echo',
	'Flint',
	'Glen',
	'Haven',
	'Ivy',
	'Jade',
	'Knox',
	'Lane',
];

const descriptors = [
	'Digital Nomad',
	'Night Owl',
	'Early Bird',
	'Coffee Enthusiast',
	'Mystery Shopper',
	'Speed Browser',
	'Deep Diver',
	'Curious Cat',
	'The Navigator',
	'Midnight Explorer',
	'Ghost Surfer',
	'Stealth Visitor',
	'Quick Glancer',
	'The Wanderer',
	'Deep Reader',
	'Power User',
	'The Strategist',
	'Window Shopper',
	'The Insider',
	'Fast Tracker',
	'Casual Browser',
	'The Analyzer',
	'Tech Savvy',
	'The Minimalist',
	'Design Seeker',
	'The Collector',
	'Info Hunter',
	'The Observer',
	'Detail Oriented',
	'The Explorer',
	'Silent Watcher',
	'Quick Decider',
	'The Researcher',
	'Product Hunter',
	'The Reviewer',
	'Efficient Visitor',
	'The Planner',
	'Impulse Shopper',
	'The Thinker',
	'Action Seeker',
	'Value Finder',
	'The Connector',
	'Quality Scout',
	'The Evaluator',
	'Savvy User',
	'The Optimizer',
	'Experience Hunter',
	'The Curator',
	'Smart Browser',
	'The Pioneer',
];

// Simple hash function to convert string to number
function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

export function generateProfileName(visitorId: string): string {
	const hash = hashString(visitorId);
	const firstNameIndex = hash % firstNames.length;
	const descriptorIndex =
		Math.floor(hash / firstNames.length) % descriptors.length;
	return `${firstNames[firstNameIndex]} ${descriptors[descriptorIndex]}`;
}

