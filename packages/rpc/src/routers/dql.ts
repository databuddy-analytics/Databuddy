import {
	DQL_INPUT_LIMITS,
	DQL_RESOURCE_LIMITS,
	DQL_SCHEMA,
	type DqlQueryInput,
	DqlQueryRejectedError,
	type DqlQueryResult,
	executeDqlQuery,
} from "@databuddy/db/clickhouse/dql";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { type Context, protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const DQL_EXECUTIONS_PER_MINUTE = 30;
let activeDqlExecutions = 0;

const parameterScalarSchema = z.union([
	z.string().max(DQL_INPUT_LIMITS.maxStringLength),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

const dqlParametersSchema = z
	.record(
		z.string(),
		z.union([
			parameterScalarSchema,
			z.array(parameterScalarSchema).max(DQL_INPUT_LIMITS.maxArrayItems),
		])
	)
	.superRefine((params, context) => {
		if (Object.keys(params).length > DQL_INPUT_LIMITS.maxParameters) {
			context.addIssue({
				code: "custom",
				message: `DQL accepts at most ${DQL_INPUT_LIMITS.maxParameters} parameters.`,
			});
		}
		if (
			new TextEncoder().encode(JSON.stringify(params)).byteLength >
			DQL_INPUT_LIMITS.maxParameterBytes
		) {
			context.addIssue({
				code: "custom",
				message: "DQL parameters are too large.",
			});
		}
	});

export const dqlRequestSchema = z.object({
	params: dqlParametersSchema.optional(),
	sql: z.string().min(1).max(DQL_INPUT_LIMITS.maxSqlBytes),
	websiteId: z.string().min(1),
});

const dqlColumnSchema = z.object({
	name: z.string(),
	type: z.string(),
});

const dqlSchemaOutput = z.object({
	tables: z.array(
		z.object({
			columns: z.array(dqlColumnSchema),
			name: z.string(),
		})
	),
});

const dqlQueryOutput = z.object({
	columns: z.array(dqlColumnSchema),
	rows: z.array(z.record(z.string(), z.unknown())),
	stats: z.object({
		bytesRead: z.number(),
		elapsedMs: z.number(),
		queryId: z.string(),
		rowCount: z.number(),
		rowsRead: z.number(),
	}),
});

type DqlRow = Record<string, unknown>;
type DqlRequest = z.infer<typeof dqlRequestSchema>;

export interface DqlRouterDeps {
	execute: (input: DqlQueryInput) => Promise<DqlQueryResult<DqlRow>>;
	rateLimit: (
		key: string,
		limit: number,
		windowSeconds: number
	) => Promise<{ reset: number; success: boolean }>;
	resolveWorkspace: (
		context: Context,
		options: {
			permissions: readonly ["view_analytics"];
			websiteId: string;
		}
	) => Promise<{ website: { id: string } }>;
}

const defaultDeps: DqlRouterDeps = {
	execute: executeDqlQuery,
	rateLimit: ratelimit,
	resolveWorkspace: (context, options) => withWorkspace(context, options),
};

function principalKey(context: Context): string {
	if (context.user) {
		return `user:${context.user.id}`;
	}
	if (context.apiKey) {
		return `apikey:${context.apiKey.id}`;
	}
	throw rpcError.unauthorized();
}

async function authorizedWebsiteId(
	context: Context,
	websiteId: string,
	deps: DqlRouterDeps
): Promise<string> {
	const workspace = await deps.resolveWorkspace(context, {
		websiteId,
		permissions: ["view_analytics"],
	});
	return workspace.website.id;
}

export async function getDqlSchemaForRequest(
	context: Context,
	websiteId: string,
	deps: DqlRouterDeps = defaultDeps
) {
	await authorizedWebsiteId(context, websiteId, deps);
	return {
		tables: DQL_SCHEMA.map((table) => ({
			columns: table.columns.map((column) => ({ ...column })),
			name: table.name,
		})),
	};
}

export async function executeDqlForRequest(
	context: Context,
	input: DqlRequest,
	deps: DqlRouterDeps = defaultDeps
) {
	const websiteId = await authorizedWebsiteId(context, input.websiteId, deps);
	const rate = await deps.rateLimit(
		`dql:execute:${principalKey(context)}`,
		DQL_EXECUTIONS_PER_MINUTE,
		60
	);
	if (!rate.success) {
		throw rpcError.rateLimited(rate.reset);
	}
	if (activeDqlExecutions >= DQL_RESOURCE_LIMITS.maxConcurrentQueries) {
		throw rpcError.rateLimited(1);
	}

	activeDqlExecutions += 1;
	try {
		return await deps.execute({
			websiteId,
			sql: input.sql,
			params: input.params,
		});
	} catch (error) {
		if (error instanceof DqlQueryRejectedError) {
			throw rpcError.badRequest(error.message);
		}

		logger.error(
			{
				error_name: error instanceof Error ? error.name : "UnknownError",
				websiteId,
			},
			"DQL query execution failed"
		);
		throw rpcError.internal();
	} finally {
		activeDqlExecutions -= 1;
	}
}

export const dqlRouter = {
	schema: protectedProcedure
		.route({
			description:
				"Returns the DQL tables and columns available to an authorized website.",
			method: "POST",
			path: "/dql/schema",
			summary: "Get the DQL schema",
			tags: ["DQL"],
		})
		.input(z.object({ websiteId: z.string().min(1) }))
		.output(dqlSchemaOutput)
		.handler(({ context, input }) =>
			getDqlSchemaForRequest(context, input.websiteId)
		),

	execute: protectedProcedure
		.route({
			description: "Executes read-only SQL for an authorized website.",
			method: "POST",
			path: "/dql/execute",
			summary: "Execute a DQL query",
			tags: ["DQL"],
		})
		.input(dqlRequestSchema)
		.output(dqlQueryOutput)
		.handler(({ context, input }) => executeDqlForRequest(context, input)),
};
