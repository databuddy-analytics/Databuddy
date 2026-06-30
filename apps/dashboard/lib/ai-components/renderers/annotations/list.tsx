"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	CalendarIcon,
	DotsThreeIcon,
	NoteIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Card, fromNow } from "@databuddy/ui";

interface AnnotationItem {
	annotationType: "point" | "line" | "range";
	color?: string | null;
	createdAt?: string;
	id: string;
	isPublic?: boolean;
	tags?: string[];
	text: string;
	xEndValue?: string | null;
	xValue: string;
}

export interface AnnotationsListProps extends BaseComponentProps {
	annotations: AnnotationItem[];
	title?: string;
}

function AnnotationTypeLabel({ type }: { type: string }) {
	const labels: Record<string, string> = {
		point: "Point",
		line: "Line",
		range: "Range",
	};
	return (
		<Badge className="rounded py-0.5! text-[10px]" variant="muted">
			<span className="mt-px">{labels[type] ?? type}</span>
		</Badge>
	);
}

function AnnotationRow({
	annotation,
	onNavigate,
	onEdit,
	onDelete,
}: {
	annotation: AnnotationItem;
	onNavigate: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const dateDisplay =
		annotation.annotationType === "range" && annotation.xEndValue
			? `${new Date(annotation.xValue).toLocaleDateString()} - ${new Date(annotation.xEndValue).toLocaleDateString()}`
			: new Date(annotation.xValue).toLocaleDateString();

	const tagsSuffix =
		Array.isArray(annotation.tags) && annotation.tags.length > 0
			? ` · ${annotation.tags.slice(0, 2).join(", ")}${annotation.tags.length > 2 ? ` +${annotation.tags.length - 2}` : ""}`
			: "";

	const metaLine = `${dateDisplay}${tagsSuffix}${annotation.isPublic ? " · Public" : ""}`;

	return (
		<div className="group/annotation-row flex w-full items-start gap-3 rounded-sm bg-muted/30 px-2 py-2.5 text-left transition-colors hover:bg-muted">
			<Button
				className="min-w-0 flex-1 items-start justify-start gap-3 rounded-none bg-transparent p-0 text-left font-normal text-foreground hover:bg-transparent active:scale-100"
				onClick={onNavigate}
				variant="ghost"
			>
				<span className="h-max shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover/annotation-row:bg-primary/10">
					<NoteIcon className="size-3.5" weight="duotone" />
				</span>

				<span className="min-w-0 flex-1">
					<span className="truncate font-medium text-sm">
						{annotation.text}
					</span>
					<span className="mt-1 block truncate text-muted-foreground text-xs">
						<span className="inline-flex items-center gap-1">
							<CalendarIcon className="size-3 shrink-0" weight="duotone" />
							{metaLine}
							<span className="pl-1">
								<AnnotationTypeLabel type={annotation.annotationType} />
							</span>
						</span>
					</span>
				</span>

				{annotation.createdAt && (
					<span className="hidden shrink-0 pt-0.5 text-[11px] text-muted-foreground sm:block">
						{fromNow(annotation.createdAt)}
					</span>
				)}
			</Button>

			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Actions"
					className="inline-flex size-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-secondary p-0 font-medium text-muted-foreground opacity-70 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 group-hover/annotation-row:bg-interactive-hover group-hover/annotation-row:text-foreground data-[state=open]:opacity-100"
				>
					<DotsThreeIcon className="size-4" weight="bold" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-40">
					<DropdownMenu.Item className="gap-2" onClick={onEdit}>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Edit
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						className="gap-2"
						onClick={onDelete}
						variant="destructive"
					>
						<TrashIcon className="size-4" weight="duotone" />
						Delete
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>
		</div>
	);
}

export function AnnotationsListRenderer({
	title,
	annotations,
	className,
}: AnnotationsListProps) {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;

	const goToWebsiteOverview = useCallback(() => {
		router.push(`/websites/${websiteId}`);
	}, [router, websiteId]);

	if (annotations.length === 0) {
		return (
			<Card
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="rounded-md bg-background px-3 py-8">
					<div className="flex flex-col items-center justify-center gap-2 text-center">
						<NoteIcon
							className="size-8 text-muted-foreground/40"
							weight="duotone"
						/>
						<p className="font-medium text-sm">No annotations found</p>
						<p className="text-muted-foreground text-xs">
							Add annotations to mark important events on charts
						</p>
						<Button
							className="mt-2"
							onClick={goToWebsiteOverview}
							size="sm"
							variant="secondary"
						>
							<PlusIcon className="size-4" />
							Create Annotation
						</Button>
					</div>
				</div>
			</Card>
		);
	}

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border-0 bg-secondary p-1",
				className
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<NoteIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="font-medium text-sm">{title ?? "Annotations"}</p>
					<div className="ml-auto flex items-center gap-2">
						<Button onClick={goToWebsiteOverview} size="sm" variant="primary">
							<PlusIcon className="size-3.5" />
							New
						</Button>
					</div>
				</div>

				<div className="rounded-md bg-background px-1 py-1">
					<div className="space-y-1">
						{annotations.map((annotation) => (
							<AnnotationRow
								annotation={annotation}
								key={annotation.id}
								onDelete={goToWebsiteOverview}
								onEdit={goToWebsiteOverview}
								onNavigate={goToWebsiteOverview}
							/>
						))}
					</div>
				</div>
			</div>
		</Card>
	);
}
