"use client";

import { CalendarIcon } from "@phosphor-icons/react/dist/ssr";
import { NoteIcon } from "@phosphor-icons/react/dist/ssr";
import { PencilIcon } from "@phosphor-icons/react/dist/ssr";
import { TagIcon } from "@phosphor-icons/react/dist/ssr";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { DeleteDialog } from "@/components/ds/delete-dialog";
import { Sheet } from "@/components/ds/sheet";
import { formatAnnotationDateRange } from "@/lib/annotation-utils";
import type { Annotation } from "@/types/annotations";

interface AnnotationsPanelProps {
	annotations: Annotation[];
	granularity?: "hourly" | "daily" | "weekly" | "monthly";
	isDeleting?: boolean;
	onDelete: (id: string) => Promise<void>;
	onEdit: (annotation: Annotation) => void;
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
				<Sheet.Trigger
					aria-label="Annotations"
					className="inline-flex size-7 items-center justify-center gap-1.5 rounded-md bg-transparent p-0 font-medium text-muted-foreground transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50"
				>
					<NoteIcon className="size-3.5" weight="duotone" />
					<span className="sr-only">Annotations</span>
				</Sheet.Trigger>
				<Sheet.Content
					className="m-3 h-[calc(100%-1.5rem)] rounded border p-0 sm:max-w-sm"
					side="right"
				>
					<Sheet.Close />
					<div className="flex h-full flex-col">
						<Sheet.Header className="shrink-0 pr-5">
							<Sheet.Title className="text-base">Annotations</Sheet.Title>
							<Sheet.Description className="text-xs">
								{annotations.length} annotation
								{annotations.length === 1 ? "" : "s"} on this chart
							</Sheet.Description>
						</Sheet.Header>

						<Sheet.Body className="p-2">
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
																variant="default"
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
													className="size-6 p-0"
													onClick={() => {
														onEdit(annotation);
														setIsOpen(false);
													}}
													variant="ghost"
												>
													<PencilIcon className="size-3" weight="duotone" />
												</Button>
												<Button
													aria-label="Delete annotation"
													className="size-6 p-0"
													onClick={() => setDeleteId(annotation.id)}
													tone="danger"
													variant="ghost"
												>
													<TrashIcon className="size-3" weight="duotone" />
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</Sheet.Body>
					</div>
				</Sheet.Content>
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
