import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import {
	generateExport,
	validateExportDateRange,
} from "../services/export-service";
import { authorizeWebsiteAccess } from "../utils/auth";

const exportInputSchema = z.object({
	websiteId: z.string().min(1),
	format: z.enum(["csv", "json", "txt", "proto"]).default("json"),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export const exportRouter = {
	download: protectedProcedure
		.input(exportInputSchema)
		.handler(async ({ context, input }) => {
			const { dates, error } = validateExportDateRange(
				input.startDate,
				input.endDate
			);

			if (error) {
				throw new ORPCError("BAD_REQUEST", { message: error });
			}

			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const exportResult = await generateExport(
				input.websiteId,
				input.format,
				dates.startDate,
				dates.endDate
			);

			return {
				filename: exportResult.filename,
				data: exportResult.buffer.toString("base64"),
				metadata: exportResult.meta,
			};
		}),
};
