"use client";

import {
	NoteIcon,
	PencilIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { formatAnnotationDateRange } from "@/lib/annotation-utils";
import type { Annotation } from "@/types/annotations";

// Using shared Annotation type from @/types/annotations

interface AnnotationsPanelProps {
	annotations: Annotation[];
	onEdit: (annotation: Annotation) => void;
	onDelete: (id: string) => Promise<void>;
	isDeleting?: boolean;
	granularity?: "hourly" | "daily" | "weekly" | "monthly";
}

export function AnnotationsPanel({
	annotations,
	onEdit,
	onDelete,
	isDeleting = false,
	granularity = "daily",
}: AnnotationsPanelProps) {
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (deleteId) {
			await onDelete(deleteId);
			setDeleteId(null);
		}
	};

	return (
		<>
			<Sheet onOpenChange={setIsOpen} open={isOpen}>
				<SheetTrigger asChild>
					<Button
						className="gap-2 border-sidebar-border hover:bg-sidebar-accent"
						size="sm"
						variant="outline"
					>
						<NoteIcon className="h-4 w-4" weight="duotone" />
						Annotations ({annotations.length})
					</Button>
				</SheetTrigger>
				<SheetContent
					className="w-full overflow-y-auto border-sidebar-border bg-sidebar p-4 sm:w-[60vw] sm:max-w-[600px]"
					side="right"
				>
					<SheetHeader className="space-y-3 border-sidebar-border border-b pb-6">
						<div className="flex items-center gap-3">
							<div className="rounded border border-sidebar-border bg-sidebar-accent p-3">
								<NoteIcon
									className="h-6 w-6 text-sidebar-ring"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<SheetTitle className="font-semibold text-sidebar-foreground text-xl tracking-tight">
									Chart Annotations ({annotations.length})
								</SheetTitle>
								<SheetDescription className="mt-1 text-sidebar-foreground/70">
									Manage your chart annotations. Click to edit or delete.
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="space-y-6 pt-6">
						{annotations.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<div className="mb-4 rounded bg-sidebar-accent p-4">
									<NoteIcon
										className="h-8 w-8 text-sidebar-foreground/70"
										weight="duotone"
									/>
								</div>
								<p className="font-medium text-sidebar-foreground">
									No annotations yet
								</p>
								<p className="mt-1 text-sidebar-foreground/70 text-sm">
									Drag on the chart to create your first annotation
								</p>
							</div>
						) : (
							annotations.map((annotation) => (
								<div
									className="group rounded border border-sidebar-border bg-sidebar p-4 transition-all hover:border-sidebar-ring/50 hover:shadow-sm"
									key={annotation.id}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											{/* Color indicator and date */}
											<div className="mb-2 flex items-center gap-2">
												<div
													className="h-3 w-3 rounded-full border-2 border-sidebar shadow-sm"
													style={{ backgroundColor: annotation.color }}
												/>
												<span className="text-sidebar-foreground/70 text-xs">
													{formatAnnotationDateRange(
														annotation.xValue,
														annotation.xEndValue,
														granularity
													)}
												</span>
												{annotation.annotationType === "range" &&
													annotation.xEndValue &&
													new Date(annotation.xValue).getTime() !==
														new Date(annotation.xEndValue).getTime() && (
														<Badge className="text-xs" variant="secondary">
															Range
														</Badge>
													)}
											</div>

											{/* Text */}
											<p className="mb-2 break-words text-sidebar-foreground text-sm">
												{annotation.text}
											</p>

											{/* Tags */}
											{annotation.tags && annotation.tags.length > 0 && (
												<div className="flex flex-wrap gap-1">
													{annotation.tags.map((tag) => (
														<Badge
															className="text-xs"
															key={tag}
															variant="outline"
														>
															<TagIcon className="mr-1 h-3 w-3" />
															{tag}
														</Badge>
													))}
												</div>
											)}
										</div>

										{/* Actions */}
										<div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											<Button
												className="h-8 w-8 p-0"
												onClick={() => {
													onEdit(annotation);
													setIsOpen(false);
												}}
												size="sm"
												variant="ghost"
											>
												<PencilIcon className="h-4 w-4" weight="duotone" />
											</Button>
											<Button
												className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
												onClick={() => setDeleteId(annotation.id)}
												size="sm"
												variant="ghost"
											>
												<TrashIcon className="h-4 w-4" weight="duotone" />
											</Button>
										</div>
									</div>
								</div>
							))
						)}
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog onOpenChange={() => setDeleteId(null)} open={!!deleteId}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Annotation</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this annotation? This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isDeleting}
							onClick={handleDelete}
						>
							{isDeleting ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
