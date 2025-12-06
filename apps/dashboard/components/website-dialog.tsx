"use client";

import type { InferSelectModel, websites } from "@databuddy/db";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
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
import { useCreateWebsite, useUpdateWebsite } from "@/hooks/use-websites";

type UpdateWebsiteInput = {
	id: string;
	name: string;
	domain?: string;
	isPublic?: boolean;
};

type CreateWebsiteData = {
	name: string;
	domain: string;
	subdomain?: string;
	organizationId?: string;
};

const domainRegex =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const wwwRegex = /^www\./;

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	domain: z
		.string()
		.min(1, "Domain is required")
		.regex(domainRegex, "Invalid domain format"),
});

type FormData = z.infer<typeof formSchema>;
export type { CreateWebsiteData };
type WebsiteDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	website?: InferSelectModel<typeof websites> | null;
	onSave?: (website: InferSelectModel<typeof websites>) => void;
};

export function WebsiteDialog({
	open,
	onOpenChange,
	website,
	onSave,
}: WebsiteDialogProps) {
	const isEditing = !!website;
	const { activeOrganization } = useOrganizationsContext();
	const formRef = useRef<HTMLFormElement>(null);

	const createWebsiteMutation = useCreateWebsite();
	const updateWebsiteMutation = useUpdateWebsite();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			domain: "",
		},
	});

	useEffect(() => {
		if (website) {
			form.reset({ name: website.name || "", domain: website.domain || "" });
		} else {
			form.reset({ name: "", domain: "" });
		}
	}, [website, form]);

	const getErrorMessage = (error: unknown, isEditingMode: boolean): string => {
		const defaultMessage = `Failed to ${isEditingMode ? "update" : "create"} website.`;

		const rpcError = error as {
			data?: { code?: string };
			message?: string;
		};

		if (rpcError?.data?.code) {
			switch (rpcError.data.code) {
				case "CONFLICT":
					return "A website with this domain already exists.";
				case "FORBIDDEN":
					return (
						rpcError.message ||
						"You do not have permission to perform this action."
					);
				case "UNAUTHORIZED":
					return "You must be logged in to perform this action.";
				case "BAD_REQUEST":
					return (
						rpcError.message || "Invalid request. Please check your input."
					);
				default:
					return rpcError.message || defaultMessage;
			}
		}

		return rpcError?.message || defaultMessage;
	};

	const handleSubmit = form.handleSubmit(async (formData) => {
		const submissionData: CreateWebsiteData = {
			name: formData.name,
			domain: formData.domain,
			organizationId: activeOrganization?.id,
		};

		try {
			if (website?.id) {
				const updateData: UpdateWebsiteInput = {
					id: website.id,
					name: formData.name,
					domain: formData.domain,
				};
				const result = await updateWebsiteMutation.mutateAsync(updateData);
				if (onSave) {
					onSave(result);
				}
				toast.success("Website updated successfully!");
			} else {
				const result = await createWebsiteMutation.mutateAsync(submissionData);
				if (onSave) {
					onSave(result);
				}
				toast.success("Website created successfully!");
			}
			onOpenChange(false);
		} catch (error: unknown) {
			const message = getErrorMessage(error, !!website?.id);
			toast.error(message);
		}
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Website" : "Create a new website"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the details of your existing website."
							: "A new website to start tracking analytics."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-4" onSubmit={handleSubmit} ref={formRef}>
						<fieldset
							className="space-y-4"
							disabled={
								createWebsiteMutation.isPending ||
								updateWebsiteMutation.isPending
							}
						>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Your project's name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="domain"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Domain</FormLabel>
										<FormControl>
											<div className="flex items-center">
												<span className="inline-flex h-9 items-center rounded-l-md border border-r-0 bg-dialog px-3 text-accent-foreground text-sm">
													https://
												</span>
												<Input
													placeholder="your-company.com"
													{...field}
													className="rounded-l-none"
													onChange={(e) => {
														let domain = e.target.value.trim();
														if (
															domain.startsWith("http://") ||
															domain.startsWith("https://")
														) {
															try {
																domain = new URL(domain).hostname;
															} catch {
																// Do nothing
															}
														}
														field.onChange(domain.replace(wwwRegex, ""));
													}}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</fieldset>
					</form>
				</Form>
				<DialogFooter>
					<Button
						className="w-full"
						disabled={
							createWebsiteMutation.isPending ||
							updateWebsiteMutation.isPending ||
							!form.formState.isValid
						}
						form="form"
						onClick={handleSubmit}
						type="submit"
					>
						{(createWebsiteMutation.isPending ||
							updateWebsiteMutation.isPending) && (
							<CircleNotchIcon
								className="mr-2 size-4 animate-spin"
								weight="duotone"
							/>
						)}
						{isEditing ? "Save changes" : "Create website"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
