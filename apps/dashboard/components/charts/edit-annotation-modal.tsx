'use client';

import {
	NoteIcon,
	PencilIcon,
	PlusIcon,
	TagIcon,
	EyeIcon,
	EyeSlashIcon,
} from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Annotation, AnnotationFormData } from '@/types/annotations';
import { ANNOTATION_COLORS, COMMON_ANNOTATION_TAGS, DEFAULT_ANNOTATION_VALUES } from '@/lib/annotation-constants';
import { validateAnnotationForm, sanitizeAnnotationText } from '@/lib/annotation-utils';

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
	const [text, setText] = useState('');
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customTag, setCustomTag] = useState('');
	const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_ANNOTATION_VALUES.color);
	const [isPublic, setIsPublic] = useState<boolean>(DEFAULT_ANNOTATION_VALUES.isPublic);

	// Reset form when annotation changes
	useEffect(() => {
		if (annotation) {
			setText(annotation.text);
			setSelectedTags(annotation.tags || []);
			setSelectedColor(annotation.color);
			setIsPublic(annotation.isPublic);
			setCustomTag('');
		}
	}, [annotation]);

	const addTag = (tag: string) => {
		if (tag && !selectedTags.includes(tag)) {
			setSelectedTags([...selectedTags, tag]);
		}
	};

	const removeTag = (tag: string) => {
		setSelectedTags(selectedTags.filter(t => t !== tag));
	};

	const handleCustomTagSubmit = () => {
		if (customTag.trim()) {
			addTag(customTag.trim());
			setCustomTag('');
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
			console.error('Validation errors:', validation.errors);
			return;
		}

		await onSave(annotation.id, formData);
	};

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	};

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
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PencilIcon className="h-5 w-5 text-primary" />
						Edit Annotation
					</DialogTitle>
					<DialogDescription>
						Editing annotation for {formatDateRange(annotation.xValue, annotation.xEndValue)}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Annotation Text */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<NoteIcon className="h-4 w-4 text-primary" />
							<Label htmlFor="edit-text" className="font-medium">Annotation Text</Label>
						</div>
						<Textarea
							id="edit-text"
							placeholder="Describe what happened during this period..."
							value={text}
							onChange={(e) => setText(e.target.value)}
							rows={3}
							maxLength={DEFAULT_ANNOTATION_VALUES.maxTextLength}
							className="resize-none"
							disabled={isSaving}
						/>
						<div className="flex justify-between items-center text-xs text-muted-foreground">
							<span>Keep it concise and descriptive</span>
							<span>{text.length}/{DEFAULT_ANNOTATION_VALUES.maxTextLength}</span>
						</div>
					</div>

					{/* Tags */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<TagIcon className="h-4 w-4 text-primary" />
							<Label className="font-medium">Tags (optional)</Label>
						</div>
						
						{selectedTags.length > 0 && (
							<div className="flex flex-wrap gap-2 mb-3">
								{selectedTags.map((tag) => (
									<Badge
										key={tag}
										variant="secondary"
										className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
										onClick={() => removeTag(tag)}
									>
										{tag} ×
									</Badge>
								))}
							</div>
						)}

						<div className="space-y-3">
							<div className="flex gap-2">
								<Input
									placeholder="Add custom tag"
									value={customTag}
									onChange={(e) => setCustomTag(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											handleCustomTagSubmit();
										}
									}}
									className="flex-1"
									disabled={isSaving}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={handleCustomTagSubmit}
									disabled={!customTag.trim() || isSaving}
								>
									<PlusIcon className="h-4 w-4" />
								</Button>
							</div>
							
							<div className="space-y-2">
								<div className="text-xs text-muted-foreground">Quick add:</div>
							<div className="flex flex-wrap gap-2">
								{COMMON_ANNOTATION_TAGS.filter(tag => !selectedTags.includes(tag.value)).map((tag) => (
										<button
											key={tag.value}
											onClick={() => addTag(tag.value)}
											className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											style={{ borderColor: tag.color }}
											disabled={isSaving}
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
									key={color.value}
									className={cn(
										"w-10 h-10 rounded-full border-2 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
										selectedColor === color.value
											? "border-foreground scale-110 shadow-lg"
											: "border-border hover:border-foreground/50"
									)}
									style={{ backgroundColor: color.value }}
									onClick={() => setSelectedColor(color.value)}
									title={color.label}
									disabled={isSaving}
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
								<Label htmlFor="edit-is-public" className="font-medium text-sm">
									Public annotation
								</Label>
								<div className="text-xs text-muted-foreground">
									Visible to other team members
								</div>
							</div>
						</div>
						<Switch
							id="edit-is-public"
							checked={isPublic}
							onCheckedChange={setIsPublic}
							disabled={isSaving}
						/>
					</div>

					{/* Action Buttons */}
					<div className="flex gap-3 pt-2">
						<Button
							variant="outline"
							onClick={onClose}
							className="flex-1"
							size="lg"
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSave}
							disabled={!text.trim() || isSaving}
							className="flex-1"
							size="lg"
						>
							{isSaving ? (
								<>
									<div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Saving...
								</>
							) : (
								<>
									<PencilIcon className="h-4 w-4 mr-2" />
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
