import { describe, expect, it } from "bun:test";
import {
	INTERNAL_ENV_KEYS,
	PROVIDERS,
	providerEnvKeys,
	subprocessors,
} from "./providers";

const envExamplePath = `${import.meta.dir}/../../../.env.example`;

async function readEnvExampleKeys(): Promise<string[]> {
	const contents = await Bun.file(envExamplePath).text();
	const keys: string[] = [];
	for (const line of contents.split("\n")) {
		const match = line.match(/^([A-Z0-9_]+)=/);
		if (match) {
			keys.push(match[1]);
		}
	}
	return keys;
}

describe("providers registry", () => {
	it("has unique ids", () => {
		const ids = PROVIDERS.map((provider) => provider.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("does not map one env key to two providers", () => {
		const seen = new Set<string>();
		const duplicated: string[] = [];
		for (const provider of PROVIDERS) {
			for (const key of provider.envKeys) {
				if (seen.has(key)) {
					duplicated.push(key);
				}
				seen.add(key);
			}
		}
		expect(duplicated).toEqual([]);
	});

	it("discloses every active external processor of personal data", () => {
		const undisclosed = PROVIDERS.filter(
			(provider) =>
				provider.status !== "removed" &&
				provider.processesPersonalData &&
				!provider.selfHosted &&
				!provider.customerConnected &&
				!provider.subprocessor
		).map((provider) => provider.id);
		expect(undisclosed).toEqual([]);
	});

	it("accounts for every env var in .env.example", async () => {
		const known = providerEnvKeys();
		const internal = new Set(INTERNAL_ENV_KEYS);
		const envKeys = await readEnvExampleKeys();
		const unaccounted = envKeys.filter(
			(key) => !(known.has(key) || internal.has(key))
		);
		expect(unaccounted).toEqual([]);
	});

	it("exposes at least the six disclosed subprocessors", () => {
		const ids = new Set(subprocessors().map((provider) => provider.id));
		for (const id of ["hetzner", "railway", "vercel", "bunny", "resend", "stripe"]) {
			expect(ids.has(id)).toBe(true);
		}
	});
});
