import {
	getImportQueue,
	IMPORT_RUN_JOB_NAME,
	importRunJobId,
} from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { IMPORT_PROVIDERS } from "@databuddy/services/import";
import {
	createImportUpload,
	isStorageConfigured,
} from "@databuddy/services/storage";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { setTrackProperties } from "../middleware/track-mutation";
import { protectedProcedure, trackedSessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const IMPORT_RATE_WINDOW_SECONDS = 3600;
const IMPORT_CONTENT_TYPES = ["application/zip", "text/csv"] as const;

const providerIdSchema = z.enum(
	IMPORT_PROVIDERS.map((provider) => provider.id) as [string, ...string[]]
);

function isSupportedTimeZone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

const runStatusSchema = z.object({
	runId: z.string(),
	state: z.string(),
	rows: z.number(),
	failedReason: z.string().nullable(),
});

export const importsRouter = {
	providers: protectedProcedure
		.route({
			method: "GET",
			path: "/imports/providers",
			tags: ["Imports"],
			summary: "List import providers",
			description: "Returns the analytics providers Databuddy can import from.",
		})
		.output(
			z.object({
				storageConfigured: z.boolean(),
				providers: z.array(
					z.object({
						id: z.string(),
						label: z.string(),
						grain: z.enum(["event", "rollup"]),
					})
				),
			})
		)
		.handler(() => ({
			storageConfigured: isStorageConfigured(),
			providers: IMPORT_PROVIDERS.map(({ id, label, grain }) => ({
				id,
				label,
				grain,
			})),
		})),

	createUpload: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/imports/upload",
			tags: ["Imports"],
			summary: "Create an import upload URL",
			description: "Returns a presigned URL for an analytics export file.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				contentLength: z.number().int().positive().max(MAX_IMPORT_BYTES),
				contentType: z.enum(IMPORT_CONTENT_TYPES),
			})
		)
		.output(z.object({ key: z.string(), uploadUrl: z.string() }))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "website",
				permissions: ["update"],
			});

			if (!isStorageConfigured()) {
				throw rpcError.serviceUnavailable(
					60,
					"Analytics imports are not available because object storage is not configured."
				);
			}

			const limit = await ratelimit(
				`imports:upload:${workspace.organizationId}`,
				10,
				IMPORT_RATE_WINDOW_SECONDS
			);
			if (!limit.success) {
				throw rpcError.rateLimited(limit.reset);
			}

			setTrackProperties({ websiteId: input.websiteId });

			return createImportUpload({
				contentLength: input.contentLength,
				contentType: input.contentType,
				organizationId: workspace.organizationId,
			});
		}),

	start: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/imports/start",
			tags: ["Imports"],
			summary: "Start an analytics import",
			description: "Queues an uploaded analytics export for ingestion.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				providerId: providerIdSchema,
				storageKey: z.string().min(1),
				replaceExisting: z.boolean().default(false),
				timezone: z
					.string()
					.default("UTC")
					.refine(isSupportedTimeZone, { message: "Unknown IANA time zone" }),
			})
		)
		.output(z.object({ runId: z.string() }))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "website",
				permissions: ["update"],
			});

			if (!isStorageConfigured()) {
				throw rpcError.serviceUnavailable(
					60,
					"Analytics imports are not available because object storage is not configured."
				);
			}

			if (
				!input.storageKey.startsWith(`imports/${workspace.organizationId}/`)
			) {
				throw rpcError.forbidden(
					"Storage key does not belong to this organization."
				);
			}

			const limit = await ratelimit(
				`imports:start:${workspace.organizationId}`,
				5,
				IMPORT_RATE_WINDOW_SECONDS
			);
			if (!limit.success) {
				throw rpcError.rateLimited(limit.reset);
			}

			const runId = randomUUIDv7();
			await getImportQueue().add(
				IMPORT_RUN_JOB_NAME,
				{
					runId,
					websiteId: input.websiteId,
					organizationId: workspace.organizationId,
					providerId: input.providerId,
					storageKey: input.storageKey,
					replaceExisting: input.replaceExisting,
					timezone: input.timezone,
					requestedByUserId: context.user.id,
				},
				{ jobId: importRunJobId(runId) }
			);

			setTrackProperties({
				websiteId: input.websiteId,
				providerId: input.providerId,
			});

			return { runId };
		}),

	status: protectedProcedure
		.route({
			method: "GET",
			path: "/imports/status",
			tags: ["Imports"],
			summary: "Get import run status",
			description: "Returns the queue state of a previously started import.",
		})
		.input(z.object({ websiteId: z.string(), runId: z.string() }))
		.output(runStatusSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "website",
				permissions: ["read"],
			});

			const job = await getImportQueue().getJob(importRunJobId(input.runId));
			if (!job || job.data.websiteId !== input.websiteId) {
				throw rpcError.notFound("import run", input.runId);
			}

			return {
				runId: input.runId,
				state: await job.getState(),
				rows: Number(job.progress) || 0,
				failedReason: job.failedReason ?? null,
			};
		}),
};
