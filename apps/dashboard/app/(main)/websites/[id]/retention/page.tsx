"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { SpinnerIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { FeatureGate } from "@/components/feature-gate";

const RetentionContentDynamic = dynamic(
	() =>
		import("./_components/retention-content").then((mod) => ({
			default: mod.RetentionContent,
		})),
	{
		loading: () => (
			<div className="flex items-center justify-center p-8">
				<SpinnerIcon className="size-6 animate-spin" />
			</div>
		),
		ssr: false,
	}
);

export default function RetentionPage() {
	const { id: websiteId } = useParams();

	return (
		<FeatureGate feature={GATED_FEATURES.RETENTION}>
			<div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden p-4">
				<RetentionContentDynamic websiteId={websiteId as string} />
			</div>
		</FeatureGate>
	);
}
