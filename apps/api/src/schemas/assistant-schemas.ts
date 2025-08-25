import { t } from 'elysia';

export const AssistantRequestSchema = t.Object(
	{
		conversationId: t.Optional(t.String({ 
			maxLength: 100, 
			pattern: '^[a-zA-Z0-9_-]+$' 
		})),
		messages: t.Array(
			t.Object(
				{
					role: t.Union([t.Literal('user'), t.Literal('assistant')]),
					content: t.String({ 
						minLength: 1, 
						maxLength: 10000 
					}),
				},
				{ additionalProperties: false }
			),
			{ minItems: 1, maxItems: 100 }
		),
		websiteId: t.String({ 
			maxLength: 100, 
			pattern: '^[a-zA-Z0-9_-]+$' 
		}),
		model: t.Optional(
			t.Union([t.Literal('chat'), t.Literal('agent'), t.Literal('agent-max')])
		),
	},
	{ additionalProperties: false }
);

export type AssistantRequestType = typeof AssistantRequestSchema.static;
