import { isHttpUrl } from "@databuddy/shared/constants/links";
import z from "zod";

export const httpUrlSchema = z
	.url()
	.refine(isHttpUrl, { message: "URL must be an absolute HTTP or HTTPS URL" });
