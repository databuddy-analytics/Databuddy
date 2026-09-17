import { expect, spyOn, test } from "bun:test";
import { asSchema, type ToolExecutionOptions } from "ai";
import * as rpc from "./utils/rpc";

const { createGoalTools } = await import("./goals");

test("goal updates preview until confirmed and apply only the requested fields", async () => {
	const current = { id: "goal-1", name: "Checkout", isActive: true };
	const invoke = spyOn(rpc, "callRPCProcedure").mockResolvedValue(current);
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

	try {
		for (const confirmed of [undefined, false, true]) {
			invoke.mockClear();
			const parsed = await schema.validate({
				id: current.id,
				isActive: false,
				confirmed,
			});
			if (!parsed.success) throw parsed.error;
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
					[
						"goals",
						"getById",
						{ id: current.id },
						options.experimental_context,
					],
				]);
			}
		}
	} finally {
		invoke.mockRestore();
	}
});
