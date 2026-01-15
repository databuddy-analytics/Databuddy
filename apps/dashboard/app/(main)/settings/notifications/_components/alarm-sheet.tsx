"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const alarmSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().optional(),
	triggerType: z.enum([
		"uptime",
		"traffic_spike",
		"error_rate",
		"goal",
		"custom",
	]),
	notificationChannels: z.array(
		z.enum(["slack", "discord", "email", "webhook"])
	),
	slackWebhookUrl: z.string().url().optional().or(z.literal("")),
	discordWebhookUrl: z.string().url().optional().or(z.literal("")),
	emailAddresses: z.string().optional(),
	webhookUrl: z.string().url().optional().or(z.literal("")),
});

type AlarmFormData = z.infer<typeof alarmSchema>;

type Alarm = {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: string[];
	triggerType: string;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerConditions: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
};

interface AlarmSheetProps {
	alarm: Alarm | null;
	isOpen: boolean;
	onClose: () => void;
}

const NOTIFICATION_CHANNELS = [
	{ id: "slack", label: "Slack" },
	{ id: "discord", label: "Discord" },
	{ id: "email", label: "Email" },
	{ id: "webhook", label: "Webhook" },
] as const;

const TRIGGER_TYPES = [
	{ value: "uptime", label: "Uptime Monitoring" },
	{ value: "traffic_spike", label: "Traffic Spike" },
	{ value: "error_rate", label: "Error Rate" },
	{ value: "goal", label: "Goal Completion" },
	{ value: "custom", label: "Custom" },
] as const;

