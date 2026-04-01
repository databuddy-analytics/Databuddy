"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const formSchema = z.object({
	title: z.string().min(1).max(100),
	slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	description: z.string().max(500).optional(),
	theme: z.enum(["light", "dark", "system"]),
	accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
	isPublished: z.boolean(),
	isPasswordProtected: z.boolean(),
	password: z.string().min(4).max(100).optional().or(z.literal("")),
	showOverallUptime: z.boolean(),
	defaultTimeRange: z.enum(["7", "30", "90"]),
});

type FormValues = z.infer<typeof formSchema>;

interface GeneralSettingsProps {
	page: {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		theme: string;
		accentColor: string | null;
		isPublished: boolean;
		isPasswordProtected: boolean;
		showOverallUptime: boolean;
		defaultTimeRange: number;
	};
	invalidateAction: () => void;
}

function Segment({
	options,
	value,
	onChangeAction,
}: {
	options: readonly { value: string; label: string }[];
	value: string;
	onChangeAction: (v: string) => void;
}) {
	return (
		<div className="flex max-w-72 rounded border">
			{options.map((opt, i) => (
				<Button
					className={clsx(
						"h-9 flex-1 cursor-pointer rounded-none border-r px-0 font-medium text-sm last:border-r-0",
						i === 0 && "rounded-l",
						i === options.length - 1 && "rounded-r",
						value === opt.value ? "bg-accent text-accent-foreground hover:bg-accent" : "hover:bg-accent/50",
					)}
					key={opt.value}
					onClick={() => onChangeAction(opt.value)}
					type="button"
					variant={value === opt.value ? "secondary" : "ghost"}
				>
					{opt.label}
				</Button>
			))}
		</div>
	);
}

function defaults(page: GeneralSettingsProps["page"]): FormValues {
	return {
		title: page.title,
		slug: page.slug,
		description: page.description ?? "",
		theme: (page.theme as FormValues["theme"]) || "system",
		accentColor: page.accentColor ?? "",
		isPublished: page.isPublished,
		isPasswordProtected: page.isPasswordProtected,
		password: "",
		showOverallUptime: page.showOverallUptime,
		defaultTimeRange: String(page.defaultTimeRange) as FormValues["defaultTimeRange"],
	};
}

export function GeneralSettings({ page, invalidateAction }: GeneralSettingsProps) {
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: defaults(page),
	});

	const updateMutation = useMutation({
		...orpc.statusPage.update.mutationOptions(),
		onSuccess: () => {
			toast.success("Status page updated");
			invalidateAction();
			form.reset(form.getValues());
		},
	});

	const handleSubmit = (values: FormValues) => {
		updateMutation.mutate({
			id: page.id,
			title: values.title,
			slug: values.slug,
			description: values.description || undefined,
			theme: values.theme,
			accentColor: values.accentColor || undefined,
			isPublished: values.isPublished,
			isPasswordProtected: values.isPasswordProtected,
			password: values.password || undefined,
			showOverallUptime: values.showOverallUptime,
			defaultTimeRange: values.defaultTimeRange,
		});
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(handleSubmit)}>
				<section className="space-y-4 border-b px-4 py-5 sm:px-6">
					<FormField
						control={form.control}
						name="title"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Title</FormLabel>
								<FormControl>
									<Input {...field} className="max-w-sm" placeholder="My Status Page" />
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
									<Input {...field} className="max-w-sm" placeholder="my-status-page" />
								</FormControl>
								<p className="text-muted-foreground text-xs">/status/{field.value || "..."}</p>
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
									<Textarea {...field} className="max-w-lg" placeholder="Status and uptime for our services" rows={2} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</section>

				<section className="space-y-4 border-b px-4 py-5 sm:px-6">
					<FormField
						control={form.control}
						name="theme"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Theme</FormLabel>
								<Segment
									onChangeAction={field.onChange}
									options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
									value={field.value}
								/>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="accentColor"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Accent Color</FormLabel>
								<div className="flex items-center gap-2">
									<input
										className="size-9 cursor-pointer rounded border bg-transparent"
										onChange={(e) => field.onChange(e.target.value)}
										type="color"
										value={field.value || "#10B981"}
									/>
									<FormControl>
										<Input {...field} className="w-28" placeholder="#10B981" />
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="defaultTimeRange"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Default Time Range</FormLabel>
								<Segment
									onChangeAction={field.onChange}
									options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]}
									value={field.value}
								/>
							</FormItem>
						)}
					/>
				</section>

				<section className="space-y-3 border-b px-4 py-5 sm:px-6">
					<FormField
						control={form.control}
						name="isPublished"
						render={({ field }) => (
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="font-medium text-sm">Published</p>
									<p className="text-muted-foreground text-sm">Make publicly accessible</p>
								</div>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</div>
						)}
					/>
					<FormField
						control={form.control}
						name="showOverallUptime"
						render={({ field }) => (
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="font-medium text-sm">Status Banner</p>
									<p className="text-muted-foreground text-sm">Show overall status at the top</p>
								</div>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</div>
						)}
					/>
					<FormField
						control={form.control}
						name="isPasswordProtected"
						render={({ field }) => (
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="font-medium text-sm">Password Protection</p>
									<p className="text-muted-foreground text-sm">Require a password to view</p>
								</div>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</div>
						)}
					/>
					{form.watch("isPasswordProtected") ? (
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Input {...field} className="max-w-sm" placeholder="New password (blank = keep current)" type="password" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}
				</section>

				<section className="px-4 py-5 sm:px-6">
					<Button className="min-w-28" disabled={updateMutation.isPending || !form.formState.isDirty} type="submit">
						{updateMutation.isPending ? "Saving..." : "Save Changes"}
					</Button>
				</section>
			</form>
		</Form>
	);
}
