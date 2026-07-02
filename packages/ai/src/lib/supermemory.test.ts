import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const originalApiKey = process.env.SUPERMEMORY_API_KEY;
process.env.SUPERMEMORY_API_KEY = "test_supermemory_key";

type ProfileInput = { containerTag: string };
type SearchInput = {
	containerTag: string;
	filters?: unknown;
};

const defaultProfile = () => ({
	profile: { dynamic: [], static: [] },
	searchResults: { results: [] },
});

let profileHandler = async (_input: ProfileInput) => defaultProfile();
let searchHandler = async (_input: SearchInput) => ({ results: [] });

const mockAdd = mock(async () => undefined);
const mockForget = mock(async () => undefined);
const mockProfile = mock((input: ProfileInput) => profileHandler(input));
const mockSearchMemories = mock((input: SearchInput) => searchHandler(input));
const mockClient = {
	add: mockAdd,
	memories: { forget: mockForget },
	profile: mockProfile,
	search: { memories: mockSearchMemories },
};
const mockSupermemory = mock(function Supermemory() {
	return mockClient;
});

mock.module("supermemory", () => ({
	default: mockSupermemory,
}));

const {
	getMemoryContext,
	memoryContainerTag,
	primaryContainerTag,
	searchMemories,
	storeAnalyticsSummary,
	storeConversation,
} = await import("./supermemory");

beforeEach(() => {
	profileHandler = async () => defaultProfile();
	searchHandler = async () => ({ results: [] });
	mockAdd.mockClear();
	mockForget.mockClear();
	mockProfile.mockClear();
	mockSearchMemories.mockClear();
	mockSupermemory.mockClear();
});

afterAll(() => {
	if (originalApiKey === undefined) {
		delete process.env.SUPERMEMORY_API_KEY;
		return;
	}
	process.env.SUPERMEMORY_API_KEY = originalApiKey;
});

