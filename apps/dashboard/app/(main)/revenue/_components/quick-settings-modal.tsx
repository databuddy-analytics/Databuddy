"use client";

import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CopyIcon,
	GearSixIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface QuickSettingsModalProps {
	webhookToken: string;
	webhookSecret: string;
	isLiveMode: boolean;
	webhookUrl: string;
	onSave: (data: { webhookSecret: string; isLiveMode: boolean }) => void;
	onRegenerateToken?: () => void;
	copyToClipboard: (text: string, label: string) => void;
	isSaving?: boolean;
	isRegeneratingToken?: boolean;
	trigger?: React.ReactNode;
}

export function QuickSettingsModal({
	webhookToken,
	webhookSecret,
	isLiveMode,
	webhookUrl,
	onSave,
	onRegenerateToken,
	copyToClipboard,
	isSaving = false,
	isRegeneratingToken = false,
	trigger,
}: QuickSettingsModalProps) {
	const [open, setOpen] = useState(false);
	const [localWebhookSecret, setLocalWebhookSecret] = useState(webhookSecret);
	const [localIsLiveMode, setLocalIsLiveMode] = useState(isLiveMode);
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

	// Sync local state with props when they change
	useEffect(() => {
		setLocalWebhookSecret(webhookSecret);
		setLocalIsLiveMode(isLiveMode);
		setHasUnsavedChanges(false);
	}, [webhookSecret, isLiveMode]);

	const isSetupComplete = !!(webhookToken && webhookSecret);

	const handleSecretChange = (value: string) => {
		setLocalWebhookSecret(value);
		setHasUnsavedChanges(
			value !== webhookSecret || localIsLiveMode !== isLiveMode
		);
	};

	const handleLiveModeChange = (value: boolean) => {
		setLocalIsLiveMode(value);
		setHasUnsavedChanges(
			localWebhookSecret !== webhookSecret || value !== isLiveMode
		);
	};

	const handleSave = () => {
		onSave({
			webhookSecret: localWebhookSecret,
			isLiveMode: localIsLiveMode,
		});
		setHasUnsavedChanges(false);
		toast.success("Settings saved successfully");
	};

	const handleReset = () => {
		setLocalWebhookSecret(webhookSecret);
		setLocalIsLiveMode(isLiveMode);
		setHasUnsavedChanges(false);
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen && hasUnsavedChanges) {
			if (
				window.confirm(
					"You have unsaved changes. Are you sure you want to close?"
				)
			) {
				handleReset();
				setOpen(false);
			}
		} else {
			setOpen(newOpen);
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger asChild>
				{trigger || (
					<Button size="sm" variant="outline">
						<GearSixIcon className="mr-2 h-4 w-4" size={16} weight="duotone" />
						Quick Settings
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GearSixIcon className="h-5 w-5" size={20} weight="duotone" />
						Revenue Settings
					</DialogTitle>
					<DialogDescription>
						Quickly adjust your Stripe integration settings
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Status */}
					<div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
						<div className="flex items-center gap-2">
							{isSetupComplete ? (
								<CheckCircleIcon
									className="h-4 w-4 text-green-500"
									size={16}
									weight="fill"
								/>
							) : (
								<WarningCircleIcon
									className="h-4 w-4 text-orange-500"
									size={16}
									weight="duotone"
								/>
							)}
							<span className="font-medium text-sm">
								{isSetupComplete ? "Integration Active" : "Setup Required"}
							</span>
						</div>
						<Badge variant={localIsLiveMode ? "default" : "secondary"}>
							{localIsLiveMode ? "Live Mode" : "Test Mode"}
						</Badge>
					</div>

					{/* Webhook URL */}
					{webhookUrl && (
						<div className="space-y-2">
							<Label className="font-medium text-sm">Webhook Endpoint</Label>
							<div className="flex items-center gap-2">
								<Input
									className="font-mono text-xs"
									readOnly
									value={webhookUrl}
								/>
								<Button
									onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
									size="sm"
									variant="outline"
								>
									<CopyIcon className="h-4 w-4" size={16} weight="duotone" />
								</Button>
								<Button
									onClick={() =>
										window.open(
											"https://dashboard.stripe.com/webhooks",
											"_blank"
										)
									}
									size="sm"
									variant="outline"
								>
									<ArrowSquareOutIcon
										className="h-4 w-4"
										size={16}
										weight="duotone"
									/>
								</Button>
							</div>
						</div>
					)}

					<Separator />

					{/* Webhook Secret */}
					<div className="space-y-2">
						<Label className="font-medium text-sm" htmlFor="webhook-secret">
							Webhook Secret
						</Label>
						<Input
							className="font-mono"
							id="webhook-secret"
							onChange={(e) => handleSecretChange(e.target.value)}
							placeholder="whsec_..."
							type="password"
							value={localWebhookSecret}
						/>
						<p className="text-muted-foreground text-xs">
							Get this from your Stripe webhook endpoint settings
						</p>
					</div>

					<Separator />

					{/* Live Mode Toggle */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<Label className="font-medium text-sm">Live Mode</Label>
								<p className="text-muted-foreground text-xs">
									{localIsLiveMode
										? "Processing real payments"
										: "Using test data"}
								</p>
							</div>
							<Switch
								checked={localIsLiveMode}
								onCheckedChange={handleLiveModeChange}
							/>
						</div>
						{localIsLiveMode && (
							<div className="rounded border border-red-200 bg-red-50 p-2 text-red-600 text-xs dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
								⚠️ Live mode active - real payments will be processed
							</div>
						)}
					</div>

					<Separator />

					{/* Actions */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<Button
								className="flex-1"
								disabled={!hasUnsavedChanges || isSaving}
								onClick={handleSave}
								size="sm"
							>
								{isSaving ? "Saving..." : "Save Changes"}
							</Button>
							{hasUnsavedChanges && (
								<Button onClick={handleReset} size="sm" variant="outline">
									Reset
								</Button>
							)}
						</div>

						{isSetupComplete && onRegenerateToken && (
							<Button
								className="w-full"
								disabled={isRegeneratingToken}
								onClick={onRegenerateToken}
								size="sm"
								variant="outline"
							>
								<ArrowClockwiseIcon
									className={`mr-2 h-4 w-4 ${isRegeneratingToken ? "animate-spin" : ""}`}
									size={16}
									weight="fill"
								/>
								{isRegeneratingToken
									? "Regenerating Token..."
									: "Regenerate Webhook Token"}
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
