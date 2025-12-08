"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlagIcon, InfoIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LineSlider } from "@/components/ui/line-slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";
import { UserRulesBuilder } from "./user-rules-builder";

const userRuleSchema = z.object({
	type: z.enum(["user_id", "email", "property"]),
	operator: z.enum([
		"equals",
		"contains",
		"starts_with",
		"ends_with",
		"in",
		"not_in",
		"exists",
		"not_exists",
	]),
	field: z.string().optional(),
	value: z.string().optional(),
	values: z.array(z.string()).optional(),
	enabled: z.boolean(),
	batch: z.boolean(),
	batchValues: z.array(z.string()).optional(),
});

const flagFormSchema = z.object({
	key: z
		.string()
		.min(1, "Key is required")
		.max(100, "Key too long")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Key must contain only letters, numbers, underscores, and hyphens"
		),
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name too long")
		.optional(),
	description: z.string().optional(),
	type: z.enum(["boolean", "rollout"]),
	status: z.enum(["active", "inactive", "archived"]),
	defaultValue: z.boolean(),
	rolloutPercentage: z.number().min(0).max(100),
	rules: z.array(userRuleSchema).optional(),
});

type FlagFormData = z.infer<typeof flagFormSchema>;

type FlagSheetProps = {
	isOpen: boolean;
	onCloseAction: () => void;
	websiteId: string;
	flag?: Flag | null;
};

