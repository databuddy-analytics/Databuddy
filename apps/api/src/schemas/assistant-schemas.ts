import { t } from 'elysia';

export const AssistantRequestSchema = t.Object(
	{
		id: t.Required(t.String()),
		message: t.Object({
			id: t.String(),
			role: t.Union([t.Literal('user'), t.Literal('assistant')]),
			parts: t.Array(
				t.Object({
					type: t.Literal('text'),
					text: t.String(),
				})
			),
		}),
		websiteId: t.Required(t.String()),
		selectedChatModel: t.Required(
			t.Union([
				t.Literal('chat-model'),
				t.Literal('agent-model'),
				t.Literal('agent-max-model'),
			])
		),
	},
	{ additionalProperties: false }
);

export type AssistantRequestType = typeof AssistantRequestSchema.static;
