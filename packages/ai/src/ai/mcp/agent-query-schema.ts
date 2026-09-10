import { z } from "zod";
import { FilterSchema, MCP_DATE_PRESETS } from "./mcp-utils";

// Strict providers may require every key. Accept explicit null on the wire,
// then pass ordinary optional values to the existing query planner.
function optionalInput<T extends z.ZodType>(schema: T) {
	return schema.nullish().transform((value) => value ?? undefined);
}

export const agentDataInputSchema = z.object({
	websiteId: z.string(),
	queries: z
		.array(
			z.object({
				type: z.string(),
				preset: optionalInput(
					z.enum(MCP_DATE_PRESETS as [string, ...string[]])
				).describe(
					"Date preset, or null when supplying explicit from/to dates."
				),
				from: optionalInput(z.string()).describe(
					"Inclusive YYYY-MM-DD, or null when using a preset."
				),
				to: optionalInput(z.string()).describe(
					"Inclusive YYYY-MM-DD, or null when using a preset."
				),
				timeUnit: optionalInput(
					z.enum(["minute", "hour", "day", "week", "month"])
				),
				limit: optionalInput(z.number().min(1).max(1000)),
				filters: optionalInput(
					z.array(FilterSchema.omit({ target: true, having: true }).strict())
				),
				groupBy: optionalInput(z.array(z.string())),
				orderBy: optionalInput(z.string()).describe(
					"Null uses the builder's default. Otherwise an output column plus ASC or DESC; never count_desc."
				),
			})
		)
		.min(1)
		.max(10),
	timezone: z
		.string()
		.nullish()
		.transform((value) => value ?? "UTC"),
});
