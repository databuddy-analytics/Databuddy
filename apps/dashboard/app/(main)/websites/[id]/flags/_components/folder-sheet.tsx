"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { FOLDER_COLORS, type FolderSheetProps } from "./types";

const folderFormSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be 100 characters or less"),
	description: z.string().optional(),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
});

type FolderFormValues = z.infer<typeof folderFormSchema>;

export function FolderSheet({
	isOpen,
	onCloseAction,
	websiteId,
	folder,
}: FolderSheetProps) {
	const queryClient = useQueryClient();
	const isEditing = Boolean(folder);

	const form = useForm<FolderFormValues>({
		resolver: zodResolver(folderFormSchema),
		defaultValues: {
			name: folder?.name ?? "",
			description: folder?.description ?? "",
			color: folder?.color ?? "#6366f1",
		},
	});

	useEffect(() => {
		if (folder) {
			form.reset({
				name: folder.name,
				description: folder.description ?? "",
				color: folder.color,
			});
		} else {
			form.reset({
				name: "",
				description: "",
				color: "#6366f1",
			});
		}
	}, [folder, form]);

	const createFolderMutation = useMutation({
		...orpc.flags.createFolder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.listFolders.key({ input: { websiteId } }),
			});
			onCloseAction();
			form.reset();
		},
	});

	const updateFolderMutation = useMutation({
		...orpc.flags.updateFolder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.listFolders.key({ input: { websiteId } }),
			});
			onCloseAction();
			form.reset();
		},
	});

	const onSubmit = (values: FolderFormValues) => {
		if (isEditing && folder) {
			updateFolderMutation.mutate({
				id: folder.id,
				name: values.name,
				description: values.description || undefined,
				color: values.color,
			});
		} else {
			createFolderMutation.mutate({
				websiteId,
				name: values.name,
				description: values.description || undefined,
				color: values.color,
			});
		}
	};

	const isPending =
		createFolderMutation.isPending || updateFolderMutation.isPending;

	return (
		<Sheet open={isOpen} onOpenChange={(open) => !open && onCloseAction()}>
			<SheetContent className="sm:max-w-md">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<FolderSimpleIcon className="size-5" weight="duotone" />
						{isEditing ? "Edit Folder" : "Create Folder"}
					</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update the folder details"
							: "Create a new folder to organize your feature flags"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="mt-6 space-y-6"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g., Feature Rollouts, Experiments"
											{...field}
										/>
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
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Optional description for this folder..."
											className="resize-none"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										A brief description to help identify this folder
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="color"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Color</FormLabel>
									<FormControl>
										<div className="flex flex-wrap gap-2">
											{FOLDER_COLORS.map((color) => (
												<button
													key={color.value}
													type="button"
													onClick={() => field.onChange(color.value)}
													className={cn(
														"size-8 rounded-full transition-all hover:scale-110",
														field.value === color.value &&
															"ring-2 ring-offset-2 ring-offset-background"
													)}
													style={{
														backgroundColor: color.value,
														ringColor: color.value,
													}}
													aria-label={color.label}
												/>
											))}
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<SheetFooter className="gap-2 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={onCloseAction}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending
									? isEditing
										? "Saving..."
										: "Creating..."
									: isEditing
										? "Save Changes"
										: "Create Folder"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
