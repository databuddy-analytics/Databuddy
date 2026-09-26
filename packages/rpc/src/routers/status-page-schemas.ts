import {
	INCIDENT_IMPACTS,
	INCIDENT_SEVERITIES,
	INCIDENT_STATUSES,
	STATUS_PAGE_THEMES,
} from "@databuddy/db/schema";
import {
	MONITOR_FRESHNESS,
	MONITOR_STATUSES,
	OVERALL_STATUSES,
} from "@databuddy/shared/uptime-status";
import { z } from "zod";

export const dailyUptimeSchema = z.object({
	date: z.string(),
	uptime_percentage: z.number().optional(),
	total_checks: z.number().optional(),
	successful_checks: z.number().optional(),
	downtime_seconds: z.number().optional(),
	avg_response_time: z.number().optional(),
	p95_response_time: z.number().optional(),
});

export const monitorSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().optional(),
	currentStatus: z.enum(MONITOR_STATUSES),
	freshness: z.enum(MONITOR_FRESHNESS),
	uptimePercentage: z.number().optional(),
	dailyData: z.array(dailyUptimeSchema),
	lastCheckedAt: z.string().nullable(),
});

export const statusPageTheme = z.enum(STATUS_PAGE_THEMES);

export const statusPageCustomizationSchema = z.object({
	logoUrl: z.string().nullable(),
	faviconUrl: z.string().nullable(),
	websiteUrl: z.string().nullable(),
	supportUrl: z.string().nullable(),
	theme: statusPageTheme.nullable(),
});

export const incidentStatus = z.enum(INCIDENT_STATUSES);

export const incidentSeverity = z.enum(INCIDENT_SEVERITIES);

export const incidentUpdateSchema = z.object({
	id: z.string(),
	status: incidentStatus,
	message: z.string(),
	createdAt: z.string(),
});

export const incidentImpact = z.enum(INCIDENT_IMPACTS);

export const incidentAffectedMonitorSchema = z.object({
	statusPageMonitorId: z.string(),
	monitorName: z.string(),
	impact: incidentImpact,
});

export const incidentSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: incidentStatus,
	severity: incidentSeverity,
	createdAt: z.string(),
	resolvedAt: z.string().nullable(),
	updates: z.array(incidentUpdateSchema),
	affectedMonitors: z.array(incidentAffectedMonitorSchema),
});

export const statusPageOutputSchema = z.object({
	organization: z.object({
		name: z.string(),
		slug: z.string(),
		logo: z.string().nullable(),
	}),
	statusPage: z
		.object({
			name: z.string(),
			description: z.string().nullable(),
		})
		.merge(statusPageCustomizationSchema),
	overallStatus: z.enum(OVERALL_STATUSES),
	monitors: z.array(monitorSchema),
	incidents: z.array(incidentSchema),
});

export const publicStatusPageSitemapEntrySchema = z.object({
	slug: z.string(),
	updatedAt: z.string().datetime(),
});

export type Monitor = z.infer<typeof monitorSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type StatusPageOutput = z.infer<typeof statusPageOutputSchema>;
