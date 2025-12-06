import type { Icon } from "@phosphor-icons/react";
import type { GatedFeatureId } from "@/types/features";

export interface NavigationItem {
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
}

export interface NavigationSection {
	title: string;
	icon: Icon;
	items: NavigationItem[];
}

export interface Category {
	id: string;
	name: string;
	icon: Icon;
	production?: boolean;
	hideFromDemo?: boolean;
}
