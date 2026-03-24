"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	CheckIcon,
	SpinnerGapIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	GROUP_COLORS,
	type GroupSheetProps,
	type UserRule,
} from "../../_components/types";
import { UserRulesBuilder } from "../../_components/user-rules-builder";

const groupFormSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(500).optional(),
	color: z.string(),
	rules: z.array(
		z.object({
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
		})
	),
});

type GroupFormData = z.infer<typeof groupFormSchema>;

export function GroupSheet({
	isOpen,
	onCloseAction,
	websiteId,
	group,
}: GroupSheetProps) {
	const queryClient = useQueryClient();
	const isEditing = Boolean(group);
	const [selectedColor, setSelectedColor] = useState(
		group?.color ?? GROUP_COLORS[0].value
	);

	const form = useForm<GroupFormData>({
		resolver: zodResolver(groupFormSchema),
		defaultValues: {
			name: "",
			description: "",
			color: GROUP_COLORS[0].value,
			rules: [],
		},
	});

	const createMutation = useMutation({
		...orpc.targetGroups.create.mutationOptions(),
	});

	const updateMutation = useMutation({
		...orpc.targetGroups.update.mutationOptions(),
	});

	const resetForm = useCallback(() => {
		if (group && isEditing) {
			form.reset({
				name: group.name,
				description: group.description ?? "",
				color: group.color,
				rules: group.rules as UserRule[],
			});
			setSelectedColor(group.color);
		} else {
			form.reset({
				name: "",
				description: "",
				color: GROUP_COLORS[0].value,
				rules: [],
			});
			setSelectedColor(GROUP_COLORS[0].value);
		}
	}, [group, isEditing, form]);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			resetForm();
		} else {
			onCloseAction();
		}
	};

	// Reset form when group changes
	useEffect(() => {
		if (isOpen) {
			resetForm();
		}
	}, [group, isOpen, resetForm]);

	const watchedRules = form.watch("rules") ?? [];

	const onSubmit = async (formData: GroupFormData) => {
		try {
			if (isEditing && group) {
				await updateMutation.mutateAsync({
					id: group.id,
					name: formData.name,
					description: formData.description,
					color: formData.color,
					rules: formData.rules,
				});
			} else {
				await createMutation.mutateAsync({
					websiteId,
					name: formData.name,
					description: formData.description,
					color: formData.color,
					rules: formData.rules,
				});
			}

			toast.success(`Group ${isEditing ? "updated" : "created"} successfully`);

			queryClient.invalidateQueries({
				queryKey: orpc.targetGroups.list.key({ input: { websiteId } }),
			});

			onCloseAction();
		} catch (error) {
			console.error("Group mutation error:", JSON.stringify(error));
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			toast.error(
				`Failed to ${isEditing ? "update" : "create"} group: ${errorMessage}`
			);
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={handleOpenChange} open={isOpen}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div
							className="flex size-11 items-center justify-center rounded border"
							style={{ backgroundColor: `${selectedColor}15` }}
						>
							<UsersThreeIcon
								className="size-5"
								style={{ color: selectedColor }}
								weight="duotone"
							/>
						</div>
						<div>
							<SheetTitle className="text-lg">
								{isEditing ? "Edit Group" : "Create Group"}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? `Editing ${group?.name}`
									: "Create a reusable targeting group"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(onSubmit, (errors) => {
							console.error("Validation errors:", JSON.stringify(errors));
							toast.error("Please fix the form errors");
						})}
					>
						<SheetBody className="space-y-6">
							{/* Basic Info */}
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Name <span className="text-destructive">*</span>
											</FormLabel>
											<FormControl>
												<Input placeholder="Beta Testers…" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-muted-foreground">
												Description (optional)
											</FormLabel>
											<FormControl>
												<Textarea
													className="min-h-16 resize-none"
													placeholder="Who belongs to this group?…"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Color Picker */}
								<FormField
									control={form.control}
									name="color"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-muted-foreground">
												Color
											</FormLabel>
											<FormControl>
												<div className="flex flex-wrap gap-2">
													{GROUP_COLORS.map((color) => (
														<button
															className={cn(
																"relative flex size-9 items-center justify-center rounded shadow-sm transition-all hover:scale-110 hover:shadow-md",
																field.value === color.value &&
																	"ring-2 ring-offset-2 ring-offset-background"
															)}
															key={color.value}
															onClick={() => {
																field.onChange(color.value);
																setSelectedColor(color.value);
															}}
															style={{
																background: `linear-gradient(135deg, ${color.value} 0%, ${color.value}cc 100%)`,
																...(field.value === color.value && {
																	ringColor: color.value,
																}),
															}}
															title={color.label}
															type="button"
														>
															{field.value === color.value && (
																<CheckIcon
																	className="text-white drop-shadow-sm"
																	size={14}
																	weight="bold"
																/>
															)}
														</button>
													))}
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Separator */}
							<div className="h-px bg-border" />

							{/* Targeting Rules */}
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="font-medium text-sm">Targeting Rules</h3>
										<p className="text-muted-foreground text-xs">
											Define who belongs to this group
										</p>
									</div>
									{watchedRules.length > 0 && (
										<span className="flex size-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
											{watchedRules.length}
										</span>
									)}
								</div>

								<FormField
									control={form.control}
									name="rules"
									render={({ field }) => (
										<UserRulesBuilder
											onChange={field.onChange}
											rules={(field.value as UserRule[]) ?? []}
										/>
									)}
								/>
							</div>
						</SheetBody>

						<SheetFooter>
							<Button onClick={onCloseAction} type="button" variant="outline">
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
									"Create Group"
								)}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
