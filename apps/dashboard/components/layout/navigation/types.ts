import type { Icon } from "@phosphor-icons/react";
import type { GatedFeatureId } from "@/types/features";

export type NavigationItem = {
	name: string;
	icon: Icon;
	href: string;
	rootLevel?: boolean;
	external?: boolean;
	highlight?: boolean;
	alpha?: boolean;
	/** Custom tag text displayed in the same style as ALPHA */
	tag?: string;
	production?: boolean;
	domain?: string;
	disabled?: boolean;
	hideFromDemo?: boolean;
	showOnlyOnDemo?: boolean;
	badge?: {
		text: string;
		variant: "purple" | "blue" | "green" | "orange" | "red";
	};
	/** Feature gate - if set, item will show locked state when feature is not enabled */
	gatedFeature?: GatedFeatureId;
	/** Feature flag key - if set, item will only show when the flag is enabled */
	flag?: string;
};

export type NavigationSection = {
	title: string;
	icon: Icon;
	items: NavigationItem[];
	/** Feature flag key - if set, section will only show when the flag is enabled */
	flag?: string;
};

export type Category = {
	id: string;
	name: string;
	icon: Icon;
	production?: boolean;
	hideFromDemo?: boolean;
	/** Feature flag key - if set, category will only show when the flag is enabled */
	flag?: string;
};
