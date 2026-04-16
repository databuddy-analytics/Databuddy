import { ChartLineUpIcon } from "@phosphor-icons/react";
import { ClockIcon } from "@phosphor-icons/react";
import { CursorClickIcon } from "@phosphor-icons/react";
import { DevicesIcon } from "@phosphor-icons/react";
import { GlobeIcon } from "@phosphor-icons/react";
import { LinkIcon } from "@phosphor-icons/react";
import { SquaresFourIcon } from "@phosphor-icons/react";
import { UsersIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import type { ElementType } from "react";

/** Icon mapping for query type categories */
export const CATEGORY_ICONS: Record<string, ElementType> = {
	Analytics: ChartLineUpIcon,
	Realtime: ClockIcon,
	Devices: DevicesIcon,
	Geo: GlobeIcon,
	Traffic: LinkIcon,
	Engagement: CursorClickIcon,
	Errors: WarningIcon,
	Users: UsersIcon,
	Sessions: UsersIcon,
	Pages: LinkIcon,
	Performance: ClockIcon,
	Other: SquaresFourIcon,
};

/** Get the icon component for a category */
export function getCategoryIcon(category: string): ElementType {
	return CATEGORY_ICONS[category] || SquaresFourIcon;
}

/** Color mapping for categories (for future use in charts, badges, etc) */
export const CATEGORY_COLORS: Record<string, string> = {
	Analytics: "hsl(var(--chart-1))",
	Realtime: "hsl(var(--chart-2))",
	Devices: "hsl(var(--chart-3))",
	Geo: "hsl(var(--chart-4))",
	Traffic: "hsl(var(--chart-5))",
	Engagement: "hsl(var(--chart-1))",
	Errors: "hsl(var(--destructive))",
	Users: "hsl(var(--chart-2))",
	Sessions: "hsl(var(--chart-3))",
	Pages: "hsl(var(--chart-4))",
	Performance: "hsl(var(--chart-5))",
	Other: "hsl(var(--muted-foreground))",
};

/** Get the color for a category */
export function getCategoryColor(category: string): string {
	return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}
