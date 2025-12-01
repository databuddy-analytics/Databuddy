"use client";

import {
	EyeIcon,
	EyeSlashIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	ANNOTATION_COLORS,
	COMMON_ANNOTATION_TAGS,
	DEFAULT_ANNOTATION_VALUES,
} from "@/lib/annotation-constants";
import {
	formatAnnotationDateRange,
	sanitizeAnnotationText,
	validateAnnotationForm,
} from "@/lib/annotation-utils";
import { cn } from "@/lib/utils";
import type { Annotation, AnnotationFormData } from "@/types/annotations";

type EditModeProps = {
	isOpen: boolean;
	mode: "edit";
	annotation: Annotation;
	onClose: () => void;
	onSubmit: (id: string, updates: AnnotationFormData) => Promise<void>;
	isSubmitting?: boolean;
};

type CreateModeProps = {
	isOpen: boolean;
	mode: "create";
	dateRange: { startDate: Date; endDate: Date };
	onClose: () => void;
	onCreate: (annotation: {
		annotationType: "range";
		xValue: string;
		xEndValue: string;
		text: string;
		tags: string[];
		color: string;
		isPublic: boolean;
	}) => Promise<void> | void;
	isSubmitting?: boolean;
};

type AnnotationModalProps = EditModeProps | CreateModeProps;

