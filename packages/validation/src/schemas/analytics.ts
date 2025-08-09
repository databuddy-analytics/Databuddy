import z from 'zod';
import { MAX_FUTURE_MS, MIN_TIMESTAMP, VALIDATION_LIMITS } from '../constants';
import {
	LANGUAGE_REGEX,
	LOCALHOST_URL_REGEX,
	RESOLUTION_REGEX,
} from '../regexes';

const resolutionSchema = z
	.string()
	.regex(RESOLUTION_REGEX, "Must be in the format 'WIDTHxHEIGHT'")
	.refine((val) => {
		const match = val.match(RESOLUTION_REGEX);
		if (!match) {
			return false;
		}
		const width = Number(match[1]);
		const height = Number(match[2]);
		return (
			width >= VALIDATION_LIMITS.RESOLUTION_MIN &&
			width <= VALIDATION_LIMITS.RESOLUTION_MAX &&
			height >= VALIDATION_LIMITS.RESOLUTION_MIN &&
			height <= VALIDATION_LIMITS.RESOLUTION_MAX
		);
	}, 'Width/height out of range (240-10000)');

const languageSchema = z.string().regex(LANGUAGE_REGEX, 'Invalid language tag');

const connectionTypeSchema = z
	.enum([
		'bluetooth',
		'cellular',
		'ethernet',
		'none',
		'wifi',
		'wimax',
		'other',
		'unknown',
		'slow-2g',
		'2g',
		'3g',
		'4g',
	])
	.nullable()
	.optional();

const timestampSchema = z
	.number()
	.int()
	.gte(MIN_TIMESTAMP)
	.nullable()
	.optional()
	.refine((val) => val == null || val <= Date.now() + MAX_FUTURE_MS, {
		message: 'Timestamp too far in the future (max 1 hour ahead)',
	});

export const analyticsEventSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH),
	name: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	timestamp: timestampSchema,
	sessionStartTime: timestampSchema,
	referrer: (process.env.NODE_ENV === 'development'
		? z.any()
		: z.union([
				z.url({ protocol: /^https?$/, hostname: z.regexes.domain }),
				z.literal('direct'),
			])
	)
		.nullable()
		.optional(),
	path: z.union([
		z.url({ protocol: /^https?$/, hostname: z.regexes.domain }),
		z.string().regex(LOCALHOST_URL_REGEX),
	]),
	title: z
		.string()
		.max(VALIDATION_LIMITS.TITLE_MAX_LENGTH)
		.nullable()
		.optional(),
	screen_resolution: resolutionSchema.nullable().optional(),
	viewport_size: resolutionSchema.nullable().optional(),
	language: languageSchema.nullable().optional(),
	timezone: z
		.string()
		.max(VALIDATION_LIMITS.TIMEZONE_MAX_LENGTH)
		.nullable()
		.optional(),
	connection_type: connectionTypeSchema,
	rtt: z.number().int().max(VALIDATION_LIMITS.RTT_MAX).nullable().optional(),
	downlink: z
		.number()
		.max(VALIDATION_LIMITS.DOWNLINK_MAX)
		.nullable()
		.optional(),
	time_on_page: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.TIME_ON_PAGE_MAX)
		.nullable()
		.optional(),
	scroll_depth: z
		.number()
		.max(VALIDATION_LIMITS.SCROLL_DEPTH_MAX)
		.nullable()
		.optional(),
	interaction_count: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.INTERACTION_COUNT_MAX)
		.nullable()
		.optional(),
	exit_intent: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.EXIT_INTENT_MAX)
		.nullable()
		.optional(),
	page_count: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.PAGE_COUNT_MAX)
		.nullable()
		.optional(),
	is_bounce: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.IS_BOUNCE_MAX)
		.nullable()
		.optional(),
	has_exit_intent: z.boolean().nullable().optional(),
	page_size: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.PAGE_SIZE_MAX)
		.nullable()
		.optional(),
	utm_source: z
		.string()
		.max(VALIDATION_LIMITS.UTM_MAX_LENGTH)
		.nullable()
		.optional(),
	utm_medium: z
		.string()
		.max(VALIDATION_LIMITS.UTM_MAX_LENGTH)
		.nullable()
		.optional(),
	utm_campaign: z
		.string()
		.max(VALIDATION_LIMITS.UTM_MAX_LENGTH)
		.nullable()
		.optional(),
	utm_term: z
		.string()
		.max(VALIDATION_LIMITS.UTM_MAX_LENGTH)
		.nullable()
		.optional(),
	utm_content: z
		.string()
		.max(VALIDATION_LIMITS.UTM_MAX_LENGTH)
		.nullable()
		.optional(),
	load_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	dom_ready_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	dom_interactive: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	ttfb: z.number().max(VALIDATION_LIMITS.PERFORMANCE_MAX).nullable().optional(),
	connection_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	request_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	render_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	redirect_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	domain_lookup_time: z
		.number()
		.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
		.nullable()
		.optional(),
	fcp: z.number().max(VALIDATION_LIMITS.PERFORMANCE_MAX).nullable().optional(),
	lcp: z.number().max(VALIDATION_LIMITS.PERFORMANCE_MAX).nullable().optional(),
	cls: z.number().max(VALIDATION_LIMITS.CLS_MAX).nullable().optional(),
	fid: z.number().max(VALIDATION_LIMITS.FID_MAX).nullable().optional(),
	inp: z.number().max(VALIDATION_LIMITS.INP_MAX).nullable().optional(),
	href: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH).nullable().optional(),
	text: z.string().max(VALIDATION_LIMITS.TEXT_MAX_LENGTH).nullable().optional(),
	value: z
		.string()
		.max(VALIDATION_LIMITS.VALUE_MAX_LENGTH)
		.nullable()
		.optional(),
	properties: z.record(z.any(), z.any()).optional().nullable(),
});
