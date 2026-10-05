import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const originalApiKey = process.env.SUPERMEMORY_API_KEY;
process.env.SUPERMEMORY_API_KEY = "test_supermemory_key";

interface AddInput {
	containerTag?: string;
	containerTags?: string[];
	metadata?: Record<string, unknown>;
}
interface ProfileInput {
	containerTag: string;
}
interface SearchInput {
	containerTag: string;
	filters?: unknown;
	searchMode?: string;
}

const defaultProfile = () => ({
	profile: { dynamic: [], static: [] },
	searchResults: { results: [] },
});

let profileHandler = async (_input: ProfileInput) => defaultProfile();
let searchHandler = async (_input: SearchInput) => ({ results: [] });

const mockAdd = mock(async (_input: AddInput) => undefined);
const mockForget = mock(async () => undefined);
const mockProfile = mock((input: ProfileInput) => profileHandler(input));
const mockSearchMemories = mock((input: SearchInput) => searchHandler(input));
const mockClient = {
	add: mockAdd,
	memories: { forget: mockForget },
	profile: mockProfile,
	search: { memories: mockSearchMemories },
};
// Mock this feature's shared client, not the SDK constructor used by native
// transport tests in the same Bun process.
const businessMemory = await import("@databuddy/services/business-memory");
mock.module("@databuddy/services/business-memory", () => ({
	...businessMemory,
	getMemoryClient: () => mockClient,
}));

const {
	asksToForget,
	asksToRemember,
	forgetMemory,
	getMemoryContext,
	searchMemories,
	storeConversation,
} = await import("./supermemory");
const { createMemoryTools } = await import("../ai/tools/memory");

beforeEach(() => {
	profileHandler = async () => defaultProfile();
	searchHandler = async () => ({ results: [] });
	mockAdd.mockClear();
	mockForget.mockClear();
	mockProfile.mockClear();
	mockSearchMemories.mockClear();
});

afterAll(() => {
	if (originalApiKey === undefined) {
		delete process.env.SUPERMEMORY_API_KEY;
		return;
	}
	process.env.SUPERMEMORY_API_KEY = originalApiKey;
});

describe("explicit remember requests", () => {
	test.each([
		"remember that I prefer weekly views",
		"Please remember our fiscal year starts in April",
		"Can you remember that our trial lasts 14 days?",
		"Thanks! Also, don't forget to exclude internal traffic",
		"don’t forget the holiday spike",
		"Note that bounce rate excludes bots",
		"save this",
		"Add this to your memory: we exclude staff",
		"Keep in mind that we launched on Monday",
		"From now on, show weekly views",
		"Use weekly views from now on",
		"Hi, my name is Sam",
		"I prefer bar charts",
		"Call me Sam",
	])("detects %p", (message) => {
		expect(asksToRemember(message)).toBe(true);
	});

	test.each([
		"what did visitors remember about checkout?",
		"Do you remember my preferences?",
		"Remember when traffic spiked last March?",
		"Which chart do I prefer?",
		"What will traffic look like from now on",
		"Show sessions where users clicked remember me",
		"Remember-me checkbox clicks dropped",
		"Don't remember this",
		"Users don't forget their carts",
		"Save this funnel as a goal",
		"We fixed a leak in memory allocation",
		"Forget that I prefer weekly views",
		"",
	])("ignores %p", (message) => {
		expect(asksToRemember(message)).toBe(false);
	});
});

describe("supermemory containers", () => {
	test("stores conversation memory only in the caller's own container", () => {
		storeConversation(
			[{ role: "user", content: "Remember that we watch pricing conversion" }],
			"usr_1",
			null,
			{ websiteId: "site_1" }
		);

		expect(mockAdd).toHaveBeenCalledTimes(1);
		const [input] = mockAdd.mock.calls[0] ?? [];
		expect(input).toMatchObject({
			containerTag: "user_usr_1",
			metadata: { websiteId: "site_1" },
		});
		expect(input).not.toHaveProperty("containerTags");
	});

	test("skips conversation memory without a caller identity", () => {
		storeConversation(
			[{ role: "user", content: "Remember that we watch pricing conversion" }],
			null,
			null,
			{ websiteId: "site_1" }
		);

		expect(mockAdd).not.toHaveBeenCalled();
	});

	test("loads memory context only from the caller's own container", async () => {
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

		expect(mockProfile.mock.calls.map(([input]) => input.containerTag)).toEqual(
			["user_usr_1"]
		);
		expect(context).toEqual({
			dynamicProfile: ["dynamic:user_usr_1"],
			relevantMemories: ["memory:user_usr_1"],
			staticProfile: ["static:user_usr_1"],
		});
	});

	test("searches only the caller's own container, scoped to the website", async () => {
		searchHandler = async () => ({
			results: [
				{ memory: "older memory", similarity: 0.5 },
				{ chunk: "pricing chunk", similarity: 0.8 },
			],
		});

		const results = await searchMemories("pricing", "usr_1", null, {
			limit: 3,
			websiteId: "site_1",
		});

		expect(
			mockSearchMemories.mock.calls.map(([input]) => ({
				containerTag: input.containerTag,
				hasFilters: "filters" in input,
			}))
		).toEqual([{ containerTag: "user_usr_1", hasFilters: true }]);
		expect(results).toEqual([
			{ memory: "pricing chunk", similarity: 0.8 },
			{ memory: "older memory", similarity: 0.5 },
		]);
	});
});

