import { t } from 'elysia';

export const AssistantRequestSchema = t.Object({
	messages: t.Array(
		t.Object({
			role: t.Union([t.Literal('user'), t.Literal('assistant')]),
			content: t.String(),
		})
	),
	websiteId: t.String(),
	model: t.Optional(
		t.Union([t.Literal('chat'), t.Literal('agent'), t.Literal('agent-max')])
	)
});

export type AssistantRequestType = typeof AssistantRequestSchema.static;
