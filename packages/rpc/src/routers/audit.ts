import {
	auditActionNames,
	auditActions,
	auditOutcomes,
} from "@databuddy/shared/audit";
import {
	decodeAuditCursor,
	encodeAuditCursor,
	auditEventsToCsv,
	getAuditEvent,
	listAuditEvents,
	MAX_AUDIT_PAGE_SIZE,
	type AuditEvent,
	type AuditCursor,
} from "@databuddy/services/audit";
import { z } from "zod";
import { rpcError } from "../errors";
import { appendRpcAuditEventBestEffort } from "../lib/audit";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const auditEventSchema = z.object({
	action: z.string(),
	actorDisplayName: z.string().nullable(),
	actorId: z.string(),
	actorType: z.enum(["user", "api", "system", "agent"]),
	changes: z.record(z.string(), z.unknown()),
	createdAt: z.coerce.date(),
	id: z.string(),
	ip: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()),
	operation: z.string().nullable(),
	organizationId: z.string(),
	outcome: z.enum(["success", "failure", "denied"]),
	reason: z.string().nullable(),
	requestId: z.string().nullable(),
	source: z.enum(["orpc", "better_auth", "public_api", "worker"]),
	targetDisplayName: z.string().nullable(),
	targetId: z.string(),
	targetType: z.string(),
	userAgent: z.string().nullable(),
});

const auditFiltersSchema = z.object({
	action: z.enum(auditActionNames).optional(),
	actorId: z.string().min(1).optional(),
	includeTechnical: z.boolean().default(false),
	from: z.coerce.date().optional(),
	organizationId: z.string().min(1).optional(),
	outcome: z.enum(auditOutcomes).optional(),
	targetId: z.string().min(1).optional(),
	targetType: z.string().min(1).optional(),
	to: z.coerce.date().optional(),
});

const auditListInputSchema = auditFiltersSchema.extend({
	cursor: z.string().min(1).optional(),
	limit: z.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).default(50),
});

const withValidAuditDateRange = <T extends { from?: Date; to?: Date }>(
	input: T,
	context: z.RefinementCtx
) => {
	if (input.from && input.to && input.from > input.to) {
		context.addIssue({
			code: "custom",
			message: "The start date must be before the end date.",
			path: ["from"],
		});
	}
};

const validatedAuditListInputSchema = auditListInputSchema.superRefine(
	withValidAuditDateRange
);

const auditListOutputSchema = z.object({
	events: z.array(auditEventSchema),
	hasMore: z.boolean(),
	nextCursor: z.string().nullable(),
});

const auditExportInputSchema = auditFiltersSchema.superRefine(
	withValidAuditDateRange
);

const auditExportOutputSchema = z.object({
	content: z.string(),
	filename: z.string(),
	rowCount: z.number().int().nonnegative(),
	truncated: z.boolean(),
});

const MAX_AUDIT_EXPORT_ROWS = 10_000;

export function takeAuditExportPage<T>(
	currentEvents: readonly T[],
	rows: readonly T[]
): { hasMore: boolean; page: T[]; truncated: boolean } {
	const remainingRows = MAX_AUDIT_EXPORT_ROWS - currentEvents.length;
	const page = rows.slice(0, Math.min(remainingRows, MAX_AUDIT_PAGE_SIZE));
	const hasMore = rows.length > page.length;

	return {
		hasMore,
		page,
		truncated:
			currentEvents.length + page.length >= MAX_AUDIT_EXPORT_ROWS && hasMore,
	};
}

function getOrganizationId(
	context: Parameters<typeof withWorkspace>[0],
	organizationId?: string
): string {
	const resolved = organizationId ?? context.organizationId;
	if (!resolved) {
		throw rpcError.badRequest("Organization ID is required");
	}
	return resolved;
}

