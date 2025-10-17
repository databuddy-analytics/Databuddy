'use client';

import { useArtifacts } from '@ai-sdk-tools/artifacts/client';
import { cn } from '@/lib/utils';
import { ProgressToast } from './progress-toast';

export function BaseCanvas({ children }: { children: React.ReactNode }) {
	const { current } = useArtifacts();
	const isCanvasVisible = !!current;

	// @ts-expect-error TODO: fix this
	const toastData = current?.payload?.toast;

	return (
		<div
			className={cn(
				'size-full rounded-2xl border border-border bg-background',
				'overflow-y-auto overflow-x-hidden transition-transform duration-300 ease-in-out',
				isCanvasVisible ? 'translate-x-0' : 'translate-x-[calc(100%+24px)]'
			)}
		>
			<div className="relative flex h-full flex-col px-6 py-4">
				{children}

				{toastData && (
					<ProgressToast
						completed={toastData.completed}
						completedMessage={toastData.completedMessage}
						currentLabel={toastData.currentLabel}
						currentStep={toastData.currentStep}
						isVisible={toastData.visible}
						stepDescription={toastData.stepDescription}
						totalSteps={toastData.totalSteps}
					/>
				)}
			</div>
		</div>
	);
}
