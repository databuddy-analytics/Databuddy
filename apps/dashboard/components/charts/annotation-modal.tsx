"use client";

import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
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
import {
	EyeIcon,
	EyeSlashIcon,
	PlusIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Input, Textarea } from "@databuddy/ui";
import { Dialog, Switch } from "@databuddy/ui/client";

interface EditModeProps {
	annotation: Annotation;
	isOpen: boolean;
	isSubmitting?: boolean;
	mode: "edit";
	onClose: () => void;
	onSubmit: (id: string, updates: AnnotationFormData) => Promise<void>;
}

interface CreateModeProps {
	dateRange: { startDate: Date; endDate: Date };
	isOpen: boolean;
	isSubmitting?: boolean;
	mode: "create";
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
}

type AnnotationModalProps = EditModeProps | CreateModeProps;

function getInitialState(props: AnnotationModalProps) {
	if (props.mode === "edit") {
		return {
			text: props.annotation.text,
			tags: props.annotation.tags || [],
			color: props.annotation.color,
			isPublic: props.annotation.isPublic,
		};
	}
	return {
		text: "",
		tags: [] as string[],
		color: DEFAULT_ANNOTATION_VALUES.color,
		isPublic: DEFAULT_ANNOTATION_VALUES.isPublic,
	};
}

export function AnnotationModal(props: AnnotationModalProps) {
	const { isOpen, mode, onClose, isSubmitting = false } = props;

	const initial = getInitialState(props);
	const [text, setText] = useState(initial.text);
	const [selectedTags, setSelectedTags] = useState<string[]>(initial.tags);
	const [customTag, setCustomTag] = useState("");
	const [selectedColor, setSelectedColor] = useState(initial.color);
	const [isPublic, setIsPublic] = useState(initial.isPublic);
	const [submitting, setSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	useHotkeys("escape", () => isOpen && onClose(), { enabled: isOpen }, [
		isOpen,
		onClose,
	]);

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
		return dateRange.startDate.getTime() === dateRange.endDate.getTime()
			? start
			: `${start} – ${end}`;
	};

	const isCreate = mode === "create";
	const loading = submitting || isSubmitting;
	const availableTags = COMMON_ANNOTATION_TAGS.filter(
		(tag) => !selectedTags.includes(tag.value)
	).slice(0, 5);

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
			<Dialog.Content className="w-[95vw] max-w-sm sm:w-full">
				<Dialog.Header>
					<Dialog.Title>
						{isCreate ? "New Annotation" : "Edit Annotation"}
					</Dialog.Title>
					<Dialog.Description>{getDateRangeText()}</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="space-y-4">
					<div className="space-y-1.5">
						<label
							className="font-medium text-foreground text-xs"
							htmlFor="annotation-text"
						>
							Description
						</label>
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
								<span />
							)}
							<span
								className={cn(
									"text-xs tabular-nums",
									text.length > DEFAULT_ANNOTATION_VALUES.maxTextLength * 0.9
										? "text-destructive"
										: "text-muted-foreground"
								)}
							>
								{text.length}/{DEFAULT_ANNOTATION_VALUES.maxTextLength}
							</span>
						</div>
					</div>

					<div className="space-y-1.5">
						<span className="font-medium text-foreground text-xs">Tags</span>
						{selectedTags.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{selectedTags.map((tag) => (
									<Badge
										className="cursor-pointer gap-1 px-1.5 py-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
										key={tag}
										onClick={() => removeTag(tag)}
										variant="muted"
									>
										{tag}
										<XIcon className="size-2.5" />
									</Badge>
								))}
							</div>
						)}
						<div className="flex gap-1.5">
							<Input
								className="h-7 text-xs"
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
								className="size-7 shrink-0 p-0"
								disabled={!customTag.trim() || loading}
								onClick={handleCustomTagSubmit}
								variant="secondary"
							>
								<PlusIcon className="size-3" />
							</Button>
						</div>
						{availableTags.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{availableTags.map((tag) => (
									<button
										className="flex cursor-pointer items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
										disabled={loading}
										key={tag.value}
										onClick={() => addTag(tag.value)}
										type="button"
									>
										<div
											className="size-1.5 rounded-full"
											style={{ backgroundColor: tag.color }}
										/>
										{tag.label}
									</button>
								))}
							</div>
						)}
					</div>

					<div className="space-y-1.5">
						<span className="font-medium text-foreground text-xs">Color</span>
						<div className="flex gap-1.5">
							{ANNOTATION_COLORS.map((color) => (
								<button
									className={cn(
										"size-6 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50",
										selectedColor === color.value
											? "scale-110 border-foreground"
											: "border-transparent"
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

					<div className="flex items-center justify-between rounded border px-3 py-2">
						<div className="flex items-center gap-2">
							{isPublic ? (
								<EyeIcon
									className="size-3.5 text-foreground"
									weight="duotone"
								/>
							) : (
								<EyeSlashIcon
									className="size-3.5 text-muted-foreground"
									weight="duotone"
								/>
							)}
							<span className="text-foreground text-sm">Public</span>
						</div>
						<Switch
							checked={isPublic}
							disabled={loading}
							onCheckedChange={setIsPublic}
						/>
					</div>
				</Dialog.Body>

				<Dialog.Footer>
					<Button
						className="flex-1 sm:flex-none"
						disabled={loading}
						onClick={onClose}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						className="flex-1 sm:flex-none"
						disabled={!text.trim()}
						loading={loading}
						onClick={handleSubmit}
					>
						{isCreate ? "Create" : "Save"}
					</Button>
				</Dialog.Footer>
				<Dialog.Close />
			</Dialog.Content>
		</Dialog>
	);
}
