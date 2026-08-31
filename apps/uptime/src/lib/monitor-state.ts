import { redis } from "@databuddy/redis";
import { z } from "zod";

const STATE_KEY_PREFIX = "uptime:state:";
const STATE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface MonitorState {
	failureStreak: number;
	status: number;
}

export type MonitorStateLookup =
	| { kind: "found"; state: MonitorState }
	| { kind: "missing" }
	| { kind: "unavailable" };

const monitorStateSchema = z.object({
	failureStreak: z.number().int().nonnegative(),
	status: z.number().int(),
});

const lastKnownState = new Map<string, MonitorState>();

const stateKey = (siteId: string) => `${STATE_KEY_PREFIX}${siteId}`;

export function resetLastKnownState(): void {
	lastKnownState.clear();
}

export async function readMonitorState(
	siteId: string
): Promise<MonitorStateLookup> {
	try {
		const raw = await redis.get(stateKey(siteId));
		if (!raw) {
			return { kind: "missing" };
		}
		const parsed = monitorStateSchema.safeParse(JSON.parse(raw));
		return parsed.success
			? { kind: "found", state: parsed.data }
			: { kind: "missing" };
	} catch {
		const cached = lastKnownState.get(siteId);
		return cached ? { kind: "found", state: cached } : { kind: "unavailable" };
	}
}

export async function writeMonitorState(
	siteId: string,
	state: MonitorState
): Promise<void> {
	lastKnownState.set(siteId, state);
	await redis.set(
		stateKey(siteId),
		JSON.stringify(state),
		"EX",
		STATE_TTL_SECONDS
	);
}
