"use client";

import { CaretDownIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { markFeedbackSubmitted } from "@/components/feedback-prompt";
import { Button } from "@/components/ds/button";
import { FieldTriggerButton } from "@/components/ds/control-shell";
import { Dialog } from "@/components/ds/dialog";
import { DropdownMenu } from "@/components/ds/dropdown-menu";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { Textarea } from "@/components/ds/textarea";
import { Text } from "@/components/ds/text";
import { orpc } from "@/lib/orpc";

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
				queryKey: orpc.feedback.list.queryOptions({}).queryKey,
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
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Submit Feedback</Dialog.Title>
					<Dialog.Description>
						Help us improve and earn credits when your feedback is approved.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body className="space-y-4">
					<Field>
						<Field.Label>Title</Field.Label>
						<Input
							maxLength={200}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Dashboard charts should support dark mode"
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
										<span className={category ? "text-foreground" : undefined}>
											{category
												? CATEGORIES.find((c) => c.value === category)?.label
												: "Select a category"}
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
									onValueChange={(v) => setCategory(v as FeedbackCategoryValue)}
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
						<Field.Label>Description</Field.Label>
						<Textarea
							className="min-h-[120px] resize-y"
							maxLength={5000}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe the issue or improvement in detail…"
							value={description}
						/>
						<div className="flex items-center justify-between">
							<Text className="opacity-60" tone="muted" variant="caption">
								{description.length < 10
									? `${10 - description.length} more characters needed`
									: ""}
							</Text>
							<Text
								className="tabular-nums opacity-60"
								tone="muted"
								variant="caption"
							>
								{description.length.toLocaleString()}/5,000
							</Text>
						</div>
					</Field>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Close>
						<Button variant="secondary">Cancel</Button>
					</Dialog.Close>
					<Button
						disabled={!canSubmit}
						loading={submitMutation.isPending}
						onClick={() => {
							if (canSubmit) {
								submitMutation.mutate({
									title: title.trim(),
									description: description.trim(),
									category,
								});
							}
						}}
					>
						Submit
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}
