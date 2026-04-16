"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
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
import { Label } from "@/components/ui/label";
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
import { orpc } from "@/lib/orpc";

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
	hideBranding: z.boolean(),
	customCss: z.string().optional(),
});

type StatusPageFormData = z.infer<typeof statusPageFormSchema>;

interface StatusPageSheetProps {
	onCloseAction: (open: boolean) => void;
	onSaveAction?: () => void;
	open: boolean;
	statusPage?: {
		id: string;
		name: string;
		slug: string;
		description?: string | null;
		logoUrl?: string | null;
		faviconUrl?: string | null;
		websiteUrl?: string | null;
		supportUrl?: string | null;
		theme?: string | null;
		hideBranding?: boolean;
		customCss?: string | null;
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
					hideBranding: data.hideBranding,
					customCss: data.customCss?.trim() || null,
				});
				toast.success("Status page updated successfully");
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
					hideBranding: data.hideBranding,
					customCss: data.customCss?.trim() || null,
				});
				toast.success("Status page created successfully");
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
			<SheetContent className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>
						{isEditing ? "Edit Status Page" : "Create Status Page"}
					</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update your status page details and appearance"
							: "Set up a new public status page"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-6">
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="e.g. Acme Systems" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="slug"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Slug</FormLabel>
											<FormControl>
												<Input placeholder="e.g. acme-systems" {...field} />
											</FormControl>
											<FormDescription>
												This will be the URL path for your status page.
											</FormDescription>
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
													placeholder="e.g. Real-time status for our core services."
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="space-y-1">
								<h3 className="font-medium text-sm">Branding</h3>
								<p className="text-muted-foreground text-xs">
									Customize how your status page looks to visitors.
								</p>
							</div>

							<div className="space-y-4">
								<FormField
									control={form.control}
									name="logoUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Logo URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://example.com/logo.svg"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Displayed in the navbar and page header.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="faviconUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Favicon URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://example.com/favicon.ico"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="websiteUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Website URL</FormLabel>
											<FormControl>
												<Input placeholder="https://example.com" {...field} />
											</FormControl>
											<FormDescription>
												Logo and name link to this URL.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="supportUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Support URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://example.com/support"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Shown as a "Get Support" link in the navbar.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="space-y-1">
								<h3 className="font-medium text-sm">Appearance</h3>
								<p className="text-muted-foreground text-xs">
									Theme, branding, and custom styles.
								</p>
							</div>

							<div className="space-y-4">
								<FormField
									control={form.control}
									name="theme"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Theme</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="system">
														System (follow visitor preference)
													</SelectItem>
													<SelectItem value="light">Always light</SelectItem>
													<SelectItem value="dark">Always dark</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="hideBranding"
									render={({ field }) => (
										<div className="flex items-center justify-between rounded border p-3">
											<Label
												className="cursor-pointer text-sm"
												htmlFor="hide-branding"
											>
												Hide "Powered by Databuddy"
											</Label>
											<Switch
												checked={field.value}
												id="hide-branding"
												onCheckedChange={field.onChange}
											/>
										</div>
									)}
								/>

								<FormField
									control={form.control}
									name="customCss"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Custom CSS</FormLabel>
											<FormControl>
												<Textarea
													className="font-mono text-xs"
													placeholder={":root {\n  --primary: #3b82f6;\n}"}
													rows={4}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Injected into the public status page. Use CSS variables
												for colors and fonts.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction(false)}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={isPending || !form.formState.isValid}
								type="submit"
							>
								{isPending ? "Saving..." : isEditing ? "Update" : "Create"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
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
		hideBranding: sp?.hideBranding ?? false,
		customCss: sp?.customCss ?? "",
	};
}
