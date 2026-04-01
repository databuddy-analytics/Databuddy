"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
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
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const formSchema = z.object({
	title: z.string().min(1, "Title is required").max(100),
	slug: z
		.string()
		.min(1, "Slug is required")
		.max(100)
		.regex(
			/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
			"Slug must be lowercase with hyphens only"
		),
	description: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateStatusPageSheetProps {
	open: boolean;
	onCloseAction: () => void;
	onSaveAction: () => void;
}

export function CreateStatusPageSheet({
	open,
	onCloseAction,
	onSaveAction,
}: CreateStatusPageSheetProps) {
	const router = useRouter();
	const slugManuallyEditedRef = useRef(false);

	const form = useForm<FormValues>({
		mode: "onTouched",
		resolver: zodResolver(formSchema),
		defaultValues: {
			title: "",
			slug: "",
			description: "",
		},
	});

	useEffect(() => {
		if (open) {
			slugManuallyEditedRef.current = false;
			form.reset({
				title: "",
				slug: "",
				description: "",
			});
		}
	}, [open, form]);

	const createMutation = useMutation({
		...orpc.statusPage.create.mutationOptions(),
	});

	const handleSubmit = async (values: FormValues) => {
		const result = await createMutation.mutateAsync({
			title: values.title,
			slug: values.slug,
			description: values.description || undefined,
		});

		onSaveAction();
		onCloseAction();
		router.push(`/monitors/status-pages/${result.id}`);
	};

	const handleTitleChange = (title: string) => {
		const prevTitle = form.getValues("title");
		const prevSlugified = slugify(prevTitle);
		const currentSlug = form.getValues("slug");
		const shouldSyncSlug =
			!slugManuallyEditedRef.current &&
			(!currentSlug || currentSlug === prevSlugified);
		form.setValue("title", title);
		if (shouldSyncSlug) {
			form.setValue("slug", slugify(title));
		}
	};

	return (
		<Sheet onOpenChange={() => onCloseAction()} open={open}>
			<SheetContent className="w-full sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Create Status Page</SheetTitle>
					<SheetDescription>
						Set up a new public status page for your monitors
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-4">
							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Title</FormLabel>
										<FormControl>
											<Input
												{...field}
												onChange={(e) => handleTitleChange(e.target.value)}
												placeholder="My Status Page"
											/>
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
											<Input
												{...field}
												onChange={(e) => {
													slugManuallyEditedRef.current = true;
													field.onChange(e);
												}}
												placeholder="my-status-page"
											/>
										</FormControl>
										<p className="text-muted-foreground text-xs">
											Your page will be available at /status/
											{field.value || "..."}
										</p>
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
												{...field}
												placeholder="Status and uptime for our services"
												rows={3}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction()}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={createMutation.isPending || !form.formState.isValid}
								type="submit"
							>
								{createMutation.isPending ? "Creating..." : "Create"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
