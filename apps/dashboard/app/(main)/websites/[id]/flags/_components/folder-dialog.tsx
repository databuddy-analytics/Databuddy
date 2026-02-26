"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const folderSchema = z.object({
	name: z
		.string()
		.min(1, "Folder name is required")
		.max(100, "Folder name must be less than 100 characters")
		.regex(
			/^[a-zA-Z0-9_\-/\s]+$/,
			"Only letters, numbers, spaces, hyphens, underscores, and slashes allowed"
		),
});

type FolderFormValues = z.infer<typeof folderSchema>;

interface FolderDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (folderName: string) => void;
	initialValue?: string;
	mode: "create" | "rename";
}

export function FolderDialog({
	isOpen,
	onClose,
	onSubmit,
	initialValue = "",
	mode,
}: FolderDialogProps) {
	const form = useForm<FolderFormValues>({
		resolver: zodResolver(folderSchema),
		defaultValues: {
			name: initialValue,
		},
	});

	const handleSubmit = (values: FolderFormValues) => {
		onSubmit(values.name);
		form.reset();
		onClose();
	};

	const handleClose = () => {
		form.reset();
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Create Folder" : "Rename Folder"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new folder to organize your feature flags."
							: "Rename this folder. All flags in this folder will be updated."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Folder Name</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="e.g., Authentication, Billing"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button type="submit">
								{mode === "create" ? "Create" : "Rename"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
