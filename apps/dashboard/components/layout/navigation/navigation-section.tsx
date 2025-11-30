import { CaretDownIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { memo } from "react";
import type { useAccordionStates } from "@/hooks/use-persistent-state";
import { NavigationItem } from "./navigation-item";
import type { NavigationSection as NavigationSectionType } from "./types";

type NavigationSectionProps = {
	title: string;
	icon: NavigationSectionType["icon"];
	items: NavigationSectionType["items"];
	pathname: string;
	currentWebsiteId?: string | null;
	className?: string;
	accordionStates: ReturnType<typeof useAccordionStates>;
};

const buildCurrentUrl = (
	pathname: string,
	searchParams: URLSearchParams | null
) => {
	const search = searchParams ? `?${searchParams.toString()}` : "";
	return `${pathname}${search}`;
};

const buildFullPath = (basePath: string, itemHref: string) =>
	itemHref === "" ? basePath : `${basePath}${itemHref}`;

const checkRootLevelMatch = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	searchParams: URLSearchParams | null
) => {
	if (item.href.includes("?")) {
		const currentUrl = buildCurrentUrl(pathname, searchParams);
		return currentUrl === item.href;
	}
	return pathname === item.href;
};

const checkSandboxMatch = (
	item: NavigationSectionType["items"][0],
	pathname: string
) => {
	const fullPath = buildFullPath("/sandbox", item.href);
	return pathname === fullPath;
};

const checkDemoMatch = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	currentWebsiteId: string | null | undefined
) => {
	const fullPath = buildFullPath(`/demo/${currentWebsiteId}`, item.href);
	return pathname === fullPath;
};

const checkWebsiteMatch = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	currentWebsiteId: string | null | undefined
) => {
	const fullPath = buildFullPath(`/websites/${currentWebsiteId}`, item.href);
	return pathname === fullPath;
};

const getPathInfo = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	searchParams: URLSearchParams | null,
	currentWebsiteId?: string | null
) => {
	if (item.rootLevel) {
		return { isActive: checkRootLevelMatch(item, pathname, searchParams) };
	}

	if (currentWebsiteId === "sandbox") {
		return { isActive: checkSandboxMatch(item, pathname) };
	}

	if (pathname.startsWith("/demo")) {
		return { isActive: checkDemoMatch(item, pathname, currentWebsiteId) };
	}

	return { isActive: checkWebsiteMatch(item, pathname, currentWebsiteId) };
};

export const NavigationSection = memo(function NavigationSectionComponent({
	title,
	icon: Icon,
	items,
	pathname,
	currentWebsiteId,
	accordionStates,
	className,
}: NavigationSectionProps) {
	const { getAccordionState, toggleAccordion } = accordionStates;
	const isExpanded = getAccordionState(title, true); // Default to expanded
	const searchParams = useSearchParams();

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

		return true;
	});

	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<>
			<button
				className={clsx(
					className,
					"flex h-10 items-center gap-3 border-b px-3 text-left font-medium text-sidebar-foreground text-sm transition-colors focus:outline-none",
					isExpanded
						? "bg-sidebar-accent-brighter"
						: "hover:bg-sidebar-accent-brighter"
				)}
				data-section={title}
				data-track="navigation-section-toggle"
				onClick={() => toggleAccordion(title, true)}
				type="button"
			>
				<Icon className="size-5 shrink-0 text-sidebar-ring" weight="fill" />
				<span className="flex-1 truncate text-sm">{title}</span>
				<div className="shrink-0">
					<CaretDownIcon
						className={clsx(
							"size-4 text-sidebar-foreground/60 transition-transform duration-200",
							isExpanded ? "rotate-180" : ""
						)}
					/>
				</div>
			</button>

			<MotionConfig
				transition={{ duration: 0.2, type: "tween", ease: "easeOut" }}
			>
				<AnimatePresence initial={false}>
					{isExpanded && (
						<motion.div
							animate={{ opacity: 1, height: "auto" }}
							className="overflow-hidden"
							exit={{ opacity: 0, height: 0 }}
							initial={{ opacity: 0, height: 0 }}
						>
							<motion.div className="text-sm">
								{visibleItems.map((item) => {
									const { isActive } = getPathInfo(
										item,
										pathname,
										searchParams,
										currentWebsiteId
									);

									return (
										<div key={item.name}>
											<NavigationItem
												alpha={item.alpha}
												currentWebsiteId={currentWebsiteId}
												disabled={item.disabled}
												domain={item.domain}
												href={item.href}
												icon={item.icon}
												isActive={isActive}
												isExternal={item.external}
												isRootLevel={!!item.rootLevel}
												name={item.name}
												production={item.production}
												sectionName={title}
											/>
										</div>
									);
								})}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</MotionConfig>
		</>
	);
});
