import { useArtifacts } from '@ai-sdk-tools/artifacts/client';
import { DataAnalysisCanvas } from './data-analysis-canvas';

export function Canvas({ websiteId }: { websiteId: string }) {
	const { current } = useArtifacts();

	switch (current?.type) {
		case 'data-analysis':
			return <DataAnalysisCanvas websiteId={websiteId} />;
		default:
			return null;
	}
}
