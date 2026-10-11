import {
	deleteImportedEvents,
	ingestImportBatch,
} from "@databuddy/services/import";
import { IMPORT_PROVIDERS } from "@databuddy/shared/import";
import {
	ImportFileError,
	MAX_BATCH_RECORDS,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
} from "@databuddy/shared/import/records";
import { z } from "zod";
import { rpcError } from "../errors";
import { setTrackProperties } from "../middleware/track-mutation";
import { sessionProcedure, trackedSessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const DAY_MS = 86_400_000;
const EARLIEST_IMPORT_TIME = new Date("2000-01-01T00:00:00Z");

function isImportableTime(time: Date): boolean {
	return time >= EARLIEST_IMPORT_TIME && time.getTime() <= Date.now() + DAY_MS;
}

const providerIdSchema = z.enum(
	IMPORT_PROVIDERS.map((provider) => provider.id) as [string, ...string[]]
);

const timezoneSchema = z.string().refine(
	(timezone) => {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: timezone });
			return true;
		} catch {
			return false;
		}
	},
	{ message: "Pick a valid time zone, for example Europe/London." }
);

const label = z.string().max(256).nullish();
const count = z.number().finite().min(0).max(1_000_000_000).optional();

const eventRecordSchema = z.object({
	grain: z.literal("event"),
	eventName: z.enum([PAGEVIEW_EVENT_NAME, PAGE_EXIT_EVENT_NAME]),
	time: z.date().refine(isImportableTime, {
		message: "Event time is outside the importable range.",
	}),
	path: z.string().max(2048),
	hostname: z.string().max(256).optional(),
	sessionKey: z.string().min(1).max(256),
	visitorKey: z.string().min(1).max(256),
	timeOnPage: z.number().int().min(0).max(86_400).nullish(),
	referrer: z.string().max(2048).nullish(),
	browserName: label,
	city: label,
	country: label,
	deviceType: label,
	language: label,
	osName: label,
	region: label,
	utmCampaign: label,
	utmContent: label,
	utmMedium: label,
	utmSource: label,
	utmTerm: label,
});

const rollupRecordSchema = z.object({
	grain: z.literal("rollup"),
	date: z.iso
		.date()
		.refine((date) => isImportableTime(new Date(`${date}T00:00:00Z`)), {
			message: "Date is outside the importable range.",
		}),
	dimension: z
		.object({
			kind: z.enum([
				"page",
				"entry_page",
				"exit_page",
				"source",
				"country",
				"browser",
				"os",
				"device",
				"custom_event",
				"utm_source",
				"utm_medium",
				"utm_campaign",
				"utm_term",
				"utm_content",
			]),
			value: z.string().max(2048),
			hostname: z.string().max(256).optional(),
		})
		.nullable(),
	metrics: z.object({
		visitors: count,
		visits: count,
		pageviews: count,
		bounces: count,
		durationSeconds: count,
	}),
});

export const importsRouter = {
	ingest: sessionProcedure
		.route({
			method: "POST",
			path: "/imports/ingest",
			tags: ["Imports"],
			summary: "Import a batch of analytics records",
			description:
				"Writes one batch of records parsed from another analytics tool's export.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				providerId: providerIdSchema,
				runId: z.uuid(),
				timezone: timezoneSchema,
				records: z
					.array(
						z.discriminatedUnion("grain", [
							eventRecordSchema,
							rollupRecordSchema,
						])
					)
					.min(1)
					.max(MAX_BATCH_RECORDS),
			})
		)
		.output(z.object({ rows: z.number(), overlapSkipped: z.number() }))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "website",
				permissions: ["update"],
			});

			try {
				return await ingestImportBatch({
					websiteId: input.websiteId,
					domain: workspace.website.domain,
					providerId: input.providerId,
					runId: input.runId,
					timezone: input.timezone,
					records: input.records,
				});
			} catch (error) {
				if (error instanceof ImportFileError) {
					throw rpcError.badRequest(error.message);
				}
				throw error;
			}
		}),

	finish: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/imports/finish",
			tags: ["Imports"],
			summary: "Finish an analytics import",
			description:
				"Records a completed import and, when asked, removes rows from earlier imports of the same tool.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				providerId: providerIdSchema,
				runId: z.uuid(),
				replaceExisting: z.boolean(),
				rows: z.number().int().min(0),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "website",
				permissions: ["update"],
			});

			if (input.replaceExisting) {
				await deleteImportedEvents({
					websiteId: input.websiteId,
					providerId: input.providerId,
					exceptRunId: input.runId,
				});
			}

			setTrackProperties({
				websiteId: input.websiteId,
				providerId: input.providerId,
				replaceExisting: input.replaceExisting,
				rows: input.rows,
			});

			return { success: true };
		}),
};
