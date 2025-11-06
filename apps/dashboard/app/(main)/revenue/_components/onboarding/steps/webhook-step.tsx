"use client";

import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CopyIcon,
	FloppyDiskBackIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface WebhookStepProps {
	webhookSecret: string;
	isLiveMode: boolean;
	copied: boolean;
	copyToClipboard: (text: string, label: string) => void;
	webhookUrl: string;
	onBack: () => void;
	onNext: () => void;
	onSave: (data: { webhookSecret: string; isLiveMode: boolean }) => void;
	isSaving?: boolean;
}

export function WebhookStep({
	webhookSecret,
	isLiveMode,
	copied,
	copyToClipboard,
	webhookUrl,
	onBack,
	onNext,
	onSave,
	isSaving = false,
}: WebhookStepProps) {
	// Local state for form inputs
	const [localWebhookSecret, setLocalWebhookSecret] = useState(webhookSecret);
	const [localIsLiveMode, setLocalIsLiveMode] = useState(isLiveMode);
	const [hasChanges, setHasChanges] = useState(false);

	// Update local state when props change
	useEffect(() => {
		setLocalWebhookSecret(webhookSecret);
		setLocalIsLiveMode(isLiveMode);
		setHasChanges(false);
	}, [webhookSecret, isLiveMode]);

	// Track changes
	useEffect(() => {
		const changed =
			localWebhookSecret !== webhookSecret || localIsLiveMode !== isLiveMode;
		setHasChanges(changed);
	}, [localWebhookSecret, localIsLiveMode, webhookSecret, isLiveMode]);

	const handleSave = () => {
		onSave({
			webhookSecret: localWebhookSecret,
			isLiveMode: localIsLiveMode,
		});
	};

	return (
		<div className="space-y-6">
			<div>
				<h3 className="mb-3 font-medium">Step 1: Configure Stripe Webhook</h3>
				<div className="space-y-4">
					<div>
						<Label htmlFor="webhook-url">Webhook Endpoint URL</Label>
						<div className="mt-1 flex gap-2">
							<Input
								className="font-mono text-sm"
								id="webhook-url"
								readOnly
								value={webhookUrl}
							/>
							<Button
								onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
								size="sm"
								variant="outline"
							>
								{copied ? (
									<CheckCircleIcon
										className="h-4 w-4"
										size={16}
										weight="fill"
									/>
								) : (
									<CopyIcon className="h-4 w-4" size={16} weight="duotone" />
								)}
							</Button>
						</div>
						<p className="mt-1 text-muted-foreground text-xs">
							Add this URL to your Stripe webhook endpoints
						</p>
					</div>

					<div>
						<Label htmlFor="webhook-secret">Webhook Signing Secret</Label>
						<div className="mt-1">
							<Input
								className="font-mono text-sm"
								id="webhook-secret"
								onChange={(e) => setLocalWebhookSecret(e.target.value)}
								placeholder="whsec_..."
								value={localWebhookSecret}
							/>
						</div>
						<p className="mt-1 text-muted-foreground text-xs">
							Get this from your Stripe webhook endpoint settings after creating
							the webhook
						</p>
					</div>

					<div className="flex items-center space-x-2">
						<Switch
							checked={localIsLiveMode}
							id="live-mode"
							onCheckedChange={setLocalIsLiveMode}
						/>
						<Label htmlFor="live-mode">Live Mode</Label>
						<Badge variant={localIsLiveMode ? "default" : "secondary"}>
							{localIsLiveMode ? "Production" : "Test"}
						</Badge>
					</div>

					{hasChanges && (
						<div className="flex gap-2">
							<Button
								className="flex items-center gap-2"
								disabled={isSaving}
								onClick={handleSave}
								size="sm"
								variant="outline"
							>
								<FloppyDiskBackIcon
									className="h-4 w-4"
									size={16}
									weight="fill"
								/>
								{isSaving ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					)}
				</div>
			</div>

			<Separator />

			<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
				<div className="flex gap-3">
					<WarningCircleIcon
						className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400"
						size={20}
						weight="duotone"
					/>
					<div>
						<h4 className="font-medium text-amber-900 dark:text-amber-100">
							Stripe Dashboard Setup
						</h4>
						<p className="mt-1 text-amber-800 text-sm dark:text-amber-200">
							You'll need to add this webhook URL in your Stripe Dashboard under
							Developers → Webhooks → Add endpoint
						</p>
						<Button
							className="mt-2"
							onClick={() =>
								window.open("https://dashboard.stripe.com/webhooks", "_blank")
							}
							size="sm"
							variant="outline"
						>
							<ArrowSquareOutIcon
								className="mr-2 h-4 w-4"
								size={16}
								weight="duotone"
							/>
							Open Stripe Dashboard
						</Button>
					</div>
				</div>
			</div>

			<div className="flex gap-2">
				<Button onClick={onBack} variant="outline">
					Back
				</Button>
				<Button
					className="flex-1"
					disabled={!localWebhookSecret || hasChanges}
					onClick={onNext}
				>
					Continue to Testing
				</Button>
			</div>
		</div>
	);
}