export function AlarmSheet({ alarm, isOpen, onClose }: AlarmSheetProps) {
	const queryClient = useQueryClient();
	const isEditing = !!alarm;

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<AlarmFormData>({
		resolver: zodResolver(alarmSchema),
		defaultValues: {
			name: alarm?.name || "",
			description: alarm?.description || "",
			triggerType:
				(alarm?.triggerType as AlarmFormData["triggerType"]) || "uptime",
			notificationChannels:
				(alarm?.notificationChannels as AlarmFormData["notificationChannels"]) ||
				[],
			slackWebhookUrl: alarm?.slackWebhookUrl || "",
			discordWebhookUrl: alarm?.discordWebhookUrl || "",
			emailAddresses: alarm?.emailAddresses?.join(", ") || "",
			webhookUrl: alarm?.webhookUrl || "",
		},
	});

	const selectedChannels = watch("notificationChannels");
	const selectedTriggerType = watch("triggerType");

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm created successfully");
			onClose();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to create alarm");
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({ input: {} }),
			});
			toast.success("Alarm updated successfully");
			onClose();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to update alarm");
		},
	});

	const onSubmit = async (data: AlarmFormData) => {
		const payload = {
			name: data.name,
			description: data.description || undefined,
			triggerType: data.triggerType,
			notificationChannels: data.notificationChannels,
			slackWebhookUrl: data.slackWebhookUrl || null,
			discordWebhookUrl: data.discordWebhookUrl || null,
			emailAddresses: data.emailAddresses
				? data.emailAddresses
						.split(",")
						.map((e) => e.trim())
						.filter(Boolean)
				: [],
			webhookUrl: data.webhookUrl || null,
		};

		if (isEditing && alarm) {
			await updateMutation.mutateAsync({
				id: alarm.id,
				...payload,
			});
		} else {
			await createMutation.mutateAsync(payload);
		}
	};

	const handleChannelToggle = (channelId: string, checked: boolean) => {
		const current = selectedChannels || [];
		if (checked) {
			setValue("notificationChannels", [
				...current,
				channelId as AlarmFormData["notificationChannels"][number],
			]);
		} else {
			setValue(
				"notificationChannels",
				current.filter((c) => c !== channelId)
			);
		}
	};

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
			<SheetContent className="overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>{isEditing ? "Edit Alarm" : "Create Alarm"}</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update your alarm configuration"
							: "Create a new notification alarm"}
					</SheetDescription>
				</SheetHeader>

				<form className="mt-6 space-y-6" onSubmit={handleSubmit(onSubmit)}>
					{/* Name */}
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input id="name" placeholder="My Alarm" {...register("name")} />
						{errors.name && (
							<p className="text-destructive text-sm">{errors.name.message}</p>
						)}
					</div>

					{/* Description */}
					<div className="space-y-2">
						<Label htmlFor="description">Description (optional)</Label>
						<Textarea
							id="description"
							placeholder="Describe what this alarm monitors..."
							{...register("description")}
						/>
					</div>

					{/* Trigger Type */}
					<div className="space-y-2">
						<Label>Trigger Type</Label>
						<Select
							onValueChange={(value) =>
								setValue("triggerType", value as AlarmFormData["triggerType"])
							}
							value={selectedTriggerType}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select trigger type" />
							</SelectTrigger>
							<SelectContent>
								{TRIGGER_TYPES.map((type) => (
									<SelectItem key={type.value} value={type.value}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Notification Channels */}
					<div className="space-y-3">
						<Label>Notification Channels</Label>
						<div className="space-y-2">
							{NOTIFICATION_CHANNELS.map((channel) => (
								<div className="flex items-center space-x-2" key={channel.id}>
									<Checkbox
										checked={selectedChannels?.includes(channel.id)}
										id={`channel-${channel.id}`}
										onCheckedChange={(checked) =>
											handleChannelToggle(channel.id, checked as boolean)
										}
									/>
									<Label
										className="font-normal"
										htmlFor={`channel-${channel.id}`}
									>
										{channel.label}
									</Label>
								</div>
							))}
						</div>
					</div>

					{/* Slack Webhook URL */}
					{selectedChannels?.includes("slack") && (
						<div className="space-y-2">
							<Label htmlFor="slackWebhookUrl">Slack Webhook URL</Label>
							<Input
								id="slackWebhookUrl"
								placeholder="https://hooks.slack.com/services/..."
								{...register("slackWebhookUrl")}
							/>
							{errors.slackWebhookUrl && (
								<p className="text-destructive text-sm">
									{errors.slackWebhookUrl.message}
								</p>
							)}
						</div>
					)}

					{/* Discord Webhook URL */}
					{selectedChannels?.includes("discord") && (
						<div className="space-y-2">
							<Label htmlFor="discordWebhookUrl">Discord Webhook URL</Label>
							<Input
								id="discordWebhookUrl"
								placeholder="https://discord.com/api/webhooks/..."
								{...register("discordWebhookUrl")}
							/>
							{errors.discordWebhookUrl && (
								<p className="text-destructive text-sm">
									{errors.discordWebhookUrl.message}
								</p>
							)}
						</div>
					)}

					{/* Email Addresses */}
					{selectedChannels?.includes("email") && (
						<div className="space-y-2">
							<Label htmlFor="emailAddresses">Email Addresses</Label>
							<Input
								id="emailAddresses"
								placeholder="email1@example.com, email2@example.com"
								{...register("emailAddresses")}
							/>
							<p className="text-muted-foreground text-xs">
								Separate multiple emails with commas
							</p>
						</div>
					)}

					{/* Custom Webhook URL */}
					{selectedChannels?.includes("webhook") && (
						<div className="space-y-2">
							<Label htmlFor="webhookUrl">Webhook URL</Label>
							<Input
								id="webhookUrl"
								placeholder="https://your-webhook-endpoint.com/..."
								{...register("webhookUrl")}
							/>
							{errors.webhookUrl && (
								<p className="text-destructive text-sm">
									{errors.webhookUrl.message}
								</p>
							)}
						</div>
					)}

					{/* Submit Button */}
					<div className="flex justify-end gap-3 pt-4">
						<Button onClick={onClose} type="button" variant="outline">
							Cancel
						</Button>
						<Button disabled={isSubmitting} type="submit">
							{isSubmitting
								? isEditing
									? "Updating..."
									: "Creating..."
								: isEditing
									? "Update Alarm"
									: "Create Alarm"}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}
