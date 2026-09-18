import { afterEach, expect, mock, test } from "bun:test";
import { asSchema, type InferToolInput } from "ai";
import type { callRPCProcedure } from "./utils/rpc";

const currentRules = [
	{
		type: "email",
		operator: "equals",
		value: "existing@example.com",
		enabled: true,
		batch: false,
	},
];
const invoke = mock<typeof callRPCProcedure>(async () => ({
	id: "flag-1",
	key: "checkout-v2",
	status: "active",
	rules: currentRules,
}));
mock.module("./utils/rpc", () => ({ callRPCProcedure: invoke }));
mock.module("../../lib/website-utils", () => ({
	getCachedWebsite: async () => ({
		id: "site-1",
		organizationId: "org-1",
		domain: "example.com",
	}),
}));
mock.module("@databuddy/redis/rate-limit", () => ({
	ratelimit: async () => ({ success: true }),
	getRateLimitHeaders: () => ({}),
}));

const { createInternalPrincipal } = await import("@databuddy/rpc");
const { createMcpTools } = await import("../mcp/tools");
const { createFlagTools } = await import("./flags");
const nativeTool = createFlagTools().add_users_to_flag;
const mcpTool = createMcpTools({
	...createInternalPrincipal({
		organizationId: "org-1",
		scopes: ["read:data", "write:flags"],
	}),
	requestHeaders: new Headers(),
	userId: null,
}).find((tool) => tool.name === "add_users_to_flag");

afterEach(() => invoke.mockClear());

const boundaries = ["native", "mcp"] as const;
const modes = ["append", "replace"] as const;
const cases = boundaries.flatMap((boundary) =>
	modes.flatMap((mode) =>
		[false, true].map((confirmed) => ({ boundary, mode, confirmed }))
	)
);

async function executeTargeting(
	boundary: (typeof boundaries)[number],
	input: Omit<
		InferToolInput<typeof nativeTool>,
		"flagId" | "websiteId" | "matchBy"
	> &
		Partial<Pick<InferToolInput<typeof nativeTool>, "matchBy">>
) {
	const args = { flagId: "flag-1", websiteId: "site-1", ...input };
	if (boundary === "mcp") {
		if (!mcpTool) {
			throw new Error("Missing MCP flag targeting tool");
		}
		return mcpTool.handler(args);
	}
	const schema = asSchema(nativeTool.inputSchema);
	if (!(schema.validate && nativeTool.execute)) {
		throw new Error("Missing native flag targeting validator or executor");
	}
	const parsed = await schema.validate(args);
	if (!parsed.success) {
		return { isError: true };
	}
	return {
		isError: false,
		structuredContent: await nativeTool.execute(parsed.value, {
			toolCallId: "flag-targeting",
			messages: [],
			experimental_context: { mutationMode: "allow" },
		}),
	};
}

test.each(
	cases.flatMap((testCase) =>
		[
			{ name: "blank-only", users: [" \t\n "] },
			{ name: "mixed valid and blank", users: ["new@example.com", "   "] },
		].map((input) => ({ ...testCase, ...input }))
	)
)("$boundary rejects $name users before RPC, mode=$mode confirmed=$confirmed", async ({
	boundary,
	users,
	mode,
	confirmed,
}) => {
	const result = await executeTargeting(boundary, { users, mode, confirmed });
	expect(result.isError).toBe(true);
	expect(invoke).not.toHaveBeenCalled();
});

test.each(
	cases.flatMap((testCase) =>
		(["email", "user_id"] as const).map((matchBy) => ({
			...testCase,
			matchBy,
		}))
	)
)("$boundary preserves normalized $matchBy targeting, mode=$mode confirmed=$confirmed", async ({
	boundary,
	mode,
	confirmed,
	matchBy,
}) => {
	const result = await executeTargeting(boundary, {
		users: [" new@example.com ", "new@example.com", "other@example.com"],
		mode,
		confirmed,
		matchBy,
	});
	expect(result.isError).toBe(false);
	const mutations = invoke.mock.calls.filter(
		([, method]) => method === "update"
	);
	if (!confirmed) {
		expect(mutations).toEqual([]);
		expect(result.structuredContent).toMatchObject({
			preview: true,
			targeting: { userCount: 2, ruleCountAfter: mode === "replace" ? 1 : 2 },
		});
		return;
	}
	const nextRule = {
		batch: true,
		batchValues: ["new@example.com", "other@example.com"],
		enabled: true,
		operator: "in",
		type: matchBy,
		values: ["new@example.com", "other@example.com"],
	};
	expect(mutations).toHaveLength(1);
	expect(mutations[0]?.[2]).toEqual({
		id: "flag-1",
		rules: mode === "replace" ? [nextRule] : [...currentRules, nextRule],
	});
});
