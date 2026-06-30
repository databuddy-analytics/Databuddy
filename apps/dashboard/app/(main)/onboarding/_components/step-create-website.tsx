"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useCreateWebsite } from "@/hooks/use-websites";
import { APP_EVENTS, trackAppEvent } from "@/lib/app-events";
import { GlobeIcon } from "@databuddy/ui/icons";
import { Button, Field, Input } from "@databuddy/ui";

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

interface StepCreateWebsiteProps {
	onComplete: (websiteId: string) => void;
}

export function StepCreateWebsite({ onComplete }: StepCreateWebsiteProps) {
	const { activeOrganization } = useOrganizationsContext();
	const createWebsiteMutation = useCreateWebsite();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			domain: "",
		},
	});

	const nameField = useController({
		control: form.control,
		name: "name",
	});
	const domainField = useController({
		control: form.control,
		name: "domain",
	});

	const handleSubmit = async (formData: FormData) => {
		try {
			const result = await createWebsiteMutation.mutateAsync({
				name: formData.name,
				domain: formData.domain,
				organizationId: activeOrganization?.id,
			});
			toast.success("Website created!");
			trackAppEvent(APP_EVENTS.onboardingWebsiteCreated);
			onComplete(result.id);
		} catch (error: unknown) {
			const rpcError = error as {
				data?: { code?: string };
				message?: string;
			};
			if (rpcError?.data?.code === "CONFLICT") {
				toast.error("A website with this domain already exists.");
			} else {
				toast.error(rpcError?.message || "Failed to create website.");
			}
		}
	};

	const { isValid, isDirty } = form.formState;

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<GlobeIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">
						Add your website
					</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Use the production domain you want Databuddy to associate with this
						organization.
					</p>
				</div>
			</div>

			<form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
				<Field error={!!nameField.fieldState.error}>
					<Field.Label>Website name</Field.Label>
					<Input placeholder="My Website" {...nameField.field} />
					<Field.Description>
						This is the label your team will see throughout the dashboard.
					</Field.Description>
					{nameField.fieldState.error ? (
						<Field.Error>{nameField.fieldState.error.message}</Field.Error>
					) : null}
				</Field>

				<Field error={!!domainField.fieldState.error}>
					<Field.Label>Domain</Field.Label>
					<Input
						autoCapitalize="none"
						autoCorrect="off"
						inputMode="url"
						placeholder="your-company.com"
						prefix="https://"
						{...domainField.field}
						onChange={(event) => {
							let domain = event.target.value.trim();
							if (
								domain.startsWith("http://") ||
								domain.startsWith("https://")
							) {
								try {
									domain = new URL(domain).hostname;
								} catch {
									// Keep the raw value so the user can fix it.
								}
							}
							domainField.field.onChange(domain.replace(wwwRegex, ""));
						}}
					/>
					<Field.Description>
						We use this to validate installs and route you into the right
						organization.
					</Field.Description>
					{domainField.fieldState.error ? (
						<Field.Error>{domainField.fieldState.error.message}</Field.Error>
					) : null}
				</Field>

				<Button
					className="w-full sm:w-auto"
					disabled={!(isValid && isDirty)}
					loading={createWebsiteMutation.isPending}
					type="submit"
				>
					{createWebsiteMutation.isPending ? "Creating..." : "Create website"}
				</Button>
			</form>
		</div>
	);
}
