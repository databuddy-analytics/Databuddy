import type { userRuleSchema } from "@databuddy/shared/flags";
import type { z } from "zod";

export type FlagTargetRule = z.infer<typeof userRuleSchema>;

export function createUserTargetRule(
	type: "email" | "user_id",
	values: string[]
): FlagTargetRule {
	return {
		batch: true,
		batchValues: values,
		enabled: true,
		operator: "in",
		type,
		values,
	};
}
