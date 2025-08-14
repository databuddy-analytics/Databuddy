import { z } from 'zod';

// Email event validation schema
export const emailEventSchema = z.object({
	email_id: z.string().min(1).max(255),
	domain: z.string().min(1).max(255),
	labels: z.array(z.string().max(100)).optional().default([]),
	event_time: z.number().int().positive().optional(),
	received_at: z.number().int().positive().optional(),
	metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const batchEmailEventSchema = z.array(emailEventSchema).max(100);

export type EmailEventInput = z.infer<typeof emailEventSchema>;
export type BatchEmailEventInput = z.infer<typeof batchEmailEventSchema>;
