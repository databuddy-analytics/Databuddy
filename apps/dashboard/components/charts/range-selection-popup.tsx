"use client";

import {
	CalendarIcon,
	EyeIcon,
	EyeSlashIcon,
	MagnifyingGlassIcon,
	NoteIcon,
	PlusIcon,
	TagIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface RangeSelectionPopupProps {
	isOpen: boolean;
	position: { x: number; y: number };
	dateRange: {
		startDate: Date;
		endDate: Date;
	};
	onClose: () => void;
	onZoom: (dateRange: { startDate: Date; endDate: Date }) => void;
	onCreateAnnotation: (annotation: {
		annotationType: "range";
		xValue: string;
		xEndValue: string;
		text: string;
		tags: string[];
		color: string;
		isPublic: boolean;
	}) => Promise<void> | void;
}

// Using shared constants from @/lib/annotation-constants

export function RangeSelectionPopup({
	isOpen,
	position,
	dateRange,
	onClose,
	onZoom,
	onCreateAnnotation,
}: RangeSelectionPopupProps) {
	const [showAnnotationForm, setShowAnnotationForm] = useState(false);
	const [annotationText, setAnnotationText] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customTag, setCustomTag] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(
		DEFAULT_ANNOTATION_VALUES.color
	);
	const [isPublic, setIsPublic] = useState<boolean>(
		DEFAULT_ANNOTATION_VALUES.isPublic
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "Enter" && e.ctrlKey && showAnnotationForm) {
				e.preventDefault();
				handleCreateAnnotation();
			} else if (e.key === "z" && e.ctrlKey && !showAnnotationForm) {
				e.preventDefault();
				handleZoom();
			} else if (e.key === "a" && e.ctrlKey && !showAnnotationForm) {
				e.preventDefault();
				setShowAnnotationForm(true);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, showAnnotationForm]);

	const handleZoom = () => {
		onZoom(dateRange);
		onClose();
	};

	const handleCreateAnnotation = async () => {
		if (!annotationText.trim() || isSubmitting) return;

		const formData = {
			text: sanitizeAnnotationText(annotationText),
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
		setIsSubmitting(true);
		try {
			await onCreateAnnotation({
				annotationType: "range",
				xValue: dateRange.startDate.toISOString(),
				xEndValue: dateRange.endDate.toISOString(),
				...formData,
			});
			onClose();
		} catch (error) {
			// Error is handled by toast in parent
			console.error("Error creating annotation:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

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

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-foreground/5">
			<div className="mx-4 w-full max-w-md">
				<div
					aria-describedby="range-selection-description"
					aria-labelledby="range-selection-title"
					className="rounded border border-sidebar-border bg-sidebar shadow-sm"
					role="dialog"
				>
					<div className="flex items-center justify-between border-sidebar-border border-b px-4 py-3">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded bg-sidebar-accent">
								<CalendarIcon
									className="h-5 w-5 text-sidebar-ring"
									weight="duotone"
								/>
							</div>
							<div>
								<h2
									className="font-semibold text-lg text-sidebar-foreground tracking-tight"
									id="range-selection-title"
								>
									{showAnnotationForm ? "Add Annotation" : "Point Selected"}
								</h2>
								<p
									className="text-sidebar-foreground/70 text-sm"
									id="range-selection-description"
								>
									{dateRange.startDate.toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									})}
									{dateRange.startDate.getTime() !== dateRange.endDate.getTime()
										? ` - ${dateRange.endDate.toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
											})}`
										: ""}
								</p>
							</div>
						</div>
						<Button
							className="h-8 w-8 p-0 hover:bg-sidebar-accent"
							onClick={onClose}
							size="sm"
							variant="ghost"
						>
							<XIcon className="h-4 w-4" />
						</Button>
					</div>

					<div className="space-y-6 p-4">
						{showAnnotationForm ? (
							<>
								{/* Back Button */}
								<Button
									className="mb-2"
									onClick={() => setShowAnnotationForm(false)}
									size="sm"
									variant="ghost"
								>
									← Back to options
								</Button>

								{/* Annotation Form */}
								<div className="space-y-5">
									{/* Annotation Text */}
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<NoteIcon
												className="h-4 w-4 text-sidebar-ring"
												weight="duotone"
											/>
											<Label
												className="font-medium text-sidebar-foreground"
												htmlFor="annotation-text"
											>
												What happened during this period?
											</Label>
										</div>
										<Textarea
											aria-describedby="annotation-text-help annotation-text-count"
											autoFocus
											className="resize-none"
											disabled={isSubmitting}
											id="annotation-text"
											maxLength={DEFAULT_ANNOTATION_VALUES.maxTextLength}
											onChange={(e) => setAnnotationText(e.target.value)}
											placeholder="e.g., Product launch, marketing campaign, bug fix, holiday impact..."
											rows={3}
											value={annotationText}
										/>
										<div className="flex items-center justify-between text-sidebar-foreground/70 text-xs">
											<span id="annotation-text-help">
												Keep it concise and descriptive
											</span>
											<span
												className={
													annotationText.length >
													DEFAULT_ANNOTATION_VALUES.maxTextLength * 0.9
														? "text-warning"
														: ""
												}
												id="annotation-text-count"
											>
												{annotationText.length}/
												{DEFAULT_ANNOTATION_VALUES.maxTextLength}
											</span>
										</div>

										{/* Validation Errors */}
										{validationErrors.length > 0 && (
											<div className="space-y-1">
												{validationErrors.map((error, index) => (
													<div
														className="flex items-center gap-1 text-destructive text-xs"
														key={index}
													>
														<span>⚠</span>
														{error}
													</div>
												))}
											</div>
										)}
									</div>

									{/* Tags */}
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<TagIcon
												className="h-4 w-4 text-sidebar-ring"
												weight="duotone"
											/>
											<Label className="font-medium text-sidebar-foreground">
												Tags (optional)
											</Label>
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
													disabled={isSubmitting}
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
													disabled={!customTag.trim() || isSubmitting}
													onClick={handleCustomTagSubmit}
													size="sm"
													variant="outline"
												>
													<PlusIcon className="h-4 w-4" />
												</Button>
											</div>

											<div className="space-y-2">
												<div className="text-sidebar-foreground/70 text-xs">
													Quick add:
												</div>
												<div className="flex flex-wrap gap-2">
													{COMMON_ANNOTATION_TAGS.filter(
														(tag) => !selectedTags.includes(tag.value)
													).map((tag) => (
														<button
															className="flex items-center gap-1 rounded border border-sidebar-border bg-sidebar px-3 py-1 text-sidebar-foreground text-xs transition-colors hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-50"
															disabled={isSubmitting}
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
										<Label className="font-medium text-sidebar-foreground">
											Annotation Color
										</Label>
										<div className="flex gap-2">
											{ANNOTATION_COLORS.map((color) => (
												<button
													className={cn(
														"h-10 w-10 rounded-full border-2 transition-all hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
														selectedColor === color.value
															? "scale-110 border-sidebar-ring shadow-sm"
															: "border-sidebar-border hover:border-sidebar-ring/50"
													)}
													disabled={isSubmitting}
													key={color.value}
													onClick={() => setSelectedColor(color.value)}
													style={{ backgroundColor: color.value }}
													title={color.label}
												/>
											))}
										</div>
									</div>

									{/* Visibility */}
									<div className="flex items-center justify-between rounded border border-sidebar-border bg-sidebar-accent p-3">
										<div className="flex items-center gap-2">
											{isPublic ? (
												<EyeIcon
													className="h-4 w-4 text-sidebar-ring"
													weight="duotone"
												/>
											) : (
												<EyeSlashIcon
													className="h-4 w-4 text-sidebar-foreground/70"
													weight="duotone"
												/>
											)}
											<div>
												<Label
													className="font-medium text-sidebar-foreground text-sm"
													htmlFor="is-public"
												>
													Public annotation
												</Label>
												<div className="text-sidebar-foreground/70 text-xs">
													Visible to other team members
												</div>
											</div>
										</div>
										<Switch
											checked={isPublic}
											disabled={isSubmitting}
											id="is-public"
											onCheckedChange={setIsPublic}
										/>
									</div>

									{/* Action Buttons */}
									<div className="flex gap-3 pt-2">
										<Button
											className="flex-1"
											disabled={isSubmitting}
											onClick={onClose}
											size="lg"
											variant="outline"
										>
											Cancel
										</Button>
										<Button
											aria-label="Create annotation (Ctrl+Enter)"
											className="flex-1"
											disabled={!annotationText.trim() || isSubmitting}
											onClick={handleCreateAnnotation}
											size="lg"
										>
											{isSubmitting ? (
												<>
													<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
													Creating...
												</>
											) : (
												<>
													<NoteIcon className="mr-2 h-4 w-4" />
													Create Annotation
												</>
											)}
											<span className="ml-2 text-xs opacity-60">
												Ctrl+Enter
											</span>
										</Button>
									</div>
								</div>
							</>
						) : (
							<>
								{/* Action Buttons */}
								<div className="space-y-3">
									<Button
										aria-label="Zoom to range (Ctrl+Z)"
										className="flex h-auto w-full items-center justify-start gap-3 border-sidebar-border py-3 hover:bg-sidebar-accent"
										onClick={handleZoom}
										size="lg"
										variant="outline"
									>
										<div className="flex h-10 w-10 items-center justify-center rounded bg-sidebar-accent">
											<MagnifyingGlassIcon
												className="h-5 w-5 text-sidebar-ring"
												weight="duotone"
											/>
										</div>
										<div className="flex-1 text-left">
											<div className="font-semibold text-sidebar-foreground text-sm">
												Zoom to Range
											</div>
											<div className="font-normal text-sidebar-foreground/70 text-xs">
												Focus on this period for detailed analysis
											</div>
										</div>
										<div className="text-sidebar-foreground/50 text-xs">
											Ctrl+Z
										</div>
									</Button>

									<Button
										aria-label="Add annotation (Ctrl+A)"
										className="flex h-auto w-full items-center justify-start gap-3 border-sidebar-border py-3 hover:bg-sidebar-accent"
										onClick={() => setShowAnnotationForm(true)}
										size="lg"
										variant="outline"
									>
										<div className="flex h-10 w-10 items-center justify-center rounded bg-sidebar-accent">
											<NoteIcon
												className="h-5 w-5 text-sidebar-ring"
												weight="duotone"
											/>
										</div>
										<div className="flex-1 text-left">
											<div className="font-semibold text-sidebar-foreground text-sm">
												Add Annotation
											</div>
											<div className="font-normal text-sidebar-foreground/70 text-xs">
												Mark this period with a note or label
											</div>
										</div>
										<div className="text-sidebar-foreground/50 text-xs">
											Ctrl+A
										</div>
									</Button>
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
