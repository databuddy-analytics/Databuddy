import { z } from "zod";

export const MonitorStatus = {
	DOWN: 0,
	UP: 1,
	PENDING: 2,
	MAINTENANCE: 3,
} as const;

export const uptimeDataSchema = z.object({
	attempt: z.number(),
	check_type: z.string(),
	content_hash: z.string(),
	env: z.string(),
	error: z.string(),
	event_id: z.string(),
	failure_streak: z.number(),
	http_code: z.number(),
	json_data: z.string().optional(),
	probe_ip: z.string(),
	probe_region: z.string(),
	redirect_count: z.number(),
	response_bytes: z.number(),
	retries: z.number(),
	site_id: z.string(),
	ssl_expiry: z.number(),
	ssl_valid: z.number(),
	status: z.number(),
	timestamp: z.number(),
	total_ms: z.number(),
	ttfb_ms: z.number(),
	url: z.string(),
	user_agent: z.string(),
});

const requiredUnknownSchema = z
	.unknown()
	.refine((value) => value !== undefined, "Required");

export const uptimeCheckJobDataSchema = z
	.object({
		delivery: z.object({ event: requiredUnknownSchema }).optional(),
		scheduleId: z.string(),
		trigger: z.enum(["manual", "scheduled"]),
	})
	.passthrough();

export const uptimeDeliveryJobDataSchema = z.object({
	event: requiredUnknownSchema,
});

export type UptimeData = z.infer<typeof uptimeDataSchema>;

export type ScheduleLookupReason = "not_found" | "malformed" | "transient";

export type ActionResult<T> =
	| { success: true; data: T }
	| { success: false; error: string; reason?: ScheduleLookupReason };
