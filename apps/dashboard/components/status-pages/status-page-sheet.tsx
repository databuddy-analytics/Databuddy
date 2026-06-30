"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import {
	Button,
	Divider,
	Field,
	Input,
	SegmentedControl,
	Textarea,
} from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

const URL_REGEX = /^https?:\/\/.+/;

const statusPageFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	slug: z
		.string()
		.min(1, "Slug is required")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug must only contain lowercase letters, numbers, and dashes"
		),
	description: z.string().optional(),
	logoUrl: z
		.string()
		.refine((v) => v === "" || URL_REGEX.test(v), "Must be a valid URL"),
	faviconUrl: z
		.string()
		.refine((v) => v === "" || URL_REGEX.test(v), "Must be a valid URL"),
	websiteUrl: z
		.string()
		.refine((v) => v === "" || URL_REGEX.test(v), "Must be a valid URL"),
	supportUrl: z
		.string()
		.refine((v) => v === "" || URL_REGEX.test(v), "Must be a valid URL"),
	theme: z.enum(["system", "light", "dark"]),
});

type StatusPageFormData = z.infer<typeof statusPageFormSchema>;

const themeOptions = [
	{ value: "system" as const, label: "System" },
	{ value: "light" as const, label: "Light" },
	{ value: "dark" as const, label: "Dark" },
];

interface StatusPageSheetProps {
	onCloseAction: (open: boolean) => void;
	onSaveAction?: () => void;
	open: boolean;
	statusPage?: {
		description?: string | null;
		faviconUrl?: string | null;
		id: string;
		logoUrl?: string | null;
		name: string;
		slug: string;
		supportUrl?: string | null;
		theme?: string | null;
		websiteUrl?: string | null;
	} | null;
}

export function StatusPageSheet({
	open,
	onCloseAction,
	onSaveAction,
	statusPage,
}: StatusPageSheetProps) {
	const isEditing = !!statusPage;
	const { activeOrganizationId, activeOrganization } =
		useOrganizationsContext();

	const form = useForm<StatusPageFormData>({
		resolver: zodResolver(statusPageFormSchema),
		defaultValues: buildDefaults(statusPage),
	});

	const createMutation = useMutation({
		...orpc.statusPage.create.mutationOptions(),
	});
	const updateMutation = useMutation({
		...orpc.statusPage.update.mutationOptions(),
	});

	const handleSubmit = async () => {
		const data = form.getValues();
		const urlOrNull = (v: string | undefined) =>
			v && v.trim() !== "" ? v : null;

		try {
			if (isEditing && statusPage) {
				await updateMutation.mutateAsync({
					statusPageId: statusPage.id,
					name: data.name,
					slug: data.slug,
					description: data.description,
					logoUrl: urlOrNull(data.logoUrl),
					faviconUrl: urlOrNull(data.faviconUrl),
					websiteUrl: urlOrNull(data.websiteUrl),
					supportUrl: urlOrNull(data.supportUrl),
					theme: data.theme,
				});
				toast.success("Status page updated");
			} else {
				const resolvedOrganizationId =
					activeOrganization?.id ?? activeOrganizationId ?? null;

				if (!resolvedOrganizationId) {
					toast.error("No active organization selected");
					return;
				}

				await createMutation.mutateAsync({
					organizationId: resolvedOrganizationId,
					name: data.name,
					slug: data.slug,
					description: data.description,
					logoUrl: urlOrNull(data.logoUrl),
					faviconUrl: urlOrNull(data.faviconUrl),
					websiteUrl: urlOrNull(data.websiteUrl),
					supportUrl: urlOrNull(data.supportUrl),
					theme: data.theme,
				});
				toast.success("Status page created");
			}
			onSaveAction?.();
			onCloseAction(false);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to save status page";
			toast.error(errorMessage);
		}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={onCloseAction} open={open}>
			<Sheet.Content className="w-full sm:max-w-md">
				<Sheet.Close />
				<Sheet.Header>
					<Sheet.Title>
						{isEditing ? "Edit Status Page" : "Create Status Page"}
					</Sheet.Title>
					<Sheet.Description>
						{isEditing
							? "Update your status page details and appearance"
							: "Set up a new public status page"}
					</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex flex-1 flex-col overflow-hidden"
					onSubmit={form.handleSubmit(handleSubmit)}
				>
					<Sheet.Body className="space-y-5">
						<div className="space-y-4">
							<Controller
								control={form.control}
								name="name"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Name</Field.Label>
										<Input placeholder="e.g. Acme Systems" {...field} />
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="slug"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Slug</Field.Label>
										<Input placeholder="e.g. acme-systems" {...field} />
										<Field.Description>
											URL path for your status page
										</Field.Description>
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
										<Field.Label>Description</Field.Label>
										<Textarea
											placeholder="e.g. Real-time status for our core services."
											{...field}
										/>
									</Field>
								)}
							/>
						</div>

						<Divider />

						<div className="space-y-4">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Branding</p>
								<p className="text-muted-foreground text-xs">
									Customize how your status page looks to visitors
								</p>
							</div>

							<Controller
								control={form.control}
								name="logoUrl"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Logo URL</Field.Label>
										<Input
											placeholder="https://example.com/logo.svg"
											{...field}
										/>
										<Field.Description>
											Displayed in the navbar and page header
										</Field.Description>
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="faviconUrl"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Favicon URL</Field.Label>
										<Input
											placeholder="https://example.com/favicon.ico"
											{...field}
										/>
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="websiteUrl"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Website URL</Field.Label>
										<Input placeholder="https://example.com" {...field} />
										<Field.Description>
											Logo and name link to this URL
										</Field.Description>
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="supportUrl"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Support URL</Field.Label>
										<Input
											placeholder="https://example.com/support"
											{...field}
										/>
										<Field.Description>
											Shown as a "Get Support" link in the navbar
										</Field.Description>
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>
						</div>

						<Divider />

						<div className="space-y-4">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Appearance</p>
								<p className="text-muted-foreground text-xs">
									Choose how the public page follows visitor preferences
								</p>
							</div>

							<Controller
								control={form.control}
								name="theme"
								render={({ field }) => (
									<Field>
										<Field.Label>Theme</Field.Label>
										<SegmentedControl
											className="w-full"
											onChange={field.onChange}
											options={themeOptions}
											value={field.value}
										/>
									</Field>
								)}
							/>
						</div>
					</Sheet.Body>

					<Sheet.Footer>
						<Button
							onClick={() => onCloseAction(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							className="min-w-28"
							disabled={!form.formState.isValid}
							loading={isPending}
							type="submit"
						>
							{isEditing ? "Update" : "Create"}
						</Button>
					</Sheet.Footer>
				</form>
			</Sheet.Content>
		</Sheet>
	);
}

function buildDefaults(
	sp: StatusPageSheetProps["statusPage"]
): StatusPageFormData {
	return {
		name: sp?.name ?? "",
		slug: sp?.slug ?? "",
		description: sp?.description ?? "",
		logoUrl: sp?.logoUrl ?? "",
		faviconUrl: sp?.faviconUrl ?? "",
		websiteUrl: sp?.websiteUrl ?? "",
		supportUrl: sp?.supportUrl ?? "",
		theme: (sp?.theme as "system" | "light" | "dark") ?? "system",
	};
}
