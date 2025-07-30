'use client';

import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CopyIcon,
	GearSixIcon,
	GlobeIcon,
	KeyIcon,
	LightningIcon,
	TestTubeIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { useRevenueConfig } from '../../hooks/use-revenue-config';

export function RevenueSettingsTab({
	revenueConfig,
}: {
	revenueConfig: ReturnType<typeof useRevenueConfig>;
}) {
	const [webhookSecret, setWebhookSecret] = useState('');
	const [isLiveMode, setIsLiveMode] = useState(revenueConfig.isLiveMode);

	// Check if the webhook secret is masked (contains asterisks)
	const isMaskedSecret = (secret: string) => secret.includes('*');

	// Initialize webhook secret only if it's not masked
	useEffect(() => {
		const currentSecret = revenueConfig.webhookSecret || '';
		if (!isMaskedSecret(currentSecret)) {
			setWebhookSecret(currentSecret);
		}
	}, [revenueConfig.webhookSecret, isMaskedSecret]);

	const handleSave = async () => {
		// Only update webhook secret if user has entered a new one
		const updateData: { webhookSecret?: string; isLiveMode: boolean } = {
			isLiveMode,
		};

		// Only include webhook secret if user has entered a new value
		if (webhookSecret.trim()) {
			updateData.webhookSecret = webhookSecret;
		}

		await revenueConfig.updateConfig(updateData);
	};

	const handleCopy = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied to clipboard`);
	};

	if (revenueConfig.isLoading) {
		return (
			<div className="space-y-6">
				<div className="animate-pulse space-y-4">
					<div className="h-8 w-1/3 rounded bg-muted" />
					<div className="h-32 rounded bg-muted" />
					<div className="h-32 rounded bg-muted" />
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Revenue Settings</h2>
				<p className="text-muted-foreground">
					Configure your Stripe webhook integration for revenue tracking
				</p>
			</div>

			{/* Webhook Configuration */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<KeyIcon className="h-5 w-5" size={20} weight="duotone" />
						Webhook Configuration
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Webhook URL */}
					<div className="space-y-2">
						<Label htmlFor="webhook-url">Webhook URL</Label>
						<div className="flex gap-2">
							<Input
								className="font-mono text-sm"
								id="webhook-url"
								readOnly
								value={revenueConfig.webhookUrl}
							/>
							<Button
								onClick={() =>
									handleCopy(revenueConfig.webhookUrl, 'Webhook URL')
								}
								size="icon"
								variant="outline"
							>
								<CopyIcon className="h-4 w-4" size={16} weight="duotone" />
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Add this URL to your Stripe webhook endpoints
						</p>
					</div>

					{/* Webhook Token */}
					<div className="space-y-2">
						<Label htmlFor="webhook-token">Webhook Token</Label>
						<div className="flex gap-2">
							<Input
								className="font-mono text-sm"
								id="webhook-token"
								readOnly
								value={revenueConfig.webhookToken}
							/>
							<Button
								onClick={() =>
									handleCopy(revenueConfig.webhookToken, 'Webhook Token')
								}
								size="icon"
								variant="outline"
							>
								<CopyIcon className="h-4 w-4" size={16} weight="duotone" />
							</Button>
							<Button
								disabled={revenueConfig.isRegeneratingToken}
								onClick={() => revenueConfig.regenerateWebhookToken()}
								size="icon"
								variant="outline"
							>
								<ArrowClockwiseIcon
									className={`h-4 w-4 ${revenueConfig.isRegeneratingToken ? 'animate-spin' : ''}`}
									size={16}
									weight="fill"
								/>
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							This token authenticates webhook requests from Stripe
						</p>
					</div>

					{/* Webhook Secret */}
					<div className="space-y-2">
						<Label htmlFor="webhook-secret">Webhook Secret</Label>
						<div className="relative">
							<Input
								className="font-mono text-sm"
								id="webhook-secret"
								onChange={(e) => setWebhookSecret(e.target.value)}
								placeholder={
									isMaskedSecret(revenueConfig.webhookSecret || '')
										? 'Enter new webhook secret to update...'
										: 'whsec_...'
								}
								type="password"
								value={webhookSecret}
							/>
							{isMaskedSecret(revenueConfig.webhookSecret || '') && (
								<div className="absolute inset-y-0 right-3 flex items-center">
									<span className="font-mono text-muted-foreground text-xs">
										{revenueConfig.webhookSecret}
									</span>
								</div>
							)}
						</div>
						<p className="text-muted-foreground text-xs">
							{isMaskedSecret(revenueConfig.webhookSecret || '')
								? 'Current secret is hidden for security. Enter a new secret to update it.'
								: 'Get this from your Stripe webhook endpoint settings'}
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Mode Configuration */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<GearSixIcon className="h-5 w-5" size={20} weight="duotone" />
						Mode Configuration
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<div className="flex items-center gap-2">
								<Label htmlFor="live-mode">Live Mode</Label>
								<Badge
									className="text-xs"
									variant={isLiveMode ? 'default' : 'secondary'}
								>
									{isLiveMode ? (
										<>
											<GlobeIcon
												className="mr-1 h-3 w-3"
												size={12}
												weight="duotone"
											/>
											Live
										</>
									) : (
										<>
											<TestTubeIcon
												className="mr-1 h-3 w-3"
												size={12}
												weight="duotone"
											/>
											Test
										</>
									)}
								</Badge>
							</div>
							<p className="text-muted-foreground text-sm">
								{isLiveMode
									? 'Track real payments from live Stripe events'
									: 'Track test payments for development and testing'}
							</p>
						</div>
						<Switch
							checked={isLiveMode}
							id="live-mode"
							onCheckedChange={setIsLiveMode}
						/>
					</div>

					{!isLiveMode && (
						<div className="rounded-md bg-blue-50 p-3 text-blue-700 text-sm dark:bg-blue-950/20 dark:text-blue-400">
							<div className="flex items-start gap-2">
								<TestTubeIcon
									className="mt-0.5 h-4 w-4 flex-shrink-0"
									size={16}
									weight="duotone"
								/>
								<div>
									<p className="font-medium">Test Mode Active</p>
									<p className="mt-1 text-xs">
										Only test payments will be tracked. Switch to live mode for
										production.
									</p>
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Setup Instructions */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<LightningIcon className="h-5 w-5" size={20} weight="duotone" />
						Setup Instructions
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						<div className="flex items-start gap-3">
							<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								1
							</div>
							<div>
								<p className="font-medium">Create Stripe Webhook</p>
								<p className="text-muted-foreground text-sm">
									Go to your Stripe Dashboard → Webhooks → Add endpoint
								</p>
							</div>
						</div>

						<div className="flex items-start gap-3">
							<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								2
							</div>
							<div>
								<p className="font-medium">Add Webhook URL</p>
								<p className="text-muted-foreground text-sm">
									Copy the webhook URL above and paste it into Stripe
								</p>
							</div>
						</div>

						<div className="flex items-start gap-3">
							<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								3
							</div>
							<div>
								<p className="font-medium">Configure Events</p>
								<p className="text-muted-foreground text-sm">
									Select events: payment_intent.succeeded,
									payment_intent.payment_failed
								</p>
							</div>
						</div>

						<div className="flex items-start gap-3">
							<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								4
							</div>
							<div>
								<p className="font-medium">Copy Webhook Secret</p>
								<p className="text-muted-foreground text-sm">
									Copy the webhook secret from Stripe and paste it above
								</p>
							</div>
						</div>
					</div>

					<Separator />

					<div className="flex items-center gap-2">
						<Button asChild size="sm" variant="outline">
							<a
								href="https://dashboard.stripe.com/webhooks"
								rel="noopener noreferrer"
								target="_blank"
							>
								<ArrowSquareOutIcon
									className="mr-2 h-4 w-4"
									size={16}
									weight="duotone"
								/>
								Open Stripe Dashboard
							</a>
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Actions */}
			<div className="flex items-center justify-between pt-4">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button size="sm" variant="destructive">
							<TrashIcon className="mr-2 h-4 w-4" size={16} weight="duotone" />
							Delete Configuration
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Revenue Configuration</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete your revenue configuration? This
								will stop all revenue tracking and cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className="bg-red-600 hover:bg-red-700"
								disabled={revenueConfig.isDeleting}
								onClick={() => revenueConfig.deleteConfig()}
							>
								{revenueConfig.isDeleting ? 'Deleting...' : 'Delete'}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<Button disabled={revenueConfig.isCreating} onClick={handleSave}>
					{revenueConfig.isCreating ? 'Saving...' : 'Save Configuration'}
				</Button>
			</div>
		</div>
	);
}
