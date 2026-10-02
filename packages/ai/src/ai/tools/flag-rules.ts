import type { userRuleSchema } from "@databuddy/shared/flags";
import { z } from "zod";

export type FlagTargetRule = z.infer<typeof userRuleSchema>;

export const flagRolloutBySchema = z
	.enum(["user", "organization", "team"])
	.describe(
		"Identity a rollout percentage buckets by: user (default), organization, or team."
	);

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
