"use client";

import { track } from "@databuddy/sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { GlobeIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
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
import { useCreateWebsite } from "@/hooks/use-websites";

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

	const handleSubmit = async (formData: FormData) => {
		try {
			const result = await createWebsiteMutation.mutateAsync({
				name: formData.name,
				domain: formData.domain,
				organizationId: activeOrganization?.id,
			});
			toast.success("Website created!");
			try {
				track("onboarding_website_created");
			} catch {}
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
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded bg-primary/10">
					<GlobeIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">
						Add your website
					</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Enter your website details to start collecting analytics data.
					</p>
				</div>
			</div>

			<Form {...form}>
				<form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Website name</FormLabel>
								<FormControl>
									<Input placeholder="My Project" {...field} />
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
										<span className="inline-flex h-9 items-center rounded-r-none border border-r-0 bg-accent px-3 text-muted-foreground text-sm">
											https://
										</span>
										<Input
											className="rounded-l-none border-l-0"
											placeholder="your-company.com"
											{...field}
											onChange={(e) => {
												let domain = e.target.value.trim();
												if (
													domain.startsWith("http://") ||
													domain.startsWith("https://")
												) {
													try {
														domain = new URL(domain).hostname;
													} catch {
														// keep as-is
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
					<Button
						className="w-full"
						disabled={!(isValid && isDirty) || createWebsiteMutation.isPending}
						type="submit"
					>
						{createWebsiteMutation.isPending ? (
							<>
								<SpinnerIcon className="mr-2 size-4 animate-spin" />
								Creating...
							</>
						) : (
							"Create website"
						)}
					</Button>
				</form>
			</Form>
		</div>
	);
}
