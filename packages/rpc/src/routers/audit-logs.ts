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
	type AuditEvent,
} from "@databuddy/services/audit";
import { z } from "zod";
import { rpcError } from "../errors";
import { appendRpcAuditEvent } from "../lib/audit";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const auditChangesSchema = z.record(
	z.string(),
	z.object({
		before: z
			.union([
				z.boolean(),
				z.null(),
				z.number(),
				z.string(),
				z.array(z.unknown()),
			])
			.optional(),
		after: z
			.union([
				z.boolean(),
				z.null(),
				z.number(),
				z.string(),
				z.array(z.unknown()),
			])
			.optional(),
	})
);

const auditEventOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	action: z.string(),
	outcome: z.enum(auditOutcomes),
	source: z.enum(["orpc", "better_auth", "public_api", "worker"]),
	operation: z.string().nullable(),
	actor: z.object({
		type: z.enum(["user", "api", "system", "agent"]),
		id: z.string(),
		displayName: z.string().nullable(),
	}),
	target: z.object({
		type: z.string(),
		id: z.string(),
		displayName: z.string().nullable(),
	}),
	changes: auditChangesSchema,
	metadata: z.record(
		z.string(),
		z.union([
			z.boolean(),
			z.null(),
			z.number(),
			z.string(),
			z.array(z.unknown()),
		])
	),
	reason: z.string().nullable(),
	requestId: z.string().nullable(),
	ip: z.string().nullable(),
	userAgent: z.string().nullable(),
	createdAt: z.coerce.date(),
});

type AuditEventOutput = z.output<typeof auditEventOutputSchema>;

function mapAuditEvent(event: AuditEvent): AuditEventOutput {
	return {
		id: event.id,
		organizationId: event.organizationId,
		action: event.action,
		outcome: event.outcome,
		source: event.source,
		operation: event.operation,
		actor: {
			type: event.actorType,
			id: event.actorId,
			displayName: event.actorDisplayName,
		},
		target: {
			type: event.targetType,
			id: event.targetId,
			displayName: event.targetDisplayName,
		},
		changes: event.changes,
		metadata: event.metadata,
		reason: event.reason,
		requestId: event.requestId,
		ip: event.ip,
		userAgent: event.userAgent,
		createdAt: event.createdAt,
	};
}

export const auditLogsRouter = {
	list: sessionProcedure
		.route({
			description:
				"Lists tenant-scoped audit events. Requires audit-log read permission.",
			method: "POST",
			path: "/audit-logs/list",
			summary: "List audit logs",
			tags: ["Audit Logs"],
		})
		.input(
			z.object({
				organizationId: z.string(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
				action: z.enum(auditActionNames).optional(),
				actorId: z.string().optional(),
				outcome: z.enum(auditOutcomes).optional(),
				targetId: z.string().optional(),
			})
		)
		.output(
			z.object({
				items: z.array(auditEventOutputSchema),
				nextCursor: z.string().nullable(),
			})
		)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "audit_log",
				permissions: ["read"],
			});
			const cursor = input.cursor ? decodeAuditCursor(input.cursor) : null;
			if (input.cursor && !cursor) {
				throw rpcError.badRequest("Invalid audit-log cursor");
			}

			const events = await listAuditEvents(context.db, {
				organizationId: workspace.organizationId,
				limit: input.limit,
				cursor: cursor ?? undefined,
				action: input.action,
				actorId: input.actorId,
				outcome: input.outcome,
				targetId: input.targetId,
			});
			const hasMore = events.length > input.limit;
			const items = events.slice(0, input.limit);
			const lastItem = items.at(-1);

			await appendRpcAuditEvent(context, workspace.organizationId, {
				action: auditActions.AUDIT_LOG_VIEWED,
				operation: "auditLogs.list",
				target: { id: workspace.organizationId },
				metadata: { returnedCount: items.length },
			});

			return {
				items: items.map(mapAuditEvent),
				nextCursor: hasMore && lastItem ? encodeAuditCursor(lastItem) : null,
			};
		}),

	getById: sessionProcedure
		.route({
			description:
				"Gets a tenant-scoped audit event. Requires audit-log read permission.",
			method: "POST",
			path: "/audit-logs/getById",
			summary: "Get audit log event",
			tags: ["Audit Logs"],
		})
		.input(z.object({ organizationId: z.string(), id: z.string() }))
		.output(auditEventOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "audit_log",
				permissions: ["read"],
			});
			const event = await getAuditEvent(
				context.db,
				workspace.organizationId,
				input.id
			);
			if (!event) {
				throw rpcError.notFound("Audit event", input.id);
			}

			await appendRpcAuditEvent(context, workspace.organizationId, {
				action: auditActions.AUDIT_LOG_EVENT_VIEWED,
				operation: "auditLogs.getById",
				target: { id: event.id },
			});

			return mapAuditEvent(event);
		}),
};
