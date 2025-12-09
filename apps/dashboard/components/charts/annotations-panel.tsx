"use client";

import {
	CalendarIcon,
	NoteIcon,
	PencilIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
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

type AnnotationsPanelProps = {
	annotations: Annotation[];
	onEdit: (annotation: Annotation) => void;
	onDelete: (id: string) => Promise<void>;
	isDeleting?: boolean;
	granularity?: "hourly" | "daily" | "weekly" | "monthly";
};

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
					<Button className="gap-2" size="sm" variant="outline">
						<NoteIcon className="size-4" weight="duotone" />
						Annotations ({annotations.length})
					</Button>
				</SheetTrigger>
				<SheetContent
					className="m-3 h-[calc(100%-1.5rem)] rounded border p-0 sm:max-w-md"
					side="right"
				>
					<div className="flex h-full flex-col">
						{/* Header */}
						<SheetHeader className="shrink-0 pr-5">
							<div className="flex items-start gap-4">
								<div className="flex size-11 items-center justify-center rounded border bg-secondary-brighter">
									<NoteIcon
										className="text-foreground"
										size={22}
										weight="fill"
									/>
								</div>
								<div className="min-w-0 flex-1">
									<SheetTitle className="text-lg">Chart Annotations</SheetTitle>
									<SheetDescription className="text-sm">
										{annotations.length} annotation
										{annotations.length !== 1 ? "s" : ""} on this chart
									</SheetDescription>
								</div>
							</div>
						</SheetHeader>

						{/* Content */}
						<div className="flex-1 space-y-4 overflow-y-auto p-2">
							{annotations.length === 0 ? (
								<div className="flex flex-col items-center justify-center rounded border bg-card py-12 text-center">
									<div className="flex size-12 items-center justify-center rounded bg-secondary">
										<NoteIcon
											className="size-6 text-muted-foreground"
											weight="duotone"
										/>
									</div>
									<p className="mt-4 font-medium text-foreground">
										No annotations yet
									</p>
									<p className="mt-1 text-muted-foreground text-sm">
										Drag on the chart to create your first annotation
									</p>
								</div>
							) : (
								<div className="space-y-3">
									{annotations.map((annotation) => {
										const isRange =
											annotation.annotationType === "range" &&
											annotation.xEndValue &&
											new Date(annotation.xValue).getTime() !==
												new Date(annotation.xEndValue).getTime();

										return (
											<div
												className="group rounded border bg-card hover:border-primary"
												key={annotation.id}
											>
												{/* Annotation Header */}
												<div className="flex items-start gap-3 p-3">
													<div
														className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border"
														style={{ borderColor: annotation.color }}
													>
														<div
															className="size-3 rounded-full"
															style={{ backgroundColor: annotation.color }}
														/>
													</div>
													<div className="min-w-0 flex-1">
														<p className="font-medium text-foreground text-sm">
															{annotation.text}
														</p>
														<div className="mt-1 flex flex-wrap items-center gap-2">
															<span className="flex items-center gap-1 text-muted-foreground text-xs">
																<CalendarIcon className="size-3" />
																{formatAnnotationDateRange(
																	annotation.xValue,
																	annotation.xEndValue,
																	granularity
																)}
															</span>
															{isRange && (
																<Badge
																	className="px-1.5 py-0 text-[10px]"
																	variant="secondary"
																>
																	Range
																</Badge>
															)}
														</div>
													</div>
												</div>

												{/* Tags */}
												{annotation.tags && annotation.tags.length > 0 && (
													<div className="border-t px-3 py-2">
														<div className="flex flex-wrap gap-1.5">
															{annotation.tags.map((tag) => (
																<Badge
																	className="gap-1 px-1.5 py-0.5 text-[10px]"
																	key={tag}
																	variant="outline"
																>
																	<TagIcon className="size-2.5" />
																	{tag}
																</Badge>
															))}
														</div>
													</div>
												)}

												{/* Meta */}
												<div className="flex items-center justify-between border-t bg-secondary px-3 py-2">
													<span className="text-muted-foreground text-xs">
														Created{" "}
														{dayjs(annotation.createdAt).format("MMM D, YYYY")}
													</span>
													<div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
														<Button
															className="size-7"
															onClick={() => {
																onEdit(annotation);
																setIsOpen(false);
															}}
															size="icon"
															variant="ghost"
														>
															<PencilIcon
																className="size-3.5"
																weight="duotone"
															/>
														</Button>
														<Button
															className="size-7 text-destructive hover:bg-destructive hover:text-destructive-foreground"
															onClick={() => setDeleteId(annotation.id)}
															size="icon"
															variant="ghost"
														>
															<TrashIcon
																className="size-3.5"
																weight="duotone"
															/>
														</Button>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* Footer */}
						<div className="flex shrink-0 items-center justify-end gap-3 border-t px-6 py-4">
							<Button onClick={() => setIsOpen(false)} variant="ghost">
								Close
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<DeleteDialog
				confirmLabel="Delete"
				description="This action cannot be undone. The annotation will be permanently removed from this chart."
				isDeleting={isDeleting}
				isOpen={!!deleteId}
				onClose={() => setDeleteId(null)}
				onConfirm={handleDelete}
				title="Delete Annotation"
			>
				{annotationToDelete && (
					<div className="rounded border bg-card p-3">
						<div className="flex items-start gap-3">
							<div
								className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded"
								style={{ backgroundColor: annotationToDelete.color }}
							>
								<NoteIcon className="size-3 text-white" weight="fill" />
							</div>
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
					</div>
				)}
			</DeleteDialog>
		</>
	);
}
