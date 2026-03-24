"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { markFeedbackSubmitted } from "@/components/feedback-prompt";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

	const handleSubmitAction = () => {
		if (!canSubmit) return;
		submitMutation.mutate({
			title: title.trim(),
			description: description.trim(),
			category,
		});
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" type="button">
					<PlusIcon size={16} />
					New Feedback
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Submit Feedback</DialogTitle>
					<DialogDescription>
						Help us improve and earn credits when your feedback is approved.
						More detail = more credits.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<Label htmlFor="feedback-title">Title</Label>
						<Input
							id="feedback-title"
							maxLength={200}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Dashboard charts should support dark mode"
							value={title}
						/>
					</div>

					<div className="grid gap-1.5">
						<Label htmlFor="feedback-category">Category</Label>
						<Select
							onValueChange={(v) => setCategory(v as FeedbackCategoryValue)}
							value={category}
						>
							<SelectTrigger className="w-full" id="feedback-category">
								<SelectValue placeholder="What kind of feedback?" />
							</SelectTrigger>
							<SelectContent>
								{CATEGORIES.map((cat) => (
									<SelectItem key={cat.value} value={cat.value}>
										{cat.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-1.5">
						<Label htmlFor="feedback-description">Description</Label>
						<Textarea
							className="min-h-[120px] resize-y"
							id="feedback-description"
							maxLength={5000}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe the issue or improvement in detail. Include steps to reproduce for bugs, or explain the use case for feature requests."
							value={description}
						/>
						<div className="flex items-center justify-between">
							<p className="text-muted-foreground/60 text-xs">
								{description.length < 10
									? `${10 - description.length} more characters needed`
									: ""}
							</p>
							<p className="text-muted-foreground/60 text-xs tabular-nums">
								{description.length.toLocaleString()}/5,000
							</p>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={() => setOpen(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!canSubmit}
						onClick={handleSubmitAction}
						type="button"
					>
						{submitMutation.isPending ? "Submitting..." : "Submit"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
