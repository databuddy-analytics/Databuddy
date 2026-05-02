"use client";

import type { WebsiteOutput } from "@databuddy/rpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	useCreateWebsite,
	useUpdateWebsite,
	type Website,
} from "@/hooks/use-websites";
import { Button, Field, Input } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

interface UpdateWebsiteInput {
	domain?: string;
	id: string;
	isPublic?: boolean;
	name: string;
}

interface CreateWebsiteData {
	domain: string;
	name: string;
	organizationId?: string;
	subdomain?: string;
}

const domainRegex =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const wwwRegex = /^www\./;

const formSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.regex(/^[a-zA-Z0-9\s\-_]+$/, "Use alphanumeric, spaces, -, _"),
	domain: z
		.string()
		.min(1, "Domain is required")
		.regex(domainRegex, "Invalid domain format"),
});

type FormData = z.infer<typeof formSchema>;
interface WebsiteDialogProps {
	onOpenChange: (open: boolean) => void;
	onSave?: (website: Website) => void;
	open: boolean;
	website?: Website | WebsiteOutput | null;
}

export type { CreateWebsiteData, WebsiteDialogProps };

export function WebsiteDialog({
	open,
	onOpenChange,
	website,
	onSave,
}: WebsiteDialogProps) {
	const isEditing = !!website;
	const { activeOrganization } = useOrganizationsContext();

	const createWebsiteMutation = useCreateWebsite();
	const updateWebsiteMutation = useUpdateWebsite();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		mode: "onChange",
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

	const handleSubmit: SubmitHandler<FormData> = async (formData) => {
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
	};

	const isPending =
		createWebsiteMutation.isPending || updateWebsiteMutation.isPending;

	const { isValid, isDirty } = form.formState;
	const isSubmitDisabled = !(isValid && isDirty);

	const nameError = form.formState.errors.name?.message;
	const domainError = form.formState.errors.domain?.message;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<Dialog.Content>
				<Dialog.Form onSubmit={form.handleSubmit(handleSubmit)}>
					<Dialog.Header>
						<Dialog.Title>
							{isEditing ? "Edit Website" : "Create a new website"}
						</Dialog.Title>
						<Dialog.Description>
							{isEditing
								? "Update the details of your existing website."
								: "A new website to start tracking analytics."}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						<fieldset className="space-y-4" disabled={isPending}>
							<Field error={!!nameError}>
								<Field.Label>Name</Field.Label>
								<Input
									placeholder="Your website's name"
									{...form.register("name")}
								/>
								{nameError && <Field.Error>{nameError}</Field.Error>}
							</Field>

							<Field error={!!domainError}>
								<Field.Label>Domain</Field.Label>
								<Input
									placeholder="your-company.com"
									prefix="https://"
									{...form.register("domain", {
										onChange: (e) => {
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
											form.setValue("domain", domain.replace(wwwRegex, ""), {
												shouldValidate: true,
											});
										},
									})}
								/>
								{domainError && <Field.Error>{domainError}</Field.Error>}
							</Field>
						</fieldset>
					</Dialog.Body>
					<Dialog.Footer>
						<Button
							disabled={isPending}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={isSubmitDisabled}
							loading={isPending}
							type="submit"
						>
							{isEditing ? "Save changes" : "Create website"}
						</Button>
					</Dialog.Footer>
				</Dialog.Form>
				<Dialog.Close />
			</Dialog.Content>
		</Dialog>
	);
}
