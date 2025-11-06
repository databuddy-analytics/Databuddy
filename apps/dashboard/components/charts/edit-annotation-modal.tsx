"use client";

import {
	EyeIcon,
	EyeSlashIcon,
	NoteIcon,
	PencilIcon,
	PlusIcon,
	TagIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
	sanitizeAnnotationText,
	validateAnnotationForm,
} from "@/lib/annotation-utils";
import { cn } from "@/lib/utils";
import type { Annotation, AnnotationFormData } from "@/types/annotations";

interface EditAnnotationModalProps {
	isOpen: boolean;
	annotation: Annotation | null;
	onClose: () => void;
	onSave: (id: string, updates: AnnotationFormData) => Promise<void>;
	isSaving?: boolean;
}

export function EditAnnotationModal({
	isOpen,
	annotation,
	onClose,
	onSave,
	isSaving = false,
}: EditAnnotationModalProps) {
	const [text, setText] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customTag, setCustomTag] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(
		DEFAULT_ANNOTATION_VALUES.color
	);
	const [isPublic, setIsPublic] = useState<boolean>(
		DEFAULT_ANNOTATION_VALUES.isPublic
	);

	// Reset form when annotation changes
	useEffect(() => {
		if (annotation) {
			setText(annotation.text);
			setSelectedTags(annotation.tags || []);
			setSelectedColor(annotation.color);
			setIsPublic(annotation.isPublic);
			setCustomTag("");
		}
	}, [annotation]);

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

	const handleSave = async () => {
		if (!annotation) return;

		const formData: AnnotationFormData = {
			text: sanitizeAnnotationText(text),
			tags: selectedTags,
			color: selectedColor,
			isPublic,
		};

		const validation = validateAnnotationForm(formData);
		if (!validation.isValid) {
			// Could show validation errors to user
			console.error("Validation errors:", validation.errors);
			return;
		}

		await onSave(annotation.id, formData);
	};

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	const formatDateRange = (start: Date | string, end: Date | string | null) => {
		const startDate = new Date(start);
		const endDate = end ? new Date(end) : null;

		if (!endDate || startDate.getTime() === endDate.getTime()) {
			return formatDate(startDate);
		}
		return `${formatDate(startDate)} - ${formatDate(endDate)}`;
	};

	if (!annotation) return null;

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PencilIcon className="h-5 w-5 text-primary" />
						Edit Annotation
					</DialogTitle>
					<DialogDescription>
						Editing annotation for{" "}
						{formatDateRange(annotation.xValue, annotation.xEndValue)}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Annotation Text */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<NoteIcon className="h-4 w-4 text-primary" />
							<Label className="font-medium" htmlFor="edit-text">
								Annotation Text
							</Label>
						</div>
						<Textarea
							className="resize-none"
							disabled={isSaving}
							id="edit-text"
							maxLength={DEFAULT_ANNOTATION_VALUES.maxTextLength}
							onChange={(e) => setText(e.target.value)}
							placeholder="Describe what happened during this period..."
							rows={3}
							value={text}
						/>
						<div className="flex items-center justify-between text-muted-foreground text-xs">
							<span>Keep it concise and descriptive</span>
							<span>
								{text.length}/{DEFAULT_ANNOTATION_VALUES.maxTextLength}
							</span>
						</div>
					</div>

					{/* Tags */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<TagIcon className="h-4 w-4 text-primary" />
							<Label className="font-medium">Tags (optional)</Label>
						</div>

						{selectedTags.length > 0 && (
							<div className="mb-3 flex flex-wrap gap-2">
								{selectedTags.map((tag) => (
									<Badge
										className="cursor-pointer transition-colors hover:bg-destructive hover:text-destructive-foreground"
										key={tag}
										onClick={() => removeTag(tag)}
										variant="secondary"
									>
										{tag} ×
									</Badge>
								))}
							</div>
						)}

						<div className="space-y-3">
							<div className="flex gap-2">
								<Input
									className="flex-1"
									disabled={isSaving}
									onChange={(e) => setCustomTag(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handleCustomTagSubmit();
										}
									}}
									placeholder="Add custom tag"
									value={customTag}
								/>
								<Button
									disabled={!customTag.trim() || isSaving}
									onClick={handleCustomTagSubmit}
									size="sm"
									variant="outline"
								>
									<PlusIcon className="h-4 w-4" />
								</Button>
							</div>

							<div className="space-y-2">
								<div className="text-muted-foreground text-xs">Quick add:</div>
								<div className="flex flex-wrap gap-2">
									{COMMON_ANNOTATION_TAGS.filter(
										(tag) => !selectedTags.includes(tag.value)
									).map((tag) => (
										<button
											className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
											disabled={isSaving}
											key={tag.value}
											onClick={() => addTag(tag.value)}
											style={{ borderColor: tag.color }}
										>
											<div
												className="h-2 w-2 rounded-full"
												style={{ backgroundColor: tag.color }}
											/>
											{tag.label}
										</button>
									))}
								</div>
							</div>
						</div>
					</div>

					{/* Color Selection */}
					<div className="space-y-3">
						<Label className="font-medium">Annotation Color</Label>
						<div className="flex gap-2">
							{ANNOTATION_COLORS.map((color) => (
								<button
									className={cn(
										"h-10 w-10 rounded-full border-2 transition-all hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
										selectedColor === color.value
											? "scale-110 border-foreground shadow-lg"
											: "border-border hover:border-foreground/50"
									)}
									disabled={isSaving}
									key={color.value}
									onClick={() => setSelectedColor(color.value)}
									style={{ backgroundColor: color.value }}
									title={color.label}
								/>
							))}
						</div>
					</div>

					{/* Visibility */}
					<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
						<div className="flex items-center gap-2">
							{isPublic ? (
								<EyeIcon className="h-4 w-4 text-primary" />
							) : (
								<EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
							)}
							<div>
								<Label className="font-medium text-sm" htmlFor="edit-is-public">
									Public annotation
								</Label>
								<div className="text-muted-foreground text-xs">
									Visible to other team members
								</div>
							</div>
						</div>
						<Switch
							checked={isPublic}
							disabled={isSaving}
							id="edit-is-public"
							onCheckedChange={setIsPublic}
						/>
					</div>

					{/* Action Buttons */}
					<div className="flex gap-3 pt-2">
						<Button
							className="flex-1"
							disabled={isSaving}
							onClick={onClose}
							size="lg"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="flex-1"
							disabled={!text.trim() || isSaving}
							onClick={handleSave}
							size="lg"
						>
							{isSaving ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Saving...
								</>
							) : (
								<>
									<PencilIcon className="mr-2 h-4 w-4" />
									Save Changes
								</>
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
