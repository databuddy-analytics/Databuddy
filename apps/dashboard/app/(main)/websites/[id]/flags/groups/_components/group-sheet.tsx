"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	GROUP_COLORS,
	type GroupSheetProps,
	type UserRule,
} from "../../_components/types";
import { UserRulesBuilder } from "../../_components/user-rules-builder";
import { CheckIcon, UsersThreeIcon } from "@databuddy/ui/icons";
import { Button, Divider, Field, Input, Textarea } from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

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
	onSavedAction,
	recommendationId,
	websiteId,
	group,
	initialDraft,
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
		} else if (initialDraft) {
			form.reset({
				name: initialDraft.name,
				description: initialDraft.description ?? "",
				color: initialDraft.color,
				rules: initialDraft.rules,
			});
			setSelectedColor(initialDraft.color);
		} else {
			form.reset({
				name: "",
				description: "",
				color: GROUP_COLORS[0].value,
				rules: [],
			});
			setSelectedColor(GROUP_COLORS[0].value);
		}
	}, [form, group, initialDraft, isEditing]);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			resetForm();
		} else {
			onCloseAction();
		}
	};

	useEffect(() => {
		if (isOpen) {
			resetForm();
		}
	}, [group, initialDraft, isOpen, resetForm]);

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
					recommendationId,
				});
			}

			toast.success(`Group ${isEditing ? "updated" : "created"} successfully`);

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: orpc.targetGroups.list.key({ input: { websiteId } }),
				}),
				onSavedAction?.(),
			]);

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
			<Sheet.Content className="sm:max-w-xl" side="right">
				<Sheet.Header>
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
							<Sheet.Title className="text-lg">
								{isEditing ? "Edit Group" : "Create Group"}
							</Sheet.Title>
							<Sheet.Description>
								{isEditing
									? `Editing ${group?.name}`
									: "Create a reusable targeting group"}
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<form
					className="flex flex-1 flex-col overflow-hidden"
					onSubmit={form.handleSubmit(onSubmit, (errors) => {
						console.error("Validation errors:", JSON.stringify(errors));
						toast.error("Please fix the form errors");
					})}
				>
					<Sheet.Body className="space-y-6">
						<div className="space-y-4">
							<Controller
								control={form.control}
								name="name"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>
											Name <span className="text-destructive">*</span>
										</Field.Label>
										<Input placeholder="Beta Testers…" {...field} />
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="description"
								render={({ field }) => (
									<Field>
										<Field.Label className="text-muted-foreground">
											Description (optional)
										</Field.Label>
										<Textarea
											className="min-h-16 resize-none"
											placeholder="Who belongs to this group?…"
											{...field}
										/>
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="color"
								render={({ field }) => (
									<Field>
										<Field.Label className="text-muted-foreground">
											Color
										</Field.Label>
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
															className="size-3.5 text-white drop-shadow-sm"
															weight="bold"
														/>
													)}
												</button>
											))}
										</div>
									</Field>
								)}
							/>
						</div>

						<Divider />

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

							<Controller
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
					</Sheet.Body>

					<Sheet.Footer>
						<Button onClick={onCloseAction} type="button" variant="secondary">
							Cancel
						</Button>
						<Button className="min-w-28" loading={isLoading} type="submit">
							{isEditing ? "Save Changes" : "Create Group"}
						</Button>
					</Sheet.Footer>
				</form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}
