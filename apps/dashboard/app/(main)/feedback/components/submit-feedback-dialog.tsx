"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { markFeedbackSubmitted } from "@/components/feedback-prompt";
import { orpc } from "@/lib/orpc";
import { CaretDownIcon, ChatTextIcon, PlusIcon } from "@databuddy/ui/icons";
import {
	Button,
	Field,
	FieldTriggerButton,
	Input,
	Text,
	Textarea,
} from "@databuddy/ui";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";

const CATEGORIES = [
	{ value: "bug_report", label: "Bug Report" },
	{ value: "feature_request", label: "Feature Request" },
	{ value: "ux_improvement", label: "UX Improvement" },
	{ value: "performance", label: "Performance" },
	{ value: "documentation", label: "Documentation" },
	{ value: "other", label: "Other" },
] as const;

type FeedbackCategoryValue = (typeof CATEGORIES)[number]["value"];

export function SubmitFeedbackDialog() {
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState<FeedbackCategoryValue | "">("");
	const queryClient = useQueryClient();

	const submitMutation = useMutation({
		...orpc.feedback.submit.mutationOptions(),
		onSuccess: () => {
			markFeedbackSubmitted();
			toast.success(
				"Feedback submitted! You'll earn credits if it's approved."
			);
			queryClient.invalidateQueries({
				queryKey: orpc.feedback.list.queryOptions({ input: {} }).queryKey,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.feedback.getCreditsBalance.queryOptions().queryKey,
			});
			setOpen(false);
			setTitle("");
			setDescription("");
			setCategory("");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to submit feedback");
		},
	});

	const canSubmit =
		title.trim().length >= 3 &&
		description.trim().length >= 10 &&
		category !== "" &&
		!submitMutation.isPending;
	const selectedCategory = CATEGORIES.find((c) => c.value === category);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) {
			return;
		}
		submitMutation.mutate({
			title: title.trim(),
			description: description.trim(),
			category,
		});
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Dialog.Trigger
				render={
					<Button size="sm">
						<PlusIcon className="size-3.5" />
						New Feedback
					</Button>
				}
			/>
			<Dialog.Content className="max-w-lg border-sidebar-border/60 bg-sidebar">
				<Dialog.Form onSubmit={handleSubmit}>
					<Dialog.Header className="border-sidebar-border/50 border-b bg-sidebar px-5 py-4">
						<div className="flex items-start gap-3">
							<div className="flex size-9 shrink-0 items-center justify-center rounded bg-sidebar-accent text-sidebar-foreground/65">
								<ChatTextIcon className="size-4" />
							</div>
							<div>
								<Dialog.Title className="text-sm">Submit feedback</Dialog.Title>
								<Dialog.Description>
									Approved submissions earn credits.
								</Dialog.Description>
							</div>
						</div>
					</Dialog.Header>
					<Dialog.Body className="space-y-4">
						<Field>
							<Field.Label>Title</Field.Label>
							<Input
								maxLength={200}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Short summary"
								value={title}
							/>
						</Field>

						<Field>
							<Field.Label>Category</Field.Label>
							<DropdownMenu>
								<DropdownMenu.Trigger
									render={
										<FieldTriggerButton
											className={category ? undefined : "text-muted-foreground"}
										>
											<span
												className={category ? "text-foreground" : undefined}
											>
												{selectedCategory?.label ?? "Select a category"}
											</span>
											<CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
										</FieldTriggerButton>
									}
								/>
								<DropdownMenu.Content
									align="start"
									className="w-(--anchor-width)"
								>
									<DropdownMenu.RadioGroup
										onValueChange={(v) =>
											setCategory(v as FeedbackCategoryValue)
										}
										value={category}
									>
										{CATEGORIES.map((cat) => (
											<DropdownMenu.RadioItem key={cat.value} value={cat.value}>
												{cat.label}
											</DropdownMenu.RadioItem>
										))}
									</DropdownMenu.RadioGroup>
								</DropdownMenu.Content>
							</DropdownMenu>
						</Field>

						<Field>
							<div className="flex items-center justify-between gap-3">
								<Field.Label>Description</Field.Label>
								<Text
									className="tabular-nums opacity-60"
									tone="muted"
									variant="caption"
								>
									{description.length.toLocaleString()}/5,000
								</Text>
							</div>
							<Textarea
								className="min-h-[150px] resize-y"
								maxLength={5000}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="What happened, what should change, and why it matters"
								value={description}
							/>
							<Text
								className="min-h-4 opacity-60"
								tone="muted"
								variant="caption"
							>
								{description.length < 10
									? `${10 - description.length} more characters needed`
									: "Ready to submit"}
							</Text>
						</Field>
					</Dialog.Body>
					<Dialog.Footer className="border-sidebar-border/50 border-t bg-sidebar-accent/35">
						<Dialog.Close>
							<Button variant="secondary">Cancel</Button>
						</Dialog.Close>
						<Button
							disabled={!canSubmit}
							loading={submitMutation.isPending}
							type="submit"
						>
							Submit feedback
						</Button>
					</Dialog.Footer>
				</Dialog.Form>
			</Dialog.Content>
		</Dialog>
	);
}
