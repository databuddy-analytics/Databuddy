import { z } from "zod";

const timestamp = z.iso
	.datetime({ offset: true })
	.refine((value) => Number.isFinite(Date.parse(value)));
export const businessSourceSchema = z.object({
	id: z.string().min(1).max(500),
	kind: z.enum(["website", "team_reply"]),
	content: z.string().min(1).max(12_000),
	observedAt: timestamp,
	url: z.url().max(2048).optional(),
	internalLinks: z.array(z.string().max(300)).max(10).optional(),
	subjectKey: z.string().max(500).optional(),
	author: z.string().max(200).optional(),
	expiresAt: timestamp.optional(),
});
export type BusinessSource = z.infer<typeof businessSourceSchema>;
export const businessTopicSchema = z.enum([
	"offering",
	"audience",
	"business_model",
	"activation",
	"capabilities",
	"constraints",
	"priorities",
	"event_semantics",
]);
export const businessBriefSchema = z.object({
	facts: z
		.array(
			z.object({
				topic: businessTopicSchema,
				claim: z
					.string()
					.min(1)
					.max(1000)
					.describe(
						"Concise business explanation supported by every cited passage. Preserve access, measurement and identity qualifications."
					),
				evidence: z
					.array(
						z.object({
							sourceId: z.string().min(1).max(500),
							quote: z
								.string()
								.min(1)
								.max(800)
								.describe(
									"Exact contiguous supporting passage, including its qualifications."
								),
						})
					)
					.min(1)
					.max(6),
			})
		)
		.min(1)
		.max(12),
	unknowns: z
		.array(
			z.object({
				topic: businessTopicSchema,
				question: z.string().min(1).max(200),
			})
		)
		.max(8),
});
export type BusinessBrief = z.infer<typeof businessBriefSchema>;
export const businessContextSchema = z.object({
	capturedAt: timestamp,
	status: z.enum(["ready", "partial", "unavailable", "disabled"]),
	sources: z.array(businessSourceSchema).max(16),
	issues: z.array(z.string().max(200)).max(20),
	brief: businessBriefSchema.optional(),
});
export type BusinessContext = z.infer<typeof businessContextSchema>;
export const businessProfileSchema = z
	.object({
		capturedAt: timestamp,
		sources: z
			.array(
				businessSourceSchema.extend({ content: z.string().min(1).max(12_000) })
			)
			.max(16),
		brief: businessBriefSchema.nullable(),
		issues: z.array(z.string().max(200)).max(20),
	})
	.superRefine((profile, context) => {
		const sources = new Map(
			profile.sources.map((source) => [source.id, source])
		);
		if (sources.size !== profile.sources.length) {
			context.addIssue({
				code: "custom",
				message: "Source IDs must be unique",
				path: ["sources"],
			});
		}
		for (const [index, fact] of (profile.brief?.facts ?? []).entries()) {
			if (
				!fact.evidence.every((citation) =>
					sources.get(citation.sourceId)?.content.includes(citation.quote)
				)
			) {
				context.addIssue({
					code: "custom",
					message: "Every brief citation must occur in its attributed source",
					path: ["brief", "facts", index],
				});
			}
		}
	});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
