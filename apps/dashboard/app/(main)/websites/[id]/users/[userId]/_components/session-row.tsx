"use client";

import type {
	RawSessionEventTuple,
	Session,
	SessionEvent,
	SessionReferrer,
	SessionRowProps,
} from "@databuddy/shared/types/sessions";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	CaretRightIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useCallback } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getDeviceIcon } from "@/lib/utils";
import { generateSessionName } from "./generate-session-name";
import { SessionEventTimeline } from "./session-event-timeline";

dayjs.extend(relativeTime);

function getEventSortPriority(eventName: string): number {
	if (eventName === "page_exit") return 0;
	if (eventName === "screen_view") return 1;
	return 2;
}

function transformSessionEvents(
	events: RawSessionEventTuple[]
): SessionEvent[] {
	return events
		.map((tuple) => {
			if (!Array.isArray(tuple) || tuple.length < 5) return null;

			const [event_id, time, event_name, path, properties] = tuple;

			let propertiesObj: Record<string, unknown> = {};
			if (properties) {
				try {
					propertiesObj = JSON.parse(properties);
				} catch {
					// Keep empty object if parsing fails
				}
			}

			return { event_id, time, event_name, path, properties: propertiesObj };
		})
		.filter((event): event is SessionEvent => event !== null)
		.sort((a, b) => {
			const timeA = new Date(a.time).getTime();
			const timeB = new Date(b.time).getTime();
			if (timeA !== timeB) return timeA - timeB;
			return (
				getEventSortPriority(a.event_name) - getEventSortPriority(b.event_name)
			);
		});
}

function getReferrerInfo(session: Session): SessionReferrer {
	if (session.referrer_parsed) {
		return {
			name:
				session.referrer_parsed.name ||
				session.referrer_parsed.domain ||
				"Unknown",
			domain: session.referrer_parsed.domain || null,
		};
	}

	if (session.referrer) {
		try {
			const url = new URL(session.referrer);
			return { name: url.hostname, domain: url.hostname };
		} catch {
			return { name: "Direct", domain: null };
		}
	}

	return { name: "Direct", domain: null };
}

function SessionRowInternal({
	session,
	index,
	isExpanded,
	onToggle,
}: SessionRowProps) {
	const events =
		Array.isArray(session.events) &&
		session.events.length > 0 &&
		Array.isArray(session.events[0])
			? transformSessionEvents(session.events as RawSessionEventTuple[])
			: (session.events as SessionEvent[]);

	const referrerInfo = getReferrerInfo(session);

	const handleToggle = useCallback(() => {
		onToggle(session.session_id);
	}, [onToggle, session.session_id]);

	const sessionDisplayName = generateSessionName(session.session_id);

	return (
		<Collapsible onOpenChange={handleToggle} open={isExpanded}>
			<CollapsibleTrigger asChild>
				<div
					className={`group grid cursor-pointer grid-cols-[24px_1fr_120px_80px_60px_60px_70px_80px] items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 lg:grid-cols-[24px_1fr_120px_80px_100px_60px_60px_70px_80px] ${
						isExpanded ? "bg-accent/30" : ""
					}`}
				>
					{/* Expand Icon */}
					<div className="flex justify-center text-muted-foreground">
						{isExpanded ? (
							<CaretDownIcon className="size-3.5" />
						) : (
							<CaretRightIcon className="size-3.5" />
						)}
					</div>

					{/* Session Name */}
					<span className="truncate font-medium">{sessionDisplayName}</span>

					{/* Location */}
					<div className="flex items-center gap-1.5 overflow-hidden">
						<CountryFlag country={session.country_code} size="sm" />
						<span className="truncate">
							{session.country_name || session.country || "Unknown"}
						</span>
					</div>

					{/* Device Stack */}
					<div className="flex items-center gap-1">
						{getDeviceIcon(session.device_type)}
						<BrowserIcon name={session.browser_name} size="sm" />
						<OSIcon name={session.os_name} size="sm" />
					</div>

					{/* Referrer */}
					<div className="hidden items-center gap-1.5 overflow-hidden lg:flex">
						{referrerInfo.domain ? (
							<FaviconImage
								className="shrink-0 rounded-sm"
								domain={referrerInfo.domain}
								size={14}
							/>
						) : (
							<ArrowSquareOutIcon className="size-3.5 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate">{referrerInfo.name}</span>
					</div>

					{/* Pages */}
					<span className="text-right font-medium tabular-nums">
						{session.page_views}
					</span>

					{/* Events */}
					<span className="text-right font-medium tabular-nums">
						{events.length}
					</span>

					{/* Last seen */}
					<span className="text-right text-muted-foreground">
						{session.first_visit ? dayjs(session.first_visit).fromNow() : "—"}
					</span>
				</div>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="border-t bg-accent/20 px-3 py-3">
					<SessionEventTimeline events={events} />
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export const SessionRow = React.memo(SessionRowInternal);
