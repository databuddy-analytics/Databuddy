"use client";

import {
	CalendarIcon,
	NoteIcon,
	PencilIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
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

	const annotationToDelete = annotations.find((a) => a.id === deleteId);

	return (
		<>
			<Sheet onOpenChange={setIsOpen} open={isOpen}>
				<SheetTrigger asChild>
					<Button
						className="size-7 text-muted-foreground hover:text-foreground"
						size="icon"
						variant="ghost"
					>
						<NoteIcon className="size-3.5" weight="duotone" />
					</Button>
				</SheetTrigger>
				<SheetContent
					className="m-3 h-[calc(100%-1.5rem)] rounded border p-0 sm:max-w-sm"
					side="right"
				>
					<div className="flex h-full flex-col">
						<SheetHeader className="shrink-0 pr-5">
							<SheetTitle className="text-base">Annotations</SheetTitle>
							<SheetDescription className="text-xs">
								{annotations.length} annotation
								{annotations.length === 1 ? "" : "s"} on this chart
							</SheetDescription>
						</SheetHeader>

						<div className="flex-1 overflow-y-auto p-2">
							{annotations.length === 0 ? (
								<div className="flex flex-col items-center justify-center rounded border bg-card py-12 text-center">
									<NoteIcon
										className="size-6 text-muted-foreground/40"
										weight="duotone"
									/>
									<p className="mt-3 font-medium text-foreground text-sm">
										No annotations yet
									</p>
									<p className="mt-0.5 text-muted-foreground text-xs">
										Drag on the chart to create one
									</p>
								</div>
							) : (
								<div className="space-y-1">
									{annotations.map((annotation) => (
										<div
											className="group flex items-start gap-2.5 rounded px-2.5 py-2 hover:bg-accent"
											key={annotation.id}
										>
											<div
												className="mt-1 size-2 shrink-0 rounded-full"
												style={{ backgroundColor: annotation.color }}
											/>
											<div className="min-w-0 flex-1">
												<p className="text-foreground text-sm leading-snug">
													{annotation.text}
												</p>
												<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
													<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
														<CalendarIcon className="size-3" />
														{formatAnnotationDateRange(
															annotation.xValue,
															annotation.xEndValue,
															granularity
														)}
													</span>
													{annotation.tags &&
														annotation.tags.length > 0 &&
														annotation.tags.map((tag) => (
															<Badge
																className="h-4 gap-0.5 px-1 text-[10px]"
																key={tag}
																variant="outline"
															>
																<TagIcon className="size-2" />
																{tag}
															</Badge>
														))}
												</div>
											</div>
											<div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
												<Button
													aria-label="Edit annotation"
													className="size-6"
													onClick={() => {
														onEdit(annotation);
														setIsOpen(false);
													}}
													size="icon"
													variant="ghost"
												>
													<PencilIcon className="size-3" weight="duotone" />
												</Button>
												<Button
													aria-label="Delete annotation"
													className="size-6 text-destructive hover:bg-destructive hover:text-destructive-foreground"
													onClick={() => setDeleteId(annotation.id)}
													size="icon"
													variant="ghost"
												>
													<TrashIcon className="size-3" weight="duotone" />
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<DeleteDialog
				confirmLabel="Delete"
				description="This annotation will be permanently removed."
				isDeleting={isDeleting}
				isOpen={!!deleteId}
				onClose={() => setDeleteId(null)}
				onConfirm={handleDelete}
				title="Delete Annotation"
			>
				{annotationToDelete ? (
					<div className="flex items-start gap-2.5 rounded border bg-card p-3">
						<div
							className="mt-0.5 size-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: annotationToDelete.color }}
						/>
						<div className="min-w-0 flex-1">
							<p className="line-clamp-2 text-foreground text-sm">
								{annotationToDelete.text}
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{formatAnnotationDateRange(
									annotationToDelete.xValue,
									annotationToDelete.xEndValue,
									granularity
								)}
							</p>
						</div>
					</div>
				) : null}
			</DeleteDialog>
		</>
	);
}
