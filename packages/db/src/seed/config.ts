export type SeedResetMode = 'append' | 'truncate';

export interface SeedConfig {
	scenario: string;
	fakerSeed?: number;
	users?: number;
	websites?: number;
	events?: number;
	domain?: string;
	reset?: SeedResetMode;
	dryRun: boolean;
	batchSizeEvents: number;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
	scenario: 'base',
	dryRun: false,
	batchSizeEvents: 5_000,
	domain: 'example.com',
};

export interface ParseSeedArgsOptions {
	argv?: string[];
}

export function parseSeedArgs(
	options: ParseSeedArgsOptions = {}
): SeedConfig {
	const { argv = process.argv.slice(2) } = options;
	const resolved: Partial<SeedConfig> = {};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];

		switch (arg) {
			case '--scenario':
			case '-s': {
				resolved.scenario = argv[++index] ?? resolved.scenario;
				break;
			}

			case '--faker-seed':
			case '--seed': {
				const next = argv[++index];
				if (next) {
					const seed = Number.parseInt(next, 10);
					if (!Number.isNaN(seed)) {
						resolved.fakerSeed = seed;
					}
				}
				break;
			}

			case '--users': {
				const value = Number.parseInt(argv[++index] ?? '', 10);
				if (!Number.isNaN(value)) {
					resolved.users = value;
				}
				break;
			}

			case '--websites': {
				const value = Number.parseInt(argv[++index] ?? '', 10);
				if (!Number.isNaN(value)) {
					resolved.websites = value;
				}
				break;
			}

			case '--events':
			case '-e': {
				const value = Number.parseInt(argv[++index] ?? '', 10);
				if (!Number.isNaN(value)) {
					resolved.events = value;
				}
				break;
			}

			case '--reset': {
				const value = argv[++index];
				if (value === 'append' || value === 'truncate') {
					resolved.reset = value;
				}
				break;
			}

			case '--domain': {
				resolved.domain = argv[++index] ?? resolved.domain;
				break;
			}

			case '--dry-run':
			case '--dryRun': {
				resolved.dryRun = true;
				break;
			}

			case '--batch-size-events': {
				const value = Number.parseInt(argv[++index] ?? '', 10);
				if (!Number.isNaN(value)) {
					resolved.batchSizeEvents = value;
				}
				break;
			}

			default:
				// Ignore unknown options to keep the interface forgiving for now
				break;
		}
	}

	return resolveSeedConfig(resolved);
}

export function resolveSeedConfig(
	overrides: Partial<SeedConfig>
): SeedConfig {
	return {
		...DEFAULT_SEED_CONFIG,
		...overrides,
	};
}
