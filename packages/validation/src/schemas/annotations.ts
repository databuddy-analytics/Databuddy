import z from "zod";

export const annotationTimestampSchema = z.union([
	z.iso.date(),
	z.iso.datetime({ offset: true }),
]);

export const annotationCoordinateSchema = z
	.object({
		annotationType: z.enum(["point", "line", "range"]),
		xValue: annotationTimestampSchema,
		xEndValue: annotationTimestampSchema.optional(),
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