export const auditRouter = {
	list: sessionProcedure
		.route({
			description:
				"Lists tenant-scoped audit events for organization administrators and owners.",
			method: "POST",
			path: "/audit/list",
			summary: "List audit events",
			tags: ["Audit"],
		})
		.input(validatedAuditListInputSchema)
		.output(auditListOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = getOrganizationId(context, input.organizationId);
			await withWorkspace(context, {
				organizationId,
				permissions: ["read"],
				resource: "audit_log",
			});

			let cursor: AuditCursor | undefined;
			if (input.cursor) {
				const decodedCursor = decodeAuditCursor(input.cursor);
				if (!decodedCursor) {
					throw rpcError.badRequest("Invalid audit cursor");
				}
				cursor = decodedCursor;
			}

			const rows = await listAuditEvents(context.db, {
				action: input.action,
				actorId: input.actorId,
				cursor,
				from: input.from,
				includeTechnical: input.includeTechnical,
				limit: input.limit,
				organizationId,
				outcome: input.outcome,
				targetId: input.targetId,
				targetType: input.targetType,
				to: input.to,
			});
			const events = rows.slice(0, input.limit);
			const lastEvent = events.at(-1);

			await appendRpcAuditEventBestEffort(context, organizationId, {
				action: auditActions.AUDIT_LOG_VIEWED,
				operation: "audit.list",
				target: { id: organizationId },
			});

			return {
				events,
				hasMore: rows.length > input.limit,
				nextCursor: lastEvent ? encodeAuditCursor(lastEvent) : null,
			};
		}),

	export: sessionProcedure
		.route({
			description:
				"Exports tenant-scoped audit events as CSV for organization administrators and owners.",
			method: "POST",
			path: "/audit/export",
			summary: "Export audit events",
			tags: ["Audit"],
		})
		.input(auditExportInputSchema)
		.output(auditExportOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = getOrganizationId(context, input.organizationId);
			await withWorkspace(context, {
				organizationId,
				permissions: ["read"],
				resource: "audit_log",
			});

			const events: AuditEvent[] = [];
			let cursor: AuditCursor | undefined;
			let truncated = false;

			while (events.length < MAX_AUDIT_EXPORT_ROWS) {
				const rows = await listAuditEvents(context.db, {
					action: input.action,
					actorId: input.actorId,
					cursor,
					from: input.from,
					includeTechnical: input.includeTechnical,
					limit: MAX_AUDIT_PAGE_SIZE,
					organizationId,
					outcome: input.outcome,
					targetId: input.targetId,
					targetType: input.targetType,
					to: input.to,
				});
				const {
					hasMore,
					page,
					truncated: hitExportLimit,
				} = takeAuditExportPage(events, rows);
				events.push(...page);

				if (hitExportLimit) {
					truncated = true;
					break;
				}
				if (!hasMore) {
					break;
				}

				const lastEvent = page.at(-1);
				if (!lastEvent) {
					break;
				}
				cursor = {
					createdAt: lastEvent.createdAt,
					id: lastEvent.id,
				};
			}

			await appendRpcAuditEventBestEffort(context, organizationId, {
				action: auditActions.AUDIT_LOG_EXPORTED,
				changes: { exported: { after: true } },
				metadata: { rowCount: events.length, truncated },
				operation: "audit.export",
				target: { id: organizationId },
			});

			return {
				content: auditEventsToCsv(events),
				filename: `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
				rowCount: events.length,
				truncated,
			};
		}),

	get: sessionProcedure
		.route({
			description:
				"Returns one tenant-scoped audit event for organization administrators and owners.",
			method: "POST",
			path: "/audit/get",
			summary: "Get an audit event",
			tags: ["Audit"],
		})
		.input(
			z.object({
				id: z.string().min(1),
				organizationId: z.string().min(1).optional(),
			})
		)
		.output(z.object({ event: auditEventSchema.nullable() }))
		.handler(async ({ context, input }) => {
			const organizationId = getOrganizationId(context, input.organizationId);
			await withWorkspace(context, {
				organizationId,
				permissions: ["read"],
				resource: "audit_log",
			});

			const event = await getAuditEvent(context.db, organizationId, input.id);
			if (event) {
				await appendRpcAuditEventBestEffort(context, organizationId, {
					action: auditActions.AUDIT_LOG_EVENT_VIEWED,
					operation: "audit.get",
					target: { id: event.id },
				});
			}

			return { event };
		}),
};
