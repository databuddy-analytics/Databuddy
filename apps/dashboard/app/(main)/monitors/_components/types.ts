import type { orpc } from "@/lib/orpc";

export type Monitor = Awaited<
	ReturnType<typeof orpc.uptime.listSchedules.call>
>[number];
