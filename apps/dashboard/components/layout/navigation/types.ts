import type { GatedFeatureId } from "@databuddy/shared/types/features";
import type { Icon } from "@phosphor-icons/react";

export interface NavigationItem {
	alpha?: boolean;
	badge?: {
		text: string;
		variant: "purple" | "blue" | "green" | "orange" | "red";
	};
	disabled?: boolean;
	domain?: string;
	external?: boolean;
	/** Feature flag key - if set, item will only show when the flag is enabled */
	flag?: string;
	/** Feature gate - if set, item will show locked state when feature is not enabled */
	gatedFeature?: GatedFeatureId;
	hideFromDemo?: boolean;
	highlight?: boolean;
	href: string;
	icon: Icon;
	name: string;
	production?: boolean;
	rootLevel?: boolean;
	showOnlyOnDemo?: boolean;
	/** Custom tag text displayed in the same style as ALPHA */
	tag?: string;
}

export interface NavigationSection {
	/** Feature flag key - if set, section will only show when the flag is enabled */
	flag?: string;
	icon: Icon;
	items: NavigationItem[];
	title: string;
}

export type NavigationEntry = NavigationSection | NavigationItem;

export interface Category {
	/** Feature flag key - if set, category will only show when the flag is enabled */
	flag?: string;
	hideFromDemo?: boolean;
	icon: Icon;
	id: string;
	name: string;
	production?: boolean;
}
