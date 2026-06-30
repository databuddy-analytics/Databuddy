import type { Workspace } from "../procedures/with-workspace";

export function scopedCacheKey(
	kind: string,
	workspace: Pick<Workspace, "organizationId" | "tier">,
	...parts: string[]
): string {
	return [
		kind,
		`org:${workspace.organizationId}`,
		`tier:${workspace.tier}`,
		...parts,
	].join(":");
}
