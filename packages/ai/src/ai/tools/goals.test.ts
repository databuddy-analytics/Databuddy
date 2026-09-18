import { expect, mock, test } from "bun:test";
import { asSchema, type ToolExecutionOptions } from "ai";
import type { callRPCProcedure } from "./utils/rpc";

const current = { id: "goal-1", name: "Checkout", isActive: true };
const invoke = mock<typeof callRPCProcedure>(async () => current);
mock.module("./utils/rpc", () => ({ callRPCProcedure: invoke }));

const { createGoalTools } = await import("./goals");

test.each([
	undefined,
	false,
	true,
])("goal updates preview until confirmed, apply requested fields, and skip empty updates (confirmed=%s)", async (confirmed) => {
	const definition = createGoalTools().update_goal;
	const schema = asSchema(definition.inputSchema);
	const options: ToolExecutionOptions = {
		toolCallId: "goal-update",
		messages: [],
		experimental_context: { mutationMode: "allow" },
	};
	if (!(schema.validate && definition.execute)) {
		throw new Error("Missing goal tool validator or executor");
	}

	invoke.mockClear();
	const parsed = await schema.validate({
		id: current.id,
		isActive: false,
		confirmed,
	});
	if (!parsed.success) {
		throw parsed.error;
	}
	const result = await definition.execute(parsed.value, options);
	if (confirmed) {
		expect(result).toMatchObject({ success: true, goal: current });
		expect(invoke.mock.calls).toEqual([
			[
				"goals",
				"update",
				{ id: current.id, isActive: false },
				options.experimental_context,
			],
		]);
	} else {
		expect(result).toMatchObject({
			preview: true,
			confirmationRequired: true,
			current,
			updates: { isActive: false },
		});
		expect(invoke.mock.calls).toEqual([
			["goals", "getById", { id: current.id }, options.experimental_context],
		]);
	}

	invoke.mockClear();
	const emptyInput = await schema.validate({
		id: current.id,
		name: undefined,
		confirmed,
	});
	if (!emptyInput.success) {
		throw emptyInput.error;
	}
	const emptyResult = await definition.execute(emptyInput.value, options);
	expect(emptyResult).toMatchObject({
		preview: true,
		message: "No changes detected. The goal will remain unchanged.",
		confirmationRequired: false,
		current,
		updates: {},
	});
	expect(invoke.mock.calls).toEqual([
		["goals", "getById", { id: current.id }, options.experimental_context],
	]);
});
