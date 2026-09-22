import { z } from "zod";

export const successOutputSchema = z.object({ success: z.literal(true) });
