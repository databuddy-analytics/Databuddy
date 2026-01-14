"use client";

import type { FlagWithScheduleForm } from "@databuddy/shared/flags";
import { flagWithScheduleSchema } from "@databuddy/shared/flags";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	BuildingsIcon,
	CaretDownIcon,
	ClockIcon,
	FlagIcon,
	GitBranchIcon,
	SpinnerGapIcon,
	UserIcon,
	UsersIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LineSlider } from "@/components/ui/line-slider";
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
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { GroupSelector } from "../groups/_components/group-selector";
import { DependencySelector } from "./dependency-selector";
import type { Flag, FlagSheetProps, TargetGroup } from "./types";
import { UserRulesBuilder } from "./user-rules-builder";
import { VariantEditor } from "./variant-editor";

type ExpandedSection =
	| "targeting"
	| "groups"
	| "dependencies"
	| "scheduling"
	| null;

function CollapsibleSection({
	icon: Icon,
	title,
	badge,
	isExpanded,
	onToggleAction,
	children,
}: {
	icon: React.ComponentType<{ size?: number; weight?: "duotone" | "fill" }>;
	title: string;
	badge?: number;
	isExpanded: boolean;
	onToggleAction: () => void;
	children: React.ReactNode;
}) {
	return (
		<div>
			<button
				className="group flex w-full cursor-pointer items-center justify-between rounded py-3 text-left transition-colors hover:bg-accent/50"
				onClick={onToggleAction}
				type="button"
			>
				<div className="flex items-center gap-2.5">
					<Icon size={16} weight="duotone" />
					<span className="font-medium text-sm">{title}</span>
					{badge !== undefined && badge > 0 && (
						<span className="flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							{badge}
						</span>
					)}
				</div>
				<CaretDownIcon
					className={cn(
						"size-4 text-muted-foreground transition-transform duration-200",
						isExpanded && "rotate-180"
					)}
					weight="fill"
				/>
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="pb-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function FlagSheet({
	isOpen,
	onCloseAction,
	websiteId,
	flag,
	template,
}: FlagSheetProps) {
	const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
	const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
	const queryClient = useQueryClient();

	const { data: flagsList } = useQuery({
		...orpc.flags.list.queryOptions({
			input: { websiteId },
		}),
	});

	const { data: targetGroups } = useQuery({
		...orpc.targetGroups.list.queryOptions({
			input: { websiteId },
		}),
	});

	const isEditing = Boolean(flag);

	const form = useForm<FlagWithScheduleForm>({
		resolver: zodResolver(flagWithScheduleSchema),
		defaultValues: {
			flag: {
				key: "",
				name: "",
				description: "",
				type: "boolean",
				status: "active",
				defaultValue: false,
				rolloutPercentage: 0,
				rolloutBy: undefined,
				rules: [],
				variants: [],
				dependencies: [],
				environment: undefined,
				targetGroupIds: [],
			},
			schedule: undefined,
		},
	});

	const createMutation = useMutation({
		...orpc.flags.create.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
	});

	const resetForm = useCallback(() => {
		if (flag && isEditing) {
			// Extract targetGroupIds from either targetGroupIds array or targetGroups objects array
			const extractTargetGroupIds = (): string[] => {
				if (flag.targetGroupIds && Array.isArray(flag.targetGroupIds)) {
					return flag.targetGroupIds;
				}
				if (flag.targetGroups && Array.isArray(flag.targetGroups)) {
					return flag.targetGroups.map((g) =>
						typeof g === "string" ? g : g.id
					);
				}
				return [];
			};

			form.reset({
				flag: {
					key: flag.key,
					name: flag.name || "",
					description: flag.description || "",
					type: flag.type,
					status: flag.status,
					defaultValue: Boolean(flag.defaultValue),
					rolloutPercentage: flag.rolloutPercentage ?? 0,
					rolloutBy: flag.rolloutBy || undefined,
					rules: flag.rules ?? [],
					variants: flag.variants ?? [],
					dependencies: flag.dependencies ?? [],
					environment: flag.environment || undefined,
					targetGroupIds: extractTargetGroupIds(),
				},
				schedule: undefined,
			});
		} else if (template) {
			form.reset({
				flag: {
					key: template.id,
					name: template.name,
					description: template.description,
					type: template.type,
					status: "active",
					defaultValue: template.defaultValue,
					rolloutPercentage:
						template.type === "rollout" || template.type === "boolean"
							? (template.rolloutPercentage ?? 0)
							: 0,
					rolloutBy: undefined,
					rules: template.rules ?? [],
					variants: template.type === "multivariant" ? template.variants : [],
					dependencies: [],
					targetGroupIds: [],
				},
				schedule: undefined,
			});
			if (template.rules && template.rules.length > 0) {
				setExpandedSection("targeting");
			}
		} else {
			form.reset({
				flag: {
					key: "",
					name: "",
					description: "",
					type: "boolean",
					status: "active",
					defaultValue: false,
					rolloutPercentage: 0,
					rolloutBy: undefined,
					rules: [],
					variants: [],
					dependencies: [],
					targetGroupIds: [],
				},
				schedule: undefined,
			});
		}
		setKeyManuallyEdited(false);
		if (!template) {
			setExpandedSection(null);
		}
	}, [flag, isEditing, form, template]);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onCloseAction();
		}
	};

	// Reset form when dialog opens or flag/template changes
	useEffect(() => {
		if (isOpen) {
			resetForm();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [flag?.id, template?.id, isOpen]);

	const watchedType = form.watch("flag.type");
	const watchedRules = form.watch("flag.rules") || [];
	const watchedDependencies = form.watch("flag.dependencies") || [];
	// const watchedScheduleEnabled = form.watch("schedule.isEnabled");

	const handleNameChange = (value: string) => {
		form.setValue("flag.name", value);

		const canAutoGenerate = !(isEditing || keyManuallyEdited) && value;
		if (canAutoGenerate) {
			const key = value
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, "")
				.replace(/\s+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 50);
			form.setValue("flag.key", key);
		}
	};

	const toggleSection = (section: ExpandedSection) => {
		setExpandedSection((prev) => (prev === section ? null : section));
	};

	const onSubmit = async (formData: FlagWithScheduleForm) => {
		try {
			const data = formData.flag;

			if (isEditing && flag) {
				const updateData = {
					id: flag.id,
					name: data.name,
					description: data.description,
					type: data.type,
					status: data.status,
					rules: data.rules || [],
					variants: data.variants || [],
					dependencies: data.dependencies || [],
					environment: data.environment?.trim() || undefined,
					defaultValue: data.defaultValue,
					rolloutPercentage: data.rolloutPercentage ?? 0,
					rolloutBy: data.rolloutBy || undefined,
					targetGroupIds: data.targetGroupIds || [],
				};
				await updateMutation.mutateAsync(updateData);
			} else {
				const createData = {
					websiteId,
					key: data.key,
					name: data.name,
					description: data.description,
					type: data.type,
					status: data.status,
					rules: data.rules || [],
					variants: data.variants || [],
					dependencies: data.dependencies || [],
					environment: data.environment?.trim() || undefined,
					defaultValue: data.defaultValue,
					rolloutPercentage: data.rolloutPercentage ?? 0,
					rolloutBy: data.rolloutBy || undefined,
					targetGroupIds: data.targetGroupIds || [],
				};
				await createMutation.mutateAsync(createData);
			}

			toast.success(`Flag ${isEditing ? "updated" : "created"} successfully`);

			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});

			onCloseAction();
		} catch (error) {
			console.error("Flag mutation error:", error);
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;
	const isRollout = watchedType === "rollout";
	const isMultivariant = watchedType === "multivariant";

	return (
		<Sheet onOpenChange={handleOpenChange} open={isOpen}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<FlagIcon className="text-primary" size={20} weight="fill" />
						</div>
						<div>
							<SheetTitle className="text-lg">
								{isEditing
									? "Edit Flag"
									: template
										? `Create from ${template.name}`
										: "Create Flag"}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? `Editing ${flag?.name || flag?.key}`
									: template
										? "Pre-configured with template settings"
										: "Set up a new feature flag"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(onSubmit, (errors) => {
							console.error("Validation errors:", errors);
							// Show first validation error
							const firstError = Object.values(errors)[0];
							if (firstError?.message) {
								toast.error(`Validation error: ${firstError.message}`);
							} else {
								toast.error("Please fix the form errors");
							}
						})}
					>
						<SheetBody className="space-y-6">
							{/* Basic Info */}
							<div className="space-y-4">
								<div className="grid gap-4 sm:grid-cols-2">
									<FormField
										control={form.control}
										name="flag.name"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Name</FormLabel>
												<FormControl>
													<Input
														placeholder="New Feature…"
														{...field}
														onChange={(e) => handleNameChange(e.target.value)}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="flag.key"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Key
													{!isEditing && (
														<span className="ml-1 text-destructive">*</span>
													)}
												</FormLabel>
												<FormControl>
													<Input
														className={cn(isEditing && "bg-muted")}
														disabled={isEditing}
														placeholder="new-feature"
														{...field}
														onChange={(e) => {
															setKeyManuallyEdited(true);
															field.onChange(e);
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
									name="flag.description"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-muted-foreground">
												Description (optional)
											</FormLabel>
											<FormControl>
												<Textarea
													className="min-h-16 resize-none"
													placeholder="What does this flag control?…"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Separator */}
							<div className="h-px bg-border" />

							{/* Type & Value */}
							<div className="space-y-4">
								<div className="space-y-2">
									<div className="space-y-0.5">
										<span className="font-medium text-foreground text-sm">
											Flag Type
										</span>
										<p className="text-muted-foreground text-xs">
											How the flag value is determined for each user
										</p>
									</div>
									<div className="flex gap-2">
										{(["boolean", "rollout", "multivariant"] as const).map(
											(type) => {
												const isSelected = watchedType === type;
												const typeDescriptions = {
													boolean: "On or Off",
													rollout: "% of users",
													multivariant: "A/B variants",
												};
												return (
													<button
														className={cn(
															"flex-1 cursor-pointer rounded border py-2 text-center transition-all",
															isSelected
																? "border-primary bg-primary/5 text-foreground"
																: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
														)}
														key={type}
														onClick={() => form.setValue("flag.type", type)}
														type="button"
													>
														<span className="block font-medium text-sm capitalize">
															{type}
														</span>
														<span className="block text-muted-foreground text-xs">
															{typeDescriptions[type]}
														</span>
													</button>
												);
											}
										)}
									</div>
								</div>

								<AnimatePresence mode="wait">
									{isRollout ? (
										<motion.div
											animate={{ opacity: 1, y: 0 }}
											className="space-y-3"
											exit={{ opacity: 0, y: -10 }}
											initial={{ opacity: 0, y: 10 }}
											key="rollout"
											transition={{ duration: 0.15 }}
										>
											<FormField
												control={form.control}
												name="flag.rolloutPercentage"
												render={({ field }) => (
													<div className="space-y-3">
														<div className="flex items-center justify-between">
															<div className="space-y-0.5">
																<span className="font-medium text-foreground text-sm">
																	Rollout Percentage
																</span>
																<p className="text-muted-foreground text-xs">
																	% of users who get true (when active)
																</p>
															</div>
															<span className="font-mono text-foreground text-lg tabular-nums">
																{field.value}%
															</span>
														</div>
														<LineSlider
															max={100}
															min={0}
															onValueChange={field.onChange}
															value={Number(field.value) || 0}
														/>
														<div className="flex gap-1">
															{[0, 25, 50, 75, 100].map((preset) => (
																<button
																	className={cn(
																		"flex-1 cursor-pointer rounded border py-1.5 font-medium text-xs transition-all",
																		Number(field.value) === preset
																			? "border-primary bg-primary text-primary-foreground"
																			: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
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
												)}
											/>

											<FormField
												control={form.control}
												name="flag.rolloutBy"
												render={({ field }) => {
													const rolloutByValue = field.value || "user";
													const options = [
														{
															value: "user",
															label: "User",
															description: "Each user individually",
															icon: UserIcon,
														},
														{
															value: "organization",
															label: "Organization",
															description: "All org members together",
															icon: BuildingsIcon,
														},
														{
															value: "team",
															label: "Team",
															description: "All team members together",
															icon: UsersThreeIcon,
														},
													] as const;

													return (
														<div className="space-y-2">
															<div className="space-y-0.5">
																<span className="font-medium text-foreground text-sm">
																	Rollout Unit
																</span>
																<p className="text-muted-foreground text-xs">
																	Group users for consistent rollout results
																</p>
															</div>
															<div className="flex gap-2">
																{options.map((option) => {
																	const isSelected =
																		rolloutByValue === option.value;
																	const Icon = option.icon;
																	return (
																		<button
																			className={cn(
																				"flex flex-1 cursor-pointer flex-col items-center gap-1 rounded border px-2 py-2.5 text-center transition-all",
																				isSelected
																					? "border-primary bg-primary/5 text-foreground"
																					: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
																			)}
																			key={option.value}
																			onClick={() =>
																				field.onChange(option.value)
																			}
																			type="button"
																		>
																			<Icon
																				className={cn(
																					"size-4",
																					isSelected
																						? "text-primary"
																						: "text-muted-foreground"
																				)}
																				weight="duotone"
																			/>
																			<span className="block font-medium text-xs">
																				{option.label}
																			</span>
																			<span className="block text-[10px] text-muted-foreground leading-tight">
																				{option.description}
																			</span>
																		</button>
																	);
																})}
															</div>
														</div>
													);
												}}
											/>
										</motion.div>
									) : isMultivariant ? (
										<motion.div
											animate={{ opacity: 1, y: 0 }}
											className="space-y-3"
											exit={{ opacity: 0, y: -10 }}
											initial={{ opacity: 0, y: 10 }}
											key="multivariant"
											transition={{ duration: 0.15 }}
										>
											<FormField
												control={form.control}
												name="flag.variants"
												render={({ field }) => (
													<VariantEditor
														onChangeAction={field.onChange}
														variants={field.value || []}
													/>
												)}
											/>
										</motion.div>
									) : (
										<motion.div
											animate={{ opacity: 1, y: 0 }}
											className="space-y-2"
											exit={{ opacity: 0, y: -10 }}
											initial={{ opacity: 0, y: 10 }}
											key="boolean"
											transition={{ duration: 0.15 }}
										>
											<div className="flex items-center justify-between">
												<div className="space-y-0.5">
													<span className="font-medium text-foreground text-sm">
														Return Value
													</span>
													<p className="text-muted-foreground text-xs">
														What users get when flag is active
													</p>
												</div>
												<FormField
													control={form.control}
													name="flag.defaultValue"
													render={({ field }) => (
														<div className="flex items-center gap-3">
															<span
																className={cn(
																	"text-sm transition-colors",
																	field.value
																		? "text-muted-foreground/60"
																		: "text-foreground"
																)}
															>
																Off
															</span>
															<Switch
																checked={field.value}
																onCheckedChange={field.onChange}
															/>
															<span
																className={cn(
																	"text-sm transition-colors",
																	field.value
																		? "text-foreground"
																		: "text-muted-foreground/60"
																)}
															>
																On
															</span>
														</div>
													)}
												/>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</div>

							{/* Status */}
							<FormField
								control={form.control}
								name="flag.status"
								render={({ field }) => {
									const inactiveDeps = (flagsList || []).filter(
										(f) =>
											watchedDependencies.includes(f.key) &&
											f.status !== "active"
									);
									const canBeActive = inactiveDeps.length === 0;

									const statusDescriptions = {
										active: "Live, evaluates rules",
										inactive: "Off, always returns false",
										archived: "Retired, hidden from list",
									};

									return (
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<div className="space-y-0.5">
													<span className="font-medium text-foreground text-sm">
														Flag Status
													</span>
													<p className="text-muted-foreground text-xs">
														Active = uses settings below. Inactive = completely
														off.
													</p>
												</div>
												{!canBeActive && (
													<span className="text-warning text-xs">
														Dependencies must be active first
													</span>
												)}
											</div>
											<div className="flex gap-2">
												{(["active", "inactive", "archived"] as const).map(
													(status) => {
														const isDisabled =
															status === "active" && !canBeActive;
														const isSelected = field.value === status;
														return (
															<button
																className={cn(
																	"flex-1 cursor-pointer rounded border py-2 transition-all",
																	isSelected
																		? status === "active"
																			? "green-angled-rectangle-gradient border-success/50 bg-success/10 text-success"
																			: status === "inactive"
																				? "red-angled-rectangle-gradient border-destructive/50 bg-destructive/10 text-destructive"
																				: "amber-angled-rectangle-gradient border-warning/50 bg-warning/10 text-warning"
																		: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground",
																	isDisabled && "cursor-not-allowed opacity-50"
																)}
																disabled={isDisabled}
																key={status}
																onClick={() => field.onChange(status)}
																type="button"
															>
																<span className="block font-medium text-sm capitalize">
																	{status}
																</span>
																<span
																	className={cn(
																		"block text-xs",
																		isSelected
																			? "opacity-80"
																			: "text-muted-foreground"
																	)}
																>
																	{statusDescriptions[status]}
																</span>
															</button>
														);
													}
												)}
											</div>
										</div>
									);
								}}
							/>

							{/* Divider */}
							<div className="h-px bg-border" />

							{/* Advanced Options */}
							<div className="space-y-1">
								<CollapsibleSection
									badge={
										form.watch("flag.targetGroupIds")?.length ??
										(targetGroups as TargetGroup[] | undefined)?.length
									}
									icon={UsersThreeIcon}
									isExpanded={expandedSection === "groups"}
									onToggleAction={() => toggleSection("groups")}
									title="Target Groups"
								>
									<FormField
										control={form.control}
										name="flag.targetGroupIds"
										render={({ field }) => (
											<GroupSelector
												availableGroups={(targetGroups as TargetGroup[]) ?? []}
												onChangeAction={(ids) => field.onChange(ids)}
												selectedGroups={field.value ?? []}
											/>
										)}
									/>
								</CollapsibleSection>

								<CollapsibleSection
									badge={watchedRules.length}
									icon={UsersIcon}
									isExpanded={expandedSection === "targeting"}
									onToggleAction={() => toggleSection("targeting")}
									title="User Targeting"
								>
									<FormField
										control={form.control}
										name="flag.rules"
										render={({ field }) => (
											<UserRulesBuilder
												onChange={field.onChange}
												rules={field.value || []}
											/>
										)}
									/>
								</CollapsibleSection>

								<CollapsibleSection
									badge={watchedDependencies.length}
									icon={GitBranchIcon}
									isExpanded={expandedSection === "dependencies"}
									onToggleAction={() => toggleSection("dependencies")}
									title="Dependencies"
								>
									<FormField
										control={form.control}
										name="flag.dependencies"
										render={({ field }) => (
											<DependencySelector
												availableFlags={(flagsList as Flag[]) || []}
												currentFlagKey={flag?.key}
												onChange={field.onChange}
												value={field.value || []}
											/>
										)}
									/>
								</CollapsibleSection>

								<CollapsibleSection
									icon={ClockIcon}
									isExpanded={expandedSection === "scheduling"}
									onToggleAction={() => toggleSection("scheduling")}
									title="Scheduling"
								>
									<div className="rounded border border-border border-dashed bg-muted/30 px-4 py-8 text-center">
										<ClockIcon
											className="mx-auto mb-2 text-muted-foreground"
											size={24}
											weight="duotone"
										/>
										<p className="font-medium text-foreground text-sm">
											Coming Soon
										</p>
										<p className="mt-1 text-muted-foreground text-xs">
											Schedule flag changes and rollouts for future dates
										</p>
									</div>
								</CollapsibleSection>
							</div>
						</SheetBody>

						<SheetFooter>
							<Button onClick={onCloseAction} type="button" variant="ghost">
								Cancel
							</Button>
							<Button className="min-w-28" disabled={isLoading} type="submit">
								{isLoading ? (
									<>
										<SpinnerGapIcon className="animate-spin" size={16} />
										{isEditing ? "Saving…" : "Creating…"}
									</>
								) : isEditing ? (
									"Save Changes"
								) : (
									"Create Flag"
								)}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