export function FlagSheet({
	isOpen,
	onCloseAction,
	websiteId,
	flag,
}: FlagSheetProps) {
	const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
	const isEditing = Boolean(flag);

	const form = useForm<FlagFormData>({
		resolver: zodResolver(flagFormSchema),
		defaultValues: {
			key: "",
			name: "",
			description: "",
			type: "boolean",
			status: "active",
			defaultValue: false,
			rolloutPercentage: 0,
			rules: [],
		},
	});

	const queryClient = useQueryClient();
	const createMutation = useMutation({
		...orpc.flags.create.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
	});

	useEffect(() => {
		if (isOpen) {
			if (flag && isEditing) {
				form.reset({
					key: flag.key,
					name: flag.name || "",
					description: flag.description || "",
					type: flag.type as "boolean" | "rollout",
					status: flag.status as "active" | "inactive" | "archived",
					defaultValue: Boolean(flag.defaultValue),
					rolloutPercentage: flag.rolloutPercentage || 0,
					rules: flag.rules || [],
				});
			} else {
				form.reset();
			}
			setKeyManuallyEdited(false);
		}
	}, [isOpen, flag, isEditing, form]);

	const watchedName = form.watch("name");
	const watchedType = form.watch("type");

	useEffect(() => {
		if (isEditing || keyManuallyEdited || !watchedName) {
			return;
		}

		const key = watchedName
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 50);
		form.setValue("key", key);
	}, [watchedName, keyManuallyEdited, isEditing, form]);

	// Show rollout percentage only for rollout type
	const showRolloutPercentage = watchedType === "rollout";

	const onSubmit = async (data: FlagFormData) => {
		try {
			const mutation = isEditing ? updateMutation : createMutation;
			const mutationData =
				isEditing && flag
					? {
							id: flag.id,
							name: data.name,
							description: data.description,
							type: data.type,
							status: data.status,
							defaultValue: data.defaultValue,
							rolloutPercentage: data.rolloutPercentage,
							rules: data.rules || [],
						}
					: {
							websiteId,
							key: data.key,
							name: data.name,
							description: data.description,
							type: data.type,
							status: data.status,
							defaultValue: data.defaultValue,
							rolloutPercentage: data.rolloutPercentage,
							rules: data.rules || [],
						};

			await mutation.mutateAsync(mutationData as any);
			toast.success(`Flag ${isEditing ? "updated" : "created"} successfully`);

			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
			onCloseAction();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			if (
				errorMessage.includes("unique") ||
				errorMessage.includes("CONFLICT")
			) {
				toast.error("A flag with this key already exists in this scope");
			} else if (errorMessage.includes("FORBIDDEN")) {
				toast.error("You do not have permission to perform this action");
			} else {
				toast.error(`Failed to ${isEditing ? "update" : "create"} flag`);
			}
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={onCloseAction} open={isOpen}>
			<SheetContent side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
							<FlagIcon
								className="text-accent-foreground"
								size={22}
								weight="fill"
							/>
						</div>
						<div>
							<SheetTitle className="text-lg">
								{isEditing ? "Edit Feature Flag" : "Create Feature Flag"}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? "Update flag configuration and settings"
									: "Set up a new feature flag for controlled rollouts"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-y-auto"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<SheetBody className="space-y-6">
							{/* Basic Information */}
							<section className="space-y-3">
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<FormField
										control={form.control}
										name="name"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Flag Name</FormLabel>
												<FormControl>
													<Input
														placeholder="New Dashboard Feature"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="key"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Key{" "}
													{isEditing ? (
														<Tooltip>
															<TooltipTrigger asChild>
																<InfoIcon className="size-4" weight="duotone" />
															</TooltipTrigger>
															<TooltipContent className="max-w-xs">
																<div className="space-y-2">
																	<p className="text-xs leading-relaxed">
																		Key cannot be changed after creation to
																		maintain data integrity.
																	</p>
																</div>
															</TooltipContent>
														</Tooltip>
													) : (
														<span aria-hidden="true" className="text-red-500">
															*
														</span>
													)}
												</FormLabel>
												<FormControl>
													<Input
														placeholder="new-dashboard"
														{...field}
														disabled={isEditing}
														onChange={(e) => {
															const value = e.target.value;
															setKeyManuallyEdited(value.length > 0);
															field.onChange(value);
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Description{" "}
												<span className="text-muted-foreground text-xs">
													(Optional)
												</span>
											</FormLabel>
											<FormControl>
												<Textarea
													placeholder="What does this flag control?"
													rows={2}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</section>

							{/* Configuration */}
							<section className="space-y-3">
								<div className="flex w-full flex-wrap gap-4">
									<FormField
										control={form.control}
										name="type"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Flag Type</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectItem value="boolean">
															Boolean (On/Off)
														</SelectItem>
														<SelectItem value="rollout">
															Rollout (Percentage)
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="status"
										render={({ field }) => (
											<FormItem className="flex-1">
												<FormLabel>Status</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value}
												>
													<FormControl>
														<SelectTrigger className="w-full grow">
															<SelectValue />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectItem value="active">Active</SelectItem>
														<SelectItem value="inactive">Inactive</SelectItem>
														<SelectItem value="archived">Archived</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="defaultValue"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Default Value</FormLabel>
												<FormControl>
													<div className="flex h-9 w-fit items-center justify-center rounded-md border bg-accent-brighter/80 px-3 will-change-contents">
														<div className="flex items-center gap-2">
															<span
																className={cn(
																	"text-sm",
																	field.value === false
																		? "text-muted-foreground"
																		: "text-muted-foreground/50"
																)}
															>
																Off
															</span>
															<Switch
																aria-label="Toggle default flag value"
																checked={field.value}
																onCheckedChange={field.onChange}
															/>
															<span
																className={cn(
																	"text-sm",
																	field.value === true
																		? "text-muted-foreground"
																		: "text-muted-foreground/50"
																)}
															>
																On
															</span>
														</div>
													</div>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>

							{/* Rollout Percentage */}
							{showRolloutPercentage && (
								<section className="space-y-3">
									<FormField
										control={form.control}
										name="rolloutPercentage"
										render={({ field }) => {
											const currentValue = Number(field.value) || 0;
											return (
												<FormItem>
													<FormLabel>
														Rollout Percentage:{" "}
														<span className="text-muted-foreground text-xs tabular-nums">
															{currentValue}%
														</span>
													</FormLabel>
													<FormControl>
														<div className="space-y-4">
															<LineSlider
																max={100}
																min={0}
																onValueChange={field.onChange}
																value={currentValue}
															/>
															<div className="flex flex-wrap justify-center gap-2">
																{[0, 25, 50, 75, 100].map((preset) => (
																	<button
																		aria-label={`Set rollout to ${preset}% ${preset === 0 ? "(disabled)" : preset === 100 ? "(enabled)" : ""}`}
																		className={cn(
																			"flex-1 rounded border px-3 py-2 text-sm",
																			{
																				"border-primary bg-primary text-primary-foreground":
																					currentValue === preset,
																				"border-border hover:border-primary/50":
																					currentValue !== preset,
																			}
																		)}
																		key={preset}
																		onClick={() => field.onChange(preset)}
																		type="button"
																	>
																		{preset}%
																	</button>
																))}
															</div>
														</div>
													</FormControl>
													<FormDescription className="mx-auto text-muted-foreground text-xs">
														Percentage of users who will see this flag enabled.
														0% = disabled, 100% = fully enabled.
													</FormDescription>
													<FormMessage />
												</FormItem>
											);
										}}
									/>
								</section>
							)}

							{/* User Targeting Rules */}
							<section className="space-y-3">
								<FormField
									control={form.control}
									name="rules"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												User Targeting{" "}
												<span className="text-muted-foreground text-xs">
													(Optional)
												</span>
											</FormLabel>
											<FormControl>
												<UserRulesBuilder
													onChange={field.onChange}
													rules={field.value || []}
												/>
											</FormControl>
											<FormDescription>
												Define rules to target specific users or groups
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</section>
						</SheetBody>

						<SheetFooter>
							<Button onClick={onCloseAction} type="button" variant="ghost">
								Cancel
							</Button>
							<Button disabled={isLoading} type="submit">
								{isLoading
									? isEditing
										? "Updating..."
										: "Creating..."
									: isEditing
										? "Update Flag"
										: "Create Flag"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
