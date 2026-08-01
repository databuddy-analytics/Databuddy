import type { WebsiteInvestigationArtifact } from "./generation";

export async function runDistinctSignalBatch(
	batchSize: number,
	runCandidate: (
		excludedSignalKeys: ReadonlySet<string>
	) => Promise<WebsiteInvestigationArtifact>,
	onSelected?: (artifact: WebsiteInvestigationArtifact) => Promise<void> | void
): Promise<WebsiteInvestigationArtifact[]> {
	const artifacts: WebsiteInvestigationArtifact[] = [];
	const selectedSignalKeys = new Set<string>();
	for (let index = 0; index < batchSize; index += 1) {
		const artifact = await runCandidate(selectedSignalKeys);
		artifacts.push(artifact);
		const signalKey = artifact.signal?.signalKey;
		if (!signalKey || selectedSignalKeys.has(signalKey)) {
			break;
		}
		selectedSignalKeys.add(signalKey);
		await onSelected?.(artifact);
	}
	return artifacts;
}
