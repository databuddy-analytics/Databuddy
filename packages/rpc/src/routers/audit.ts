import {
	auditActionNames,
	auditActions,
	auditOutcomes,
} from "@databuddy/shared/audit";
import {
	decodeAuditCursor,
	encodeAuditCursor,
	getAuditEvent,
	listAuditEvents,
	MAX_AUDIT_PAGE_SIZE,
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

const auditListInputSchema = z.object({
	action: z.enum(auditActionNames).optional(),
	actorId: z.string().min(1).optional(),
	cursor: z.string().min(1).optional(),
	includeTechnical: z.boolean().default(false),
	limit: z.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).default(50),
	organizationId: z.string().min(1).optional(),
	outcome: z.enum(auditOutcomes).optional(),
	targetId: z.string().min(1).optional(),
	targetType: z.string().min(1).optional(),
});

const auditListOutputSchema = z.object({
	events: z.array(auditEventSchema),
	hasMore: z.boolean(),
	nextCursor: z.string().nullable(),
});

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
		.input(auditListInputSchema)
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
				includeTechnical: input.includeTechnical,
				limit: input.limit,
				organizationId,
				outcome: input.outcome,
				targetId: input.targetId,
				targetType: input.targetType,
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
