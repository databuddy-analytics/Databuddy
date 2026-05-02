import { desc, eq } from "@databuddy/db";
import { trackerVersions } from "@databuddy/db/schema";
import { z } from "zod";
import { publicProcedure } from "../orpc";

const trackerVersionSchema = z.object({
	version: z.number(),
	filename: z.string(),
	sriHash: z.string(),
	sizeBytes: z.number(),
	deployedAt: z.date(),
});

export const trackerRouter = {
	getCurrentVersions: publicProcedure
		.route({
			description: "Returns the current tracker script versions with SRI hashes.",
			method: "POST",
			path: "/tracker/getCurrentVersions",
			summary: "Get current tracker versions",
			tags: ["Tracker"],
		})
		.output(z.array(trackerVersionSchema))
		.handler(async ({ context }) => {
			return context.db
				.select({
					version: trackerVersions.version,
					filename: trackerVersions.filename,
					sriHash: trackerVersions.sriHash,
					sizeBytes: trackerVersions.sizeBytes,
					deployedAt: trackerVersions.deployedAt,
				})
				.from(trackerVersions)
				.where(eq(trackerVersions.isCurrent, true));
		}),

	listVersions: publicProcedure
		.route({
			description: "Returns all tracker script versions.",
			method: "POST",
			path: "/tracker/listVersions",
			summary: "List all tracker versions",
			tags: ["Tracker"],
		})
		.input(
			z.object({
				filename: z.string().default("databuddy.js"),
			})
		)
		.output(z.array(trackerVersionSchema))
		.handler(async ({ context, input }) => {
			return context.db
				.select({
					version: trackerVersions.version,
					filename: trackerVersions.filename,
					sriHash: trackerVersions.sriHash,
					sizeBytes: trackerVersions.sizeBytes,
					deployedAt: trackerVersions.deployedAt,
				})
				.from(trackerVersions)
				.where(eq(trackerVersions.filename, input.filename))
				.orderBy(desc(trackerVersions.version));
		}),
};
