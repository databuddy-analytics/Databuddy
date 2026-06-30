"use client";

import { Skeleton } from "@databuddy/ui";
import {
	getComponent,
	hasComponent,
	type RawComponentInput,
} from "@/lib/ai-components";
import { chartSurfaceClassName } from "@/lib/chart-presentation";

const SKELETON_LABELS: Record<string, string> = {
	"line-chart": "Loading chart...",
	"bar-chart": "Loading chart...",
	"area-chart": "Loading chart...",
	"stacked-bar-chart": "Loading chart...",
	"pie-chart": "Loading chart...",
	"donut-chart": "Loading chart...",
	"data-table": "Loading table...",
	"referrers-list": "Loading referrers...",
	"mini-map": "Loading map...",
	"links-list": "Loading links...",
	"link-preview": "Loading preview...",
	"funnels-list": "Loading funnels...",
	"funnel-preview": "Loading preview...",
	"dashboard-actions": "Loading actions...",
	"goals-list": "Loading goals...",
	"goal-preview": "Loading preview...",
	"annotations-list": "Loading annotations...",
	"annotation-preview": "Loading preview...",
};

function ComponentSkeleton({ type, title }: { type: string; title?: string }) {
	const label = SKELETON_LABELS[type] ?? "Loading...";

	if (type === "dashboard-actions") {
		return (
			<div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/50 bg-background/70 p-1 shadow-xs">
				<Skeleton className="h-7 w-28 rounded-md" />
				<Skeleton className="h-7 w-20 rounded-md" />
			</div>
		);
	}

	return (
		<div className={chartSurfaceClassName}>
			<div className="dotted-bg bg-accent">
				<Skeleton className="h-[120px] w-full rounded-none" />
			</div>
			<div className="flex items-center gap-2.5 border-t px-3 py-2">
				<p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
					{title ?? label}
				</p>
				<div className="h-0.5 w-12 animate-pulse rounded bg-primary/30" />
			</div>
		</div>
	);
}

interface AIComponentProps {
	className?: string;
	input: RawComponentInput;
	streaming?: boolean;
}

/**
 * Renders an AI-generated component based on its type.
 * During streaming, skips strict validation and shows a skeleton
 * if the data is too incomplete to render.
 */
export function AIComponent({ input, className, streaming }: AIComponentProps) {
	if (!hasComponent(input.type)) {
		return null;
	}

	const definition = getComponent(input.type);
	if (!definition) {
		return null;
	}

	// During streaming, try to render with whatever data we have.
	// If validation or transform fails, show a typed skeleton instead of nothing.
	if (streaming) {
		if (definition.validate(input)) {
			try {
				const props = definition.transform(input);
				const Component = definition.component;
				return <Component {...props} className={className} streaming />;
			} catch {
				// Transform failed on partial data — show skeleton
			}
		}
		return (
			<ComponentSkeleton
				title={typeof input.title === "string" ? input.title : undefined}
				type={input.type}
			/>
		);
	}

	// Complete mode: strict validation
	if (!definition.validate(input)) {
		return null;
	}

	const props = definition.transform(input);
	const Component = definition.component;

	return <Component {...props} className={className} />;
}