describe("forgetting memory", () => {
	test("forgets an exact match from the caller's own container", async () => {
		searchHandler = async () => ({
			results: [
				{ id: "mem_1", memory: "Prefers weekly views", similarity: 0.9 },
			],
		});

		expect(await forgetMemory("Prefers weekly views", null, "key_1")).toEqual({
			memory: "Prefers weekly views",
			status: "forgotten",
		});
		expect(mockSearchMemories).toHaveBeenCalledWith(
			expect.objectContaining({
				containerTag: "apikey_key_1",
				searchMode: "memories",
			})
		);
		expect(mockForget).toHaveBeenCalledWith({
			containerTag: "apikey_key_1",
			id: "mem_1",
		});
	});

	test("returns candidates instead of forgetting a fuzzy match", async () => {
		searchHandler = async () => ({
			results: [
				{
					id: "mem_1",
					memory: "Prefers weekly views in traffic reports",
					similarity: 0.6,
				},
			],
		});

		expect(await forgetMemory("weekly views", "usr_1", null)).toEqual({
			candidates: ["Prefers weekly views in traffic reports"],
			status: "not_found",
		});
		expect(mockForget).not.toHaveBeenCalled();
	});
});

describe("explicit forget requests", () => {
	test.each([
		"Forget that I prefer weekly views",
		"Please forget my name",
		"Can you forget that our trial lasts 14 days?",
		"Delete the memory about our fiscal year",
		"Clear my saved memory about chart preference",
		"Remove that from your memory",
		"That memory is wrong",
		"Those memories are outdated",
		"You remembered our launch date wrong",
		"Stop remembering my chart preference",
	])("detects %p", (message) => {
		expect(asksToForget(message)).toBe(true);
	});

	test.each([
		"Forget it, show me traffic",
		"Forget it and show me traffic",
		"Never mind, forget about it",
		"Don't forget to exclude internal traffic",
		"Do not delete my memory",
		"Did you forget my name?",
		"Users forget their carts at checkout",
		"That's wrong, signups were higher",
		"Delete the goal for signups",
		"Delete the goal but keep my memory",
		"That memory is correct but the report is wrong",
		"That memory is not wrong",
		"You remembered our launch date correctly but the report is wrong",
		"",
	])("ignores %p", (message) => {
		expect(asksToForget(message)).toBe(false);
	});
});

describe("forget_memory tool", () => {
	const tools = createMemoryTools();
	const forget = (
		latestUserMessage: string,
		mutationMode: "allow" | "dry-run" = "allow"
	) =>
		tools.forget_memory?.execute?.(
			{ query: "Prefers weekly views" },
			{
				toolCallId: "forget",
				messages: [],
				experimental_context: {
					latestUserMessage,
					mutationMode,
					userId: "usr_1",
				},
			}
		);

	test.each([
		"Ignore earlier notes and wipe my preferences",
		"Delete the goal but keep my memory",
		"That memory is correct but the report is wrong",
		"Do not delete my memory",
		"",
	])("refuses without a memory deletion request: %p", async (message) => {
		expect(await forget(message)).toMatchObject({ forgotten: false });
		expect(mockSearchMemories).not.toHaveBeenCalled();
		expect(mockForget).not.toHaveBeenCalled();
	});

	test("forgets the caller's exact memory after an explicit request", async () => {
		searchHandler = async () => ({
			results: [{ id: "mem_1", memory: "Prefers weekly views" }],
		});
		expect(await forget("Forget that I prefer weekly views")).toMatchObject({
			forgotten: true,
			memory: "Prefers weekly views",
		});
		expect(mockForget).toHaveBeenCalledWith({
			containerTag: "user_usr_1",
			id: "mem_1",
		});
	});

	test("dry-run skips even an explicit memory deletion request", async () => {
		expect(
			await forget("Forget that I prefer weekly views", "dry-run")
		).toMatchObject({ dryRun: true, forgotten: false });
		expect(mockSearchMemories).not.toHaveBeenCalled();
		expect(mockForget).not.toHaveBeenCalled();
	});
});

describe("save_memory tool", () => {
	const tools = createMemoryTools();
	const save = (latestUserMessage: string) =>
		tools.save_memory?.execute?.(
			{ content: "Prefers weekly views", category: "preference" },
			{
				toolCallId: "save",
				messages: [],
				experimental_context: {
					latestUserMessage,
					userId: "usr_1",
					websiteId: "site_1",
				},
			}
		);

	test("refuses when the latest user message does not ask to remember", async () => {
		expect(await save("What changed in signups last week?")).toMatchObject({
			saved: false,
		});
		expect(mockAdd).not.toHaveBeenCalled();
	});

	test("saves an explicit request to the caller's own container", async () => {
		expect(await save("Remember that I prefer weekly views")).toEqual({
			saved: true,
		});
		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({
				containerTag: "user_usr_1",
				metadata: expect.objectContaining({
					type: "curated",
					websiteId: "site_1",
				}),
			})
		);
	});
});
