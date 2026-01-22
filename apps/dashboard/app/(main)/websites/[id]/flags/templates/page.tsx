"use client";

import { GATED_FEATURES } from"@databuddy/shared/types/features";
import { useAtom } from"jotai";
import { useParams } from"next/navigation";
import { Suspense, useState } from"react";
import { ErrorBoundary } from"@/components/error-boundary";
import { FeatureGate } from"@/components/feature-gate";
import { isFlagSheetOpenAtom } from"@/stores/jotai/flagsAtoms";
import { FlagSheet } from"../_components/flag-sheet";
import type { FlagTemplate } from"../_components/types";
import { TemplatesList } from"./_components/templates-list";
import { HARDCODED_TEMPLATES } from"./_data/templates";

const TemplatesListSkeleton = () => (
	<div className="border-border border-t">
		{[...new Array(5)].map((_, i) => (
			<div
				className="flex animate-pulse items-center border-border border-b px-4 py-4 sm:px-6"
				key={`template-skeleton-${i + 1}`}
			>
				<div className="flex flex-1 items-center gap-4">
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="size-10 bg-muted" />
							<div className="flex-1 space-y-2">
								<div className="h-5 w-40 bg-muted" />
								<div className="h-4 w-64 bg-muted" />
							</div>
						</div>
					</div>
					<div className="size-8 bg-muted" />
				</div>
			</div>
		))}
	</div>
);

export default function TemplatesPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [selectedTemplate, setSelectedTemplate] = useState<FlagTemplate | null>(
		null
	);

	const handleUseTemplate = (template: FlagTemplate) => {
		setSelectedTemplate(template);
		setIsFlagSheetOpen(true);
	};

	const handleFlagSheetClose = () => {
		setIsFlagSheetOpen(false);
		setSelectedTemplate(null);
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="h-full overflow-y-auto">
					<Suspense fallback={<TemplatesListSkeleton />}>
						<TemplatesList
							isLoading={false}
							onUseTemplateAction={handleUseTemplate}
							templates={HARDCODED_TEMPLATES}
						/>
					</Suspense>

					{isFlagSheetOpen && (
						<Suspense fallback={null}>
							<FlagSheet
								isOpen={isFlagSheetOpen}
								onCloseAction={handleFlagSheetClose}
								template={selectedTemplate}
								websiteId={websiteId}
							/>
						</Suspense>
					)}
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
