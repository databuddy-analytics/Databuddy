"use client";

import type { SessionEvent } from "@/types/sessions";
import { cleanUrl, formatPropertyValue, getDisplayPath } from "./session-utils";
import {
	CursorClickIcon,
	FileTextIcon,
	LightningIcon,
	LinkIcon,
	TagIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Badge, formatLocalTime } from "@databuddy/ui";

interface SessionEventTimelineProps {
	events: SessionEvent[];
}

function getEventBadge(event: SessionEvent) {
	switch (event.source) {
		case "custom":
			return {
				label: "Custom",
				className: "bg-primary/10 text-primary",
			};
		case "error":
			return {
				label: "Error",
				className: "bg-destructive/10 text-destructive",
			};
		case "outgoing_link":
			return {
				label: "Outbound",
				className: "bg-secondary text-secondary-foreground",
			};
		default:
			return event.properties && Object.keys(event.properties).length > 0
				? {
						label: "Props",
						className: "bg-muted text-muted-foreground",
					}
				: null;
	}
}

function getEventIconClass(event: SessionEvent, hasProperties: boolean) {
	switch (event.source) {
		case "error":
			return "text-destructive";
		case "custom":
			return "text-primary";
		case "outgoing_link":
			return "text-secondary-foreground";
		default:
			return hasProperties ? "text-primary" : "text-muted-foreground";
	}
}

function EventIcon({
	event,
	hasProperties,
}: {
	event: SessionEvent;
	hasProperties: boolean;
}) {
	const className = `size-4 ${getEventIconClass(event, hasProperties)}`;

	switch (event.source) {
		case "custom":
			return <TagIcon className={className} />;
		case "error":
			return <WarningCircleIcon className={className} />;
		case "outgoing_link":
			return <LinkIcon className={className} />;
		default:
			break;
	}

	if (hasProperties) {
		return <TagIcon className={className} />;
	}

	switch (event.event_name) {
		case "screen_view":
		case "page_view":
			return <FileTextIcon className={className} />;
		case "click":
		case "player-page-tab":
			return <CursorClickIcon className={className} />;
		default:
			return <LightningIcon className={className} />;
	}
}

function EventItem({
	event,
	eventIndex,
}: {
	event: SessionEvent;
	eventIndex: number;
}) {
	const hasProperties = Boolean(
		event.properties && Object.keys(event.properties).length > 0
	);
	const badge = getEventBadge(event);
	const fullPath =
		event.source === "outgoing_link"
			? event.path || ""
			: cleanUrl(event.path || "");
	const displayPath =
		event.source === "outgoing_link"
			? event.path || ""
			: getDisplayPath(event.path || "");
	const time = formatLocalTime(event.time, "h:mm:ss A");

	return (
		<div className="grid grid-cols-[28px_16px_100px_1fr_72px_70px] items-center gap-2 px-2 py-1.5 text-sm">
			<span className="text-right font-mono text-muted-foreground text-xs tabular-nums">
				{eventIndex + 1}
			</span>

			<EventIcon event={event} hasProperties={hasProperties} />

			<span className="truncate font-medium">{event.event_name}</span>

			<span
				className="truncate font-mono text-muted-foreground text-xs"
				title={fullPath}
			>
				{displayPath || "—"}
			</span>

			<div className="w-[72px]">
				{badge && (
					<Badge
						className={`w-[68px] justify-center text-[10px] ${badge.className}`}
						variant="muted"
					>
						{badge.label}
					</Badge>
				)}
			</div>

			<span className="text-right text-muted-foreground text-xs tabular-nums">
				{time}
			</span>
		</div>
	);
}

function EventProperties({
	properties,
}: {
	properties: Record<string, unknown>;
}) {
	const entries = Object.entries(properties);
	if (entries.length === 0) {
		return null;
	}

	return (
		<div className="ml-12 flex max-w-full flex-wrap gap-1.5 pb-2">
			{entries.map(([key, value]) => (
				<div
					className="flex max-w-full items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs"
					key={key}
				>
					<span className="shrink-0 font-mono text-muted-foreground">
						{key}:
					</span>
					<span
						className="truncate font-medium text-foreground"
						title={formatPropertyValue(value)}
					>
						{formatPropertyValue(value)}
					</span>
				</div>
			))}
		</div>
	);
}

export function SessionEventTimeline({ events }: SessionEventTimelineProps) {
	if (!events?.length) {
		return (
			<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
				No events recorded
			</div>
		);
	}

	return (
		<div className="max-h-[280px] overflow-y-auto rounded border bg-background">
			<div className="sticky top-0 grid grid-cols-[28px_16px_100px_1fr_72px_70px] items-center gap-2 border-b bg-accent px-2 py-1.5 font-medium text-muted-foreground text-xs">
				<span className="text-right">#</span>
				<span />
				<span>Event</span>
				<span>Path</span>
				<span className="w-[72px]" />
				<span className="text-right">Time</span>
			</div>
			<div className="divide-y divide-border/50">
				{events.map((event, eventIndex) => (
					<div key={`${event.event_id || "event"}:${event.time}:${eventIndex}`}>
						<EventItem event={event} eventIndex={eventIndex} />
						{event.properties && Object.keys(event.properties).length > 0 && (
							<EventProperties properties={event.properties} />
						)}
					</div>
				))}
			</div>
		</div>
	);
}
