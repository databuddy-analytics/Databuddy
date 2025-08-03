"use client";

import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	CaretRightIcon,
	ClockIcon,
	EyeIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { FaviconImage } from '@/components/analytics/favicon-image';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type ProfileData = {
  visitor_id: string;
  first_visit: string;
  last_visit: string;
  total_sessions: number;
  total_pageviews: number;
  total_duration: number;
  total_duration_formatted: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  region: string;
  sessions: Array<{
    session_id: string;
    session_name: string;
    first_visit: string;
    last_visit: string;
    duration: number;
    duration_formatted: string;
    page_views: number;
    unique_pages: number;
    device: string;
    browser: string;
    os: string;
    country: string;
    region: string;
    referrer: string;
    events: Array<{
      event_id: string;
      time: string;
      event_name: string;
      path: string;
      error_message?: string;
      error_type?: string;
      properties: Record<string, any>;
    }>;
  }>;
};

import {
  formatDuration,
  getBrowserIconComponent,
  getCountryFlag,
  getDeviceIcon,
  getOSIconComponent,
} from "./profile-utils";

interface ProfileRowProps {
  profile: ProfileData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function getReferrerDisplayInfo(session: any) {
  // Check if we have parsed referrer info
  if (session.referrer_parsed) {
    return {
      name:
        session.referrer_parsed.name ||
        session.referrer_parsed.domain ||
        "Unknown",
      domain: session.referrer_parsed.domain,
      type: session.referrer_parsed.type,
    };
  }

  // Fallback to raw referrer
  if (
    session.referrer &&
    session.referrer !== "direct" &&
    session.referrer !== ""
  ) {
    try {
      const url = new URL(
        session.referrer.startsWith("http")
          ? session.referrer
          : `https://${session.referrer}`,
      );
      return {
        name: url.hostname.replace("www.", ""),
        domain: url.hostname,
        type: "referrer",
      };
    } catch {
      return {
        name: session.referrer,
        domain: null,
        type: "referrer",
      };
    }
  }

  return {
    name: "Direct",
    domain: null,
    type: "direct",
  };
}

export function ProfileRow({
  profile,
  index,
  isExpanded,
  onToggle,
}: ProfileRowProps) {
  const avgSessionDuration =
    profile.total_sessions > 0
      ? (profile.total_duration || 0) / profile.total_sessions
      : 0;

  // Get the most recent session's referrer for the main profile display
  const latestSession = profile.sessions?.[0];
  const profileReferrerInfo = latestSession
    ? getReferrerDisplayInfo(latestSession)
    : null;

	return (
		<Collapsible onOpenChange={onToggle} open={isExpanded}>
			<CollapsibleTrigger asChild>
				<div className="flex cursor-pointer items-center justify-between border-transparent border-l-4 p-5 transition-all duration-200 hover:border-primary/20 hover:bg-muted/30">
					<div className="flex min-w-0 flex-1 items-center gap-4">
						{/* Expand/Collapse and Profile Number */}
						<div className="flex flex-shrink-0 items-center gap-3">
							{isExpanded ? (
								<CaretDownIcon className="h-4 w-4 text-muted-foreground transition-transform" />
							) : (
								<CaretRightIcon className="h-4 w-4 text-muted-foreground transition-transform" />
							)}
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
								{index + 1}
							</div>
						</div>
						<div className="flex flex-shrink-0 items-center gap-2">
							{getCountryFlag(profile.country)}
							{getDeviceIcon(profile.device)}
							{getBrowserIconComponent(profile.browser)}
							{getOSIconComponent(profile.os)}
						</div>

            {/* Profile Info */}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-base text-foreground">
                Visitor {profile.visitor_id.substring(0, 8)}...
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span>{profile.browser}</span>
                <span className="text-muted-foreground/60">•</span>
                <span>{profile.country || "Unknown"}</span>
              </div>
            </div>

						{/* Latest Referrer Info */}
						{profileReferrerInfo && (
							<div className="hidden min-w-[120px] flex-shrink-0 items-center gap-2 lg:flex">
								<div className="flex items-center gap-2">
									{profileReferrerInfo.domain ? (
										<FaviconImage
											className="flex-shrink-0"
											domain={profileReferrerInfo.domain}
											size={16}
										/>
									) : (
										<ArrowSquareOutIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
									)}
									<span className="truncate text-muted-foreground text-sm">
										{profileReferrerInfo.name}
									</span>
								</div>
							</div>
						)}
					</div>

					{/* Key Metrics - More Prominent */}
					<div className="ml-4 flex flex-shrink-0 items-center gap-4 text-sm">
						{/* Sessions Count */}
						<div className="hidden min-w-[60px] flex-col items-center gap-1 sm:flex">
							<div className="flex items-center gap-1 text-muted-foreground text-xs">
								<UsersIcon className="h-3 w-3" />
								<span>Sessions</span>
							</div>
							<span className="font-semibold text-foreground text-sm">
								{profile.total_sessions}
							</span>
						</div>

            {/* Page Views */}
            <div className="hidden min-w-[60px] flex-col items-center gap-1 sm:flex">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <EyeIcon className="h-3 w-3" />
                <span>Pages</span>
              </div>
              <span className="font-semibold text-foreground text-sm">
                {profile.total_pageviews}
              </span>
            </div>

            {/* Avg Duration */}
            <div className="hidden min-w-[60px] flex-col items-center gap-1 lg:flex">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <ClockIcon className="h-3 w-3" />
                <span>Avg Time</span>
              </div>
              <span className="font-semibold text-foreground text-sm">
                {formatDuration(avgSessionDuration)}
              </span>
            </div>

            {/* Visitor Type Badge */}
            <div className="flex min-w-[70px] flex-col items-center gap-1">
              <div className="text-muted-foreground text-xs">Type</div>
              <Badge
                className="px-2 py-1 font-semibold text-xs"
                variant={profile.total_sessions > 1 ? "default" : "secondary"}
              >
                {profile.total_sessions > 1 ? "Return" : "New"}
              </Badge>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>

			<CollapsibleContent>
				<div className="border-t bg-muted/20 px-4 pb-4">
					{/* Basic Profile Info */}
					<div className="grid grid-cols-2 gap-4 py-4 text-sm md:grid-cols-4">
						<div>
							<div className="mb-1 text-muted-foreground text-xs">
								First Visit
							</div>
							<div className="font-medium">
								{profile.first_visit
									? dayjs(profile.first_visit).format('MMM D, YYYY')
									: 'Unknown'}
							</div>
						</div>
						<div>
							<div className="mb-1 text-muted-foreground text-xs">
								Last Visit
							</div>
							<div className="font-medium">
								{profile.last_visit
									? dayjs(profile.last_visit).format('MMM D, YYYY')
									: 'Unknown'}
							</div>
						</div>
						<div>
							<div className="mb-1 text-muted-foreground text-xs">Location</div>
							<div className="font-medium">
								{profile.region && profile.region !== 'Unknown'
									? `${profile.region}, `
									: ''}
								{profile.country || 'Unknown'}
							</div>
						</div>
						<div>
							<div className="mb-1 text-muted-foreground text-xs">
								Total Time
							</div>
							<div className="font-medium">
								{profile.total_duration_formatted ||
									formatDuration(profile.total_duration || 0)}
							</div>
						</div>
					</div>

					{/* Recent Sessions */}
					{profile.sessions && profile.sessions.length > 0 && (
						<div className="border-t pt-4">
							<div className="mb-3 font-medium text-muted-foreground text-sm">
								Recent Sessions ({profile.sessions.length})
							</div>
							<div className="space-y-2">
								{profile.sessions.slice(0, 5).map((session, sessionIndex) => (
									<div
										className="flex items-center justify-between rounded border bg-background p-3"
										key={`${profile.visitor_id}-session-${sessionIndex}`}
									>
										<div className="flex items-center gap-3">
											<div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 font-medium text-primary text-xs">
												{sessionIndex + 1}
											</div>
											<div>
												<div className="font-medium text-sm">
													{session.session_name}
												</div>
												<div className="text-muted-foreground text-xs">
													{session.first_visit
														? dayjs(session.first_visit).format('MMM D, HH:mm')
														: 'Unknown'}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-4 text-xs">
											<div className="text-center">
												<div className="font-medium">
													{session.duration_formatted}
												</div>
												<div className="text-muted-foreground">Duration</div>
											</div>
											<div className="text-center">
												<div className="font-medium">{session.page_views}</div>
												<div className="text-muted-foreground">Pages</div>
											</div>
										</div>
									</div>
								))}
								{profile.sessions.length > 5 && (
									<div className="py-2 text-center text-muted-foreground text-xs">
										+{profile.sessions.length - 5} more sessions
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
