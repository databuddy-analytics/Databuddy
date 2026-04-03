import { useFlags } from "@databuddy/sdk/react";
import { FEATURE_METADATA } from "@databuddy/shared/types/features";
import { CaretDownIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { memo } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import type { useAccordionStates } from "@/hooks/use-persistent-state";
import { isNavItemActive } from "./nav-item-active";
import { NavigationItem } from "./navigation-item";
import type { NavigationSection as NavigationSectionType } from "./types";

/** Keys must differ when href repeats (e.g. overview + loading rows) or when labels repeat. */
function navItemKey(
	sectionTitle: string,
	item: { href: string; name: string }
): string {
	return `${sectionTitle}::${item.href}::${item.name}`;
}

interface FeatureState {
	isLocked: boolean;
	lockedPlanName: string | null;
}

interface NavigationSectionProps {
	accordionStates: ReturnType<typeof useAccordionStates>;
	className?: string;
	currentWebsiteId?: string | null;
	flag?: string;
	icon: NavigationSectionType["icon"];
	items: NavigationSectionType["items"];
	pathname: string;
	searchParams: ReadonlyURLSearchParams;
	title: string;
}

export const NavigationSection = memo(function NavigationSectionComponent({
	title,
	icon: Icon,
	items,
	pathname,
	searchParams,
	currentWebsiteId,
	accordionStates,
	className,
	flag,
}: NavigationSectionProps) {
	const { getAccordionState, toggleAccordion } = accordionStates;
	const isExpanded = getAccordionState(title, true);
	const { isFeatureEnabled, isLoading } = useBillingContext();
	const { isOn } = useFlags();

	if (flag && !isOn(flag)) {
		return null;
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
		if (item.flag && !isOn(item.flag)) {
			return false;
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
				states[navItemKey(title, item)] = {
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
					"flex h-10 w-full min-w-0 items-center gap-3 border-b px-3 text-left font-medium text-sidebar-foreground text-sm transition-all focus:outline-none",
					isExpanded
						? "border-b-border bg-sidebar-accent-brighter"
						: "border-b-transparent hover:bg-sidebar-accent-brighter"
				)}
				data-section={title}
				data-track="navigation-section-toggle"
				onClick={() => toggleAccordion(title, true)}
				type="button"
			>
				<Icon className="size-5 shrink-0 text-sidebar-ring" weight="duotone" />
				<span className="min-w-0 flex-1 truncate text-sm">{title}</span>
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
									const state = featureStates[navItemKey(title, item)];
									return (
										<div key={navItemKey(title, item)}>
											<NavigationItem
												alpha={item.alpha}
												badge={item.badge}
												currentWebsiteId={currentWebsiteId}
												disabled={item.disabled}
												domain={item.domain}
												href={item.href}
												icon={item.icon}
												isActive={isNavItemActive(
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
