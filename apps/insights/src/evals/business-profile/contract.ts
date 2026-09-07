import { z } from "zod";

export const topics = [
	"offering",
	"audience",
	"business_model",
	"activation",
	"event_semantics",
	"capabilities",
	"constraints",
	"priorities",
] as const;
export const sourceSchema = z.object({
	id: z.string(),
	kind: z.enum(["public", "team_correction", "emitter"]),
	url: z.string(),
	observedAt: z.string(),
	content: z.string().min(1).max(12_000),
});
export type Source = z.infer<typeof sourceSchema>;
export const questionSchema = z.object({
	id: z.string(),
	question: z.string(),
	options: z.array(z.string()).min(2),
	expected: z.string(),
	rationale: z.string(),
});
export const caseSchema = z.object({
	id: z.string(),
	sources: z.array(sourceSchema).min(1).max(8),
	questions: z.array(questionSchema).min(1),
});
export type Case = z.infer<typeof caseSchema>;
export const proseSchema = z.object({
	summary: z
		.string()
		.describe(
			"At most 600 words of sourced prose. Include source IDs, commercial qualifications, source authority, uncertainties and corrections."
		),
});
export const claimsSchema = z.object({
	facts: z
		.array(
			z.object({
				topic: z.enum(topics),
				claim: z.string(),
				qualification: z
					.string()
					.describe(
						"Preserve scope, conditions, exclusions, source authority, conflicts, and uncertainty; empty only if none."
					),
				sourceIds: z.array(z.string()).min(1),
			})
		)
		.max(20),
	unknowns: z
		.array(
			z.object({ topic: z.enum(topics), question: z.string().min(1).max(200) })
		)
		.max(8),
});
export const quotesSchema = z.object({
	facts: z
		.array(
			z.object({
				topic: z.enum(topics),
				sourceId: z.string(),
				quote: z
					.string()
					.min(1)
					.max(800)
					.describe(
						"Exact contiguous source substring, including punctuation and whitespace. No ellipses or rewritten words. Select complete conditions, not misleading fragments."
					),
			})
		)
		.max(20),
	unknowns: z
		.array(
			z.object({ topic: z.enum(topics), question: z.string().min(1).max(200) })
		)
		.max(8),
});
export const answerSchema = z.object({
	summary: z
		.string()
		.describe(
			"At most 100 words; useful business understanding with qualifications."
		),
	answers: z.array(
		z.object({
			questionId: z.string(),
			decision: z
				.string()
				.describe("Copy exactly one of this question's offered options."),
			explanation: z
				.string()
				.describe(
					"At most 55 words, explaining the business meaning and necessary qualifications."
				),
			sourceIds: z.array(z.string()),
		})
	),
});
export const strategies = [
	"raw",
	"prose",
	"claims",
	"quotes",
	"adapter",
] as const;
export type Strategy = (typeof strategies)[number];
const whitespace = /\s+/u;
export const words = (value: string) =>
	value.trim().split(whitespace).filter(Boolean).length;

export function validateBrief(
	strategy: Strategy,
	value: unknown,
	sources: Source[],
	maxFacts = 16,
	maxWords = 600
) {
	const errors: string[] = [];
	if (strategy === "raw" || strategy === "adapter") {
		return errors;
	}
	const ids = new Set(sources.map((source) => source.id));
	if (strategy === "prose") {
		const parsed = proseSchema.parse(value);
		if (words(parsed.summary) > maxWords) {
			errors.push(`word budget: ${words(parsed.summary)} > ${maxWords}`);
		}
		return errors;
	}
	if (strategy === "claims") {
		const parsed = claimsSchema.parse(value);
		if (parsed.facts.length > maxFacts) {
			errors.push(`fact budget: ${parsed.facts.length} > ${maxFacts}`);
		}
		const count = words(
			parsed.facts
				.map((fact) => `${fact.claim} ${fact.qualification}`)
				.join(" ")
		);
		if (count > maxWords) {
			errors.push(`word budget: ${count} > ${maxWords}`);
		}
		for (const [index, fact] of parsed.facts.entries()) {
			for (const id of fact.sourceIds) {
				if (!ids.has(id)) {
					errors.push(`fact ${index}: unknown source ${id}`);
				}
			}
		}
		return errors;
	}
	const parsed = quotesSchema.parse(value);
	if (parsed.facts.length > maxFacts) {
		errors.push(`fact budget: ${parsed.facts.length} > ${maxFacts}`);
	}
	const count = words(parsed.facts.map((fact) => fact.quote).join(" "));
	if (count > maxWords) {
		errors.push(`word budget: ${count} > ${maxWords}`);
	}
	for (const [index, fact] of parsed.facts.entries()) {
		const source = sources.find((item) => item.id === fact.sourceId);
		if (!source) {
			errors.push(`fact ${index}: unknown source ${fact.sourceId}`);
		}
		if (source && !source.content.includes(fact.quote)) {
			errors.push(
				`fact ${index}: quotation does not occur verbatim in ${fact.sourceId}`
			);
		}
	}
	return errors;
}

export function scoreAnswers(
	value: z.infer<typeof answerSchema>,
	fixture: Case
) {
	const errors: string[] = [];
	const ids = new Set(fixture.sources.map((source) => source.id));
	for (const question of fixture.questions) {
		const answers = value.answers.filter(
			(answer) => answer.questionId === question.id
		);
		if (answers.length !== 1) {
			errors.push(`${question.id}: expected one answer; got ${answers.length}`);
			continue;
		}
		const answer = answers[0];
		if (answer.decision !== question.expected) {
			errors.push(
				`${question.id}: expected ${question.expected}; got ${answer.decision}`
			);
		}
		for (const id of answer.sourceIds) {
			if (!ids.has(id)) {
				errors.push(`${question.id}: unknown citation ${id}`);
			}
		}
	}
	for (const answer of value.answers) {
		if (
			!fixture.questions.some((question) => question.id === answer.questionId)
		) {
			errors.push(`unknown question ${answer.questionId}`);
		}
	}
	return {
		total: fixture.questions.length,
		correct: fixture.questions.filter(
			(question) =>
				value.answers.filter((answer) => answer.questionId === question.id)
					.length === 1 &&
				value.answers.find((answer) => answer.questionId === question.id)
					?.decision === question.expected
		).length,
		errors,
		reviewRequired:
			"Review explanations, source entailment, omitted facts, and misleading partial quotes; decision matching alone is not semantic proof.",
	};
}