export function AnnotationModal(props: AnnotationModalProps) {
	const { isOpen, mode, onClose, isSubmitting = false } = props;

	const [text, setText] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customTag, setCustomTag] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(
		DEFAULT_ANNOTATION_VALUES.color
	);
	const [isPublic, setIsPublic] = useState<boolean>(
		DEFAULT_ANNOTATION_VALUES.isPublic
	);
	const [submitting, setSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		if (mode === "edit") {
			const { annotation } = props as EditModeProps;
			setText(annotation.text);
			setSelectedTags(annotation.tags || []);
			setSelectedColor(annotation.color);
			setIsPublic(annotation.isPublic);
		} else {
			setText("");
			setSelectedTags([]);
			setSelectedColor(DEFAULT_ANNOTATION_VALUES.color);
			setIsPublic(DEFAULT_ANNOTATION_VALUES.isPublic);
		}
		setCustomTag("");
		setValidationErrors([]);
	}, [isOpen, mode]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleSubmit();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, text]);

	const addTag = (tag: string) => {
		if (tag && !selectedTags.includes(tag)) {
			setSelectedTags([...selectedTags, tag]);
		}
	};

	const removeTag = (tag: string) => {
		setSelectedTags(selectedTags.filter((t) => t !== tag));
	};

	const handleCustomTagSubmit = () => {
		if (customTag.trim()) {
			addTag(customTag.trim());
			setCustomTag("");
		}
	};

	const handleSubmit = async () => {
		if (!text.trim() || submitting || isSubmitting) {
			return;
		}

		const formData = {
			text: sanitizeAnnotationText(text),
			tags: selectedTags,
			color: selectedColor,
			isPublic,
		};

		const validation = validateAnnotationForm(formData);
		if (!validation.isValid) {
			setValidationErrors(validation.errors);
			return;
		}

		setValidationErrors([]);
		setSubmitting(true);

		try {
			if (mode === "edit") {
				const { annotation, onSubmit } = props as EditModeProps;
				await onSubmit(annotation.id, formData);
			} else {
				const { dateRange, onCreate } = props as CreateModeProps;
				await onCreate({
					annotationType: "range",
					xValue: dateRange.startDate.toISOString(),
					xEndValue: dateRange.endDate.toISOString(),
					...formData,
				});
			}
			onClose();
		} catch (error) {
			console.error("Error submitting annotation:", error);
		} finally {
			setSubmitting(false);
		}
	};

	const getDateRangeText = () => {
		if (mode === "edit") {
			const { annotation } = props as EditModeProps;
			return formatAnnotationDateRange(
				annotation.xValue,
				annotation.xEndValue,
				"daily"
			);
		}
		const { dateRange } = props as CreateModeProps;
		const start = dateRange.startDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		const end = dateRange.endDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		return dateRange.startDate.getTime() !== dateRange.endDate.getTime()
			? `${start} – ${end}`
			: start;
	};

	const isCreate = mode === "create";
	const loading = submitting || isSubmitting;

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
			<DialogContent className="w-[95vw] max-w-sm sm:w-full">
				<DialogHeader>
					<DialogTitle>
						{isCreate ? "New Annotation" : "Edit Annotation"}
					</DialogTitle>
					<DialogDescription>{getDateRangeText()}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Description */}
					<div className="space-y-2">
						<Label
							className="text-muted-foreground text-xs"
							htmlFor="annotation-text"
						>
							Description
						</Label>
						<Textarea
							autoFocus
							className="resize-none text-sm"
							disabled={loading}
							id="annotation-text"
							maxLength={DEFAULT_ANNOTATION_VALUES.maxTextLength}
							onChange={(e) => setText(e.target.value)}
							placeholder="What happened during this period?"
							rows={2}
							value={text}
						/>
						<div className="flex items-center justify-between">
							{validationErrors.length > 0 ? (
								<span className="text-destructive text-xs">
									{validationErrors[0]}
								</span>
							) : (
								<span className="text-muted-foreground text-xs">
									Keep it concise
								</span>
							)}
							<span
								className={cn(
									"text-xs tabular-nums",
									text.length > DEFAULT_ANNOTATION_VALUES.maxTextLength * 0.9
										? "text-warning"
										: "text-muted-foreground"
								)}
							>
								{text.length}/{DEFAULT_ANNOTATION_VALUES.maxTextLength}
							</span>
						</div>
					</div>

					{/* Tags */}
					<div className="space-y-2">
						<Label className="text-muted-foreground text-xs">Tags</Label>
						{selectedTags.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{selectedTags.map((tag) => (
									<Badge
										className="cursor-pointer gap-1 px-2 py-0.5 text-xs transition-colors hover:bg-destructive hover:text-destructive-foreground"
										key={tag}
										onClick={() => removeTag(tag)}
										variant="secondary"
									>
										{tag}
										<XIcon className="size-2.5" />
									</Badge>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<Input
								className="h-8 text-sm"
								disabled={loading}
								onChange={(e) => setCustomTag(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleCustomTagSubmit();
									}
								}}
								placeholder="Add tag…"
								value={customTag}
							/>
							<Button
								className="size-8 shrink-0"
								disabled={!customTag.trim() || loading}
								onClick={handleCustomTagSubmit}
								size="icon"
								variant="outline"
							>
								<PlusIcon className="size-3.5" />
							</Button>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{COMMON_ANNOTATION_TAGS.filter(
								(tag) => !selectedTags.includes(tag.value)
							)
								.slice(0, 5)
								.map((tag) => (
									<button
										className="flex cursor-pointer items-center gap-1.5 rounded border bg-background px-2 py-1 text-muted-foreground text-xs transition-all hover:border-primary hover:bg-accent hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
										disabled={loading}
										key={tag.value}
										onClick={() => addTag(tag.value)}
										type="button"
									>
										<div
											className="size-2 rounded-full"
											style={{ backgroundColor: tag.color }}
										/>
										{tag.label}
									</button>
								))}
						</div>
					</div>

					{/* Color */}
					<div className="space-y-2">
						<Label className="text-muted-foreground text-xs">Color</Label>
						<div className="flex gap-2">
							{ANNOTATION_COLORS.map((color) => (
								<button
									className={cn(
										"size-7 cursor-pointer rounded-full border-2 shadow-sm transition-all hover:scale-110 hover:shadow-md active:scale-100 disabled:cursor-not-allowed disabled:opacity-50",
										selectedColor === color.value
											? "scale-110 border-foreground ring-2 ring-ring"
											: "border-transparent hover:border-muted-foreground"
									)}
									disabled={loading}
									key={color.value}
									onClick={() => setSelectedColor(color.value)}
									style={{ backgroundColor: color.value }}
									title={color.label}
									type="button"
								/>
							))}
						</div>
					</div>

					{/* Visibility */}
					<div className="flex items-center justify-between rounded border bg-accent px-3 py-2.5">
						<div className="flex items-center gap-2">
							{isPublic ? (
								<EyeIcon className="size-4 text-primary" weight="duotone" />
							) : (
								<EyeSlashIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							)}
							<div>
								<span className="font-medium text-foreground text-sm">
									Public
								</span>
								<span className="ml-1.5 text-muted-foreground text-xs">
									Visible to team
								</span>
							</div>
						</div>
						<Switch
							checked={isPublic}
							disabled={loading}
							onCheckedChange={setIsPublic}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						className="flex-1 sm:flex-none"
						disabled={loading}
						onClick={onClose}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						className="flex-1 sm:flex-none"
						disabled={!text.trim() || loading}
						onClick={handleSubmit}
					>
						{loading && (
							<div className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
						)}
						{isCreate ? "Create annotation" : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
