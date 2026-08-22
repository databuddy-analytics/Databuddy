import z from "zod";

export const isoDateOrOffsetDateTimeSchema = z.union([
	z.iso.date(),
	z.iso.datetime({ offset: true }),
]);

export const annotationChartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string(),
		end_date: z.string(),
		granularity: z.enum(["hourly", "daily", "weekly", "monthly"]),
	}),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(["eq", "ne", "gt", "lt", "contains"]),
				value: z.string(),
			})
		)
		.optional(),
	metrics: z.array(z.string()).optional(),
	tabId: z.string().optional(),
});

export const annotationCoordinateSchema = z
	.object({
		annotationType: z.enum(["point", "line", "range"]),
		xValue: isoDateOrOffsetDateTimeSchema,
		xEndValue: isoDateOrOffsetDateTimeSchema.optional(),
	})
	.superRefine((input, context) => {
		if (input.annotationType === "range" && !input.xEndValue) {
			context.addIssue({
				code: "custom",
				message:
					"Range annotations require an xEndValue to define the end of the time period.",
				path: ["xEndValue"],
			});
		}
		if (input.xEndValue && new Date(input.xEndValue) < new Date(input.xValue)) {
			context.addIssue({
				code: "custom",
				message: "xEndValue must be on or after xValue.",
				path: ["xEndValue"],
			});
		}
	});