describe("supermemory containers", () => {
	test("builds underscore container tags", () => {
		expect(memoryContainerTag("user", "usr_1")).toBe("user_usr_1");
		expect(memoryContainerTag("apikey", "key_1")).toBe("apikey_key_1");
		expect(memoryContainerTag("website", "site_1")).toBe("website_site_1");
		expect(primaryContainerTag("usr_1", null)).toBe("user_usr_1");
		expect(primaryContainerTag(null, "key_1")).toBe("apikey_key_1");
		expect(primaryContainerTag(null, null)).toBe("anonymous");
	});

	test("stores analytics summaries in the website container", async () => {
		await storeAnalyticsSummary("<b>Weekly wins</b>", "site_1", {
			runId: "run_1",
		});

		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({
				containerTag: "website_site_1",
				content: "Weekly wins",
				metadata: expect.objectContaining({
					runId: "run_1",
					source: "databuddy",
					type: "analytics_summary",
					websiteId: "site_1",
				}),
			})
		);
		expect(mockAdd.mock.calls[0]?.[0]).not.toHaveProperty("containerTags");
	});

	test("stores conversation memory in primary and website containers", () => {
		storeConversation(
			[{ role: "user", content: "Watch pricing conversion" }],
			"usr_1",
			null,
			{ websiteId: "site_1" }
		);

		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({
				containerTags: ["user_usr_1", "website_site_1"],
				metadata: expect.objectContaining({ websiteId: "site_1" }),
			})
		);
	});

	test("stores website-scoped anonymous conversation memory without anonymous container", () => {
		storeConversation(
			[{ role: "user", content: "Watch pricing conversion" }],
			null,
			null,
			{ websiteId: "site_1" }
		);

		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({
				containerTags: ["website_site_1"],
				metadata: expect.objectContaining({ websiteId: "site_1" }),
			})
		);
	});

	test("loads memory context from current and legacy containers", async () => {
		profileHandler = async ({ containerTag }) => ({
			profile: {
				dynamic: [`dynamic:${containerTag}`],
				static: [`static:${containerTag}`],
			},
			searchResults: {
				results: [{ memory: `memory:${containerTag}` }],
			},
		});

		const context = await getMemoryContext("pricing", "usr_1", null, {
			websiteId: "site_1",
		});

		expect(mockProfile).toHaveBeenCalledTimes(4);
		expect(mockProfile.mock.calls.map(([input]) => input.containerTag)).toEqual([
			"user_usr_1",
			"website_site_1",
			"user:usr_1",
			"website:site_1",
		]);
		expect(context.staticProfile).toEqual([
			"static:user_usr_1",
			"static:website_site_1",
			"static:user:usr_1",
			"static:website:site_1",
		]);
		expect(context.dynamicProfile).toEqual([
			"dynamic:user_usr_1",
			"dynamic:website_site_1",
			"dynamic:user:usr_1",
			"dynamic:website:site_1",
		]);
		expect(context.relevantMemories).toEqual([
			"memory:user_usr_1",
			"memory:website_site_1",
			"memory:user:usr_1",
			"memory:website:site_1",
		]);
	});

	test("loads anonymous website memory context without anonymous container", async () => {
		profileHandler = async ({ containerTag }) => ({
			profile: {
				dynamic: [`dynamic:${containerTag}`],
				static: [`static:${containerTag}`],
			},
			searchResults: {
				results: [{ memory: `memory:${containerTag}` }],
			},
		});

		await getMemoryContext("pricing", null, null, {
			websiteId: "site_1",
		});

		expect(mockProfile.mock.calls.map(([input]) => input.containerTag)).toEqual([
			"website_site_1",
			"website:site_1",
		]);
	});

	test("searches current and legacy containers with source tags", async () => {
		searchHandler = async ({ containerTag }) => ({
			results:
				containerTag === "website_site_1"
					? [
							{ memory: "website summary", similarity: 0.9 },
							{ memory: "shared memory", similarity: 0.8 },
						]
					: containerTag === "user_usr_1"
						? [
								{ memory: "primary memory", similarity: 0.5 },
								{ memory: "shared memory", similarity: 0.2 },
							]
						: [],
		});

		const results = await searchMemories("pricing", "usr_1", null, {
			limit: 3,
			websiteId: "site_1",
		});

		expect(mockSearchMemories).toHaveBeenCalledTimes(4);
		expect(
			mockSearchMemories.mock.calls.map(([input]) => ({
				containerTag: input.containerTag,
				hasFilters: "filters" in input,
			}))
		).toEqual([
			{ containerTag: "user_usr_1", hasFilters: true },
			{ containerTag: "website_site_1", hasFilters: false },
			{ containerTag: "user:usr_1", hasFilters: true },
			{ containerTag: "website:site_1", hasFilters: false },
		]);
		expect(results).toEqual([
			{
				containerTag: "website_site_1",
				memory: "website summary",
				similarity: 0.9,
			},
			{
				containerTag: "website_site_1",
				memory: "shared memory",
				similarity: 0.8,
			},
			{
				containerTag: "user_usr_1",
				memory: "primary memory",
				similarity: 0.5,
			},
		]);
	});

	test("keeps successful search results when one container fails", async () => {
		searchHandler = async ({ containerTag }) => {
			if (containerTag === "user:usr_1") {
				throw new Error("legacy container unavailable");
			}
			return {
				results:
					containerTag === "user_usr_1"
						? [{ memory: "current memory", similarity: 0.7 }]
						: [],
			};
		};

		const results = await searchMemories("pricing", "usr_1", null, {
			limit: 3,
			websiteId: "site_1",
		});

		expect(mockSearchMemories).toHaveBeenCalledTimes(4);
		expect(results).toEqual([
			{
				containerTag: "user_usr_1",
				memory: "current memory",
				similarity: 0.7,
			},
		]);
	});

	test("searches anonymous website memory without anonymous container", async () => {
		await searchMemories("pricing", null, null, {
			limit: 3,
			websiteId: "site_1",
		});

		expect(
			mockSearchMemories.mock.calls.map(([input]) => input.containerTag)
		).toEqual(["website_site_1", "website:site_1"]);
	});
});
