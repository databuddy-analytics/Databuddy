import { CaretDownIcon } from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { memo } from 'react';
import type { useAccordionStates } from '@/hooks/use-persistent-state';
import { NavigationItem } from './navigation-item';
import type { NavigationSection as NavigationSectionType } from './types';

interface NavigationSectionProps {
	title: string;
	icon: NavigationSectionType['icon'];
	items: NavigationSectionType['items'];
	pathname: string;
	currentWebsiteId?: string | null;
	accordionStates: ReturnType<typeof useAccordionStates>;
}

const buildCurrentUrl = (
	pathname: string,
	searchParams: URLSearchParams | null
) => {
	const search = searchParams ? `?${searchParams.toString()}` : '';
	return `${pathname}${search}`;
};

const buildFullPath = (basePath: string, itemHref: string) => {
	return itemHref === '' ? basePath : `${basePath}${itemHref}`;
};

const checkRootLevelMatch = (
	item: NavigationSectionType['items'][0],
	pathname: string,
	searchParams: URLSearchParams | null
) => {
	if (item.href.includes('?')) {
		const currentUrl = buildCurrentUrl(pathname, searchParams);
		return currentUrl === item.href;
	}
	return pathname === item.href;
};

const checkSandboxMatch = (
	item: NavigationSectionType['items'][0],
	pathname: string
) => {
	const fullPath = buildFullPath('/sandbox', item.href);
	return pathname === fullPath;
};

const checkDemoMatch = (
	item: NavigationSectionType['items'][0],
	pathname: string,
	currentWebsiteId: string | null | undefined
) => {
	const fullPath = buildFullPath(`/demo/${currentWebsiteId}`, item.href);
	return pathname === fullPath;
};

const checkWebsiteMatch = (
	item: NavigationSectionType['items'][0],
	pathname: string,
	currentWebsiteId: string | null | undefined
) => {
	const fullPath = buildFullPath(`/websites/${currentWebsiteId}`, item.href);
	return pathname === fullPath;
};

const getPathInfo = (
	item: NavigationSectionType['items'][0],
	pathname: string,
	searchParams: URLSearchParams | null,
	currentWebsiteId?: string | null
) => {
	if (item.rootLevel) {
		return { isActive: checkRootLevelMatch(item, pathname, searchParams) };
	}

	if (currentWebsiteId === 'sandbox') {
		return { isActive: checkSandboxMatch(item, pathname) };
	}

	if (pathname.startsWith('/demo')) {
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
}: NavigationSectionProps) {
	const { getAccordionState, toggleAccordion } = accordionStates;
	const isExpanded = getAccordionState(title, true); // Default to expanded
	const searchParams = useSearchParams();

	const visibleItems = items.filter((item) => {
		if (item.production === false && process.env.NODE_ENV === 'production') {
			return false;
		}
		return true;
	});

	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<div className="border-sidebar-border/30 border-b border-dotted last:border-b-0">
			<button
				className="flex w-full items-center gap-3 px-3 py-2.5 text-left font-medium text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent/50 focus:outline-none"
				onClick={() => toggleAccordion(title, true)}
				type="button"
			>
				<Icon className="size-5 flex-shrink-0 text-sidebar-ring" weight="fill" />
				<span className="flex-1 text-sm">{title}</span>
				<motion.div
					animate={{ rotate: isExpanded ? 180 : 0 }}
					className="flex-shrink-0"
					transition={{ duration: 0.2 }}
				>
					<CaretDownIcon
						className="h-4 w-4 text-sidebar-foreground/60"
						weight="duotone"
					/>
				</motion.div>
			</button>

			<MotionConfig transition={{ duration: 0.2, type: 'tween', ease: 'easeOut' }}>
				<AnimatePresence initial={false}>
					{isExpanded && (
						<motion.div
							animate={{ opacity: 1, height: 'auto' }}
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
											/>
										</div>
									);
								})}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</MotionConfig>
		</div>
	);
});
