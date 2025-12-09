import { useFlags } from "@databuddy/sdk/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { memo, useMemo } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import type { useAccordionStates } from "@/hooks/use-persistent-state";
import { FEATURE_METADATA } from "@/types/features";
import { NavigationItem } from "./navigation-item";
import type { NavigationSection as NavigationSectionType } from "./types";

type FeatureState = {
	isLocked: boolean;
	lockedPlanName: string | null;
};

type NavigationSectionProps = {
	title: string;
	icon: NavigationSectionType["icon"];
	items: NavigationSectionType["items"];
	pathname: string;
	currentWebsiteId?: string | null;
	className?: string;
	accordionStates: ReturnType<typeof useAccordionStates>;
	flag?: string;
};

const buildFullPath = (basePath: string, itemHref: string) =>
	itemHref === "" ? basePath : `${basePath}${itemHref}`;

const isItemActive = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	searchParams: URLSearchParams | null,
	currentWebsiteId?: string | null
): boolean => {
	if (item.rootLevel) {
		if (item.href.includes("?")) {
			const search = searchParams ? `?${searchParams.toString()}` : "";
			return `${pathname}${search}` === item.href;
		}
		return pathname === item.href;
	}

	if (currentWebsiteId === "sandbox") {
		return pathname === buildFullPath("/sandbox", item.href);
	}

	if (pathname.startsWith("/demo")) {
		return pathname === buildFullPath(`/demo/${currentWebsiteId}`, item.href);
	}

	return pathname === buildFullPath(`/websites/${currentWebsiteId}`, item.href);
};

export const NavigationSection = memo(function NavigationSectionComponent({
	title,
	icon: Icon,
	items,
	pathname,
	currentWebsiteId,
	accordionStates,
	className,
	flag,
}: NavigationSectionProps) {
	const { getAccordionState, toggleAccordion } = accordionStates;
	const isExpanded = getAccordionState(title, true);
	const currentPathname = usePathname();
	const { isFeatureEnabled, isLoading } = useBillingContext();
	const { isEnabled } = useFlags();

	const searchParams = useMemo(() => {
		if (typeof window === "undefined") {
			return null;
		}
		return new URLSearchParams(window.location.search);
	}, [currentPathname]);

	if (flag) {
		const flagState = isEnabled(flag);
		if (!(flagState.isReady && flagState.enabled)) {
			return null;
		}
	}

	const visibleItems = items.filter((item) => {
		if (item.production === false && process.env.NODE_ENV === "production") {
			return false;
		}
		const isDemo = pathname.startsWith("/demo");
		if (item.hideFromDemo && isDemo) {
			return false;
		}
		if (item.showOnlyOnDemo && !isDemo) {
			return false;
		}
		if (item.flag) {
			const flagState = isEnabled(item.flag);
			if (!(flagState.isReady && flagState.enabled)) {
				return false;
			}
		}
		return true;
	});

	const featureStates = (() => {
		const states: Record<string, FeatureState> = {};
		if (isLoading) {
			return states;
		}

		for (const item of visibleItems) {
			if (item.gatedFeature) {
				const locked = !isFeatureEnabled(item.gatedFeature);
				states[item.name] = {
					isLocked: locked,
					lockedPlanName:
						FEATURE_METADATA[item.gatedFeature]?.minPlan?.toUpperCase() ?? null,
				};
			}
		}
		return states;
	})();

	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<>
			<button
				className={clsx(
					className,
					"flex h-10 items-center gap-3 px-3 text-left font-medium text-sidebar-foreground text-sm focus:outline-none",
					isExpanded
						? "border-sidebar-border border-b bg-sidebar-accent-brighter"
						: "hover:bg-sidebar-accent-brighter"
				)}
				data-section={title}
				data-track="navigation-section-toggle"
				onClick={() => toggleAccordion(title, true)}
				type="button"
			>
				<Icon className="size-5 shrink-0 text-sidebar-ring" weight="fill" />
				<span className="flex-1 truncate text-sm">{title}</span>
				<CaretDownIcon
					className={clsx(
						"size-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-200",
						isExpanded ? "rotate-180" : ""
					)}
				/>
			</button>

			<MotionConfig
				transition={{ duration: 0.2, type: "tween", ease: "easeOut" }}
			>
				<AnimatePresence initial={false}>
					{isExpanded ? (
						<motion.div
							animate={{ opacity: 1, height: "auto" }}
							className="overflow-hidden"
							exit={{ opacity: 0, height: 0 }}
							initial={{ opacity: 0, height: 0 }}
						>
							<motion.div className="text-sm">
								{visibleItems.map((item) => {
									const state = featureStates[item.name];
									return (
										<div key={item.name}>
											<NavigationItem
												alpha={item.alpha}
												badge={item.badge}
												currentWebsiteId={currentWebsiteId}
												disabled={item.disabled}
												domain={item.domain}
												href={item.href}
												icon={item.icon}
												isActive={isItemActive(
													item,
													pathname,
													searchParams,
													currentWebsiteId
												)}
												isExternal={item.external}
												isLocked={state?.isLocked ?? false}
												isRootLevel={!!item.rootLevel}
												lockedPlanName={state?.lockedPlanName ?? null}
												name={item.name}
												production={item.production}
												sectionName={title}
												tag={item.tag}
											/>
										</div>
									);
								})}
							</motion.div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</MotionConfig>
		</>
	);
});
