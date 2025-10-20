'use client';

import { BookOpenIcon, ChatCircleIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import {
	toggleTrackingOptionAtom,
	trackingOptionsAtom,
} from '@/stores/jotai/filterAtoms';
import {
	CodeBlock,
	InfoSection,
	InstallationTabs,
	TrackingOptionsGrid,
	TrackingStatusCard,
} from '../shared/tracking-components';
import {
	ADVANCED_TRACKING_OPTIONS,
	BASIC_TRACKING_OPTIONS,
	COPY_SUCCESS_TIMEOUT,
} from '../shared/tracking-constants';
import {
	generateNpmCode,
	generateScriptTag,
	generateVercelNpmCode,
} from '../utils/code-generators';

import type { TrackingOptions, WebsiteDataTabProps } from '../utils/types';

export function WebsiteTrackingSetupTab({ websiteId }: WebsiteDataTabProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [trackingOptions] = useAtom(trackingOptionsAtom);

	const trackingCode = generateScriptTag(websiteId, trackingOptions);
	const npmCode = generateNpmCode(websiteId, trackingOptions);

	const handleCopyCode = (code: string, blockId: string, message: string) => {
		navigator.clipboard.writeText(code);
		setCopiedBlockId(blockId);
		toast.success(message);
		setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
	};

	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);
	const handleToggleOption = (option: keyof TrackingOptions) => {
		toggleTrackingOptionAction(option);
	};

	const utils = trpc.useUtils();
	const { data: trackingSetupData, refetch: refetchTrackingSetup } =
		trpc.websites.isTrackingSetup.useQuery(
			{ websiteId },
			{ enabled: !!websiteId }
		);

	const handleRefresh = async () => {
		toast.success('Checking tracking status...');

		try {
			await utils.websites.isTrackingSetup.invalidate({ websiteId });
			const result = await refetchTrackingSetup();

			if (result.data?.tracking_setup) {
				const integrationType = result.data.integration_type;
				if (integrationType === 'vercel') {
					toast.success('Vercel integration active! Data is being collected.');
				} else {
					toast.success('Tracking setup correctly! Data is being collected.');
				}
			} else {
				const integrationType = result.data?.integration_type;
				if (integrationType === 'vercel') {
					toast.error(
						'Vercel integration detected but no events yet. Make sure your site is deployed and receiving traffic.'
					);
				} else {
					toast.error(
						'Tracking not found. Please verify the script installation.'
					);
				}
			}
		} catch (error) {
			console.error('Failed to check tracking status:', error);
			toast.error('Failed to check tracking status. Please try again.');
		}
	};

	return (
		<div className="space-y-4">
			{/* Tracking Status */}
			<TrackingStatusCard
				integrationType={trackingSetupData?.integration_type ?? undefined}
				isSetup={trackingSetupData?.tracking_setup ?? false}
				onRefresh={handleRefresh}
			/>

			{/* Installation Instructions */}
			{trackingSetupData?.integration_type === 'vercel' ? (
				<InfoSection title="Vercel Integration Setup">
					<div className="space-y-4">
						<p className="text-muted-foreground text-sm">
							Your website is integrated with Vercel - no manual setup required!
						</p>

						<div className="rounded border bg-muted/30 p-3">
							<p className="font-medium text-sm">Automatic SDK Detection</p>
							<p className="text-muted-foreground text-xs leading-relaxed">
								The Databuddy SDK will automatically detect the{' '}
								<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
									NEXT_PUBLIC_DATABUDDY_CLIENT_ID
								</code>{' '}
								environment variable set by your Vercel integration.
							</p>
						</div>

						<div className="space-y-2">
							<p className="font-medium text-sm">Add the SDK to your app:</p>
							<CodeBlock
								code={generateVercelNpmCode(trackingOptions)}
								copied={copiedBlockId === 'vercel-setup'}
								description="Add this to your root layout or _app.js file:"
								onCopy={() =>
									handleCopyCode(
										generateVercelNpmCode(trackingOptions),
										'vercel-setup',
										'Vercel setup code copied to clipboard!'
									)
								}
							/>
						</div>
					</div>
				</InfoSection>
			) : (
				<InfoSection title="Installation">
					<div className="space-y-4">
						<p className="text-muted-foreground text-sm">
							Choose your preferred installation method
						</p>
						<InstallationTabs
							copiedBlockId={copiedBlockId}
							npmCode={npmCode}
							onCopyCode={handleCopyCode}
							trackingCode={trackingCode}
						/>
					</div>
				</InfoSection>
			)}

			<InfoSection title="Configuration">
				<p className="mb-4 text-muted-foreground text-xs">
					Customize tracking options (optional)
				</p>

				<div className="space-y-6">
					<TrackingOptionsGrid
						description="Configure what user activity and page data to collect"
						onToggleOption={handleToggleOption}
						options={BASIC_TRACKING_OPTIONS}
						title="Basic Tracking Options"
						trackingOptions={trackingOptions}
					/>

					<TrackingOptionsGrid
						description="Enable additional tracking features for deeper insights"
						onToggleOption={handleToggleOption}
						options={ADVANCED_TRACKING_OPTIONS}
						title="Advanced Tracking Features"
						trackingOptions={trackingOptions}
					/>
				</div>
			</InfoSection>

			{/* Help Links */}
			<div className="flex gap-2">
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center gap-2"
						href="https://www.databuddy.cc/docs"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="h-4 w-4" weight="duotone" />
						Documentation
					</a>
				</Button>
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center gap-2"
						href="mailto:support@databuddy.cc"
					>
						<ChatCircleIcon className="h-4 w-4" weight="duotone" />
						Support
					</a>
				</Button>
			</div>
		</div>
	);
}
