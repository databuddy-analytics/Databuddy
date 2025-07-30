'use client';

import { XIcon } from '@phosphor-icons/react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWebsites } from '@/hooks/use-websites';
import { cn } from '@/lib/utils';
import {
	demoNavigation,
	mainNavigation,
	sandboxNavigation,
	websiteNavigation,
} from './navigation/navigation-config';
import { NavigationSection } from './navigation/navigation-section';
import { SandboxHeader } from './navigation/sandbox-header';
import { WebsiteHeader } from './navigation/website-header';
import { OrganizationSelector } from './organization-selector';
import { TopHeader } from './top-header';

type NavigationConfig = {
	navigation: typeof mainNavigation;
	header: React.ReactNode;
	currentWebsiteId?: string | null;
};

export function Sidebar() {
	const pathname = usePathname();
	const [isMobileOpen, setIsMobileOpen] = useState(false);
	const { websites } = useWebsites();
	const sidebarRef = useRef<HTMLDivElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);

	const isDemo = pathname.startsWith('/demo');
	const isSandbox = pathname.startsWith('/sandbox');
	const isWebsite = pathname.startsWith('/websites/');

	const websiteId = useMemo(() => {
		return isDemo || isWebsite ? pathname.split('/')[2] : null;
	}, [isDemo, isWebsite, pathname]);

	const currentWebsite = useMemo(() => {
		return websiteId ? websites?.find((site) => site.id === websiteId) : null;
	}, [websiteId, websites]);

	const closeSidebar = useCallback(() => {
		setIsMobileOpen(false);
	}, []);

	const openSidebar = useCallback(() => {
		previousFocusRef.current = document.activeElement as HTMLElement;
		setIsMobileOpen(true);
	}, []);

	const getNavigationConfig = useMemo((): NavigationConfig => {
		if (isWebsite) {
			return {
				navigation: websiteNavigation,
				header: <WebsiteHeader website={currentWebsite} />,
				currentWebsiteId: websiteId,
			};
		}

		if (isDemo) {
			return {
				navigation: demoNavigation,
				header: <WebsiteHeader website={currentWebsite} />,
				currentWebsiteId: websiteId,
			};
		}

		if (isSandbox) {
			return {
				navigation: sandboxNavigation,
				header: <SandboxHeader />,
				currentWebsiteId: 'sandbox',
			};
		}

		return {
			navigation: mainNavigation,
			header: <OrganizationSelector />,
		};
	}, [isWebsite, isDemo, isSandbox, websiteId, currentWebsite]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isMobileOpen) {
				closeSidebar();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isMobileOpen, closeSidebar]);

	useEffect(() => {
		if (isMobileOpen && sidebarRef.current) {
			const firstFocusableElement = sidebarRef.current.querySelector(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			) as HTMLElement;
			if (firstFocusableElement) {
				firstFocusableElement.focus();
			}
		} else if (!isMobileOpen && previousFocusRef.current) {
			previousFocusRef.current.focus();
		}
	}, [isMobileOpen]);

	const { navigation, header, currentWebsiteId } = getNavigationConfig;

	return (
		<>
			<TopHeader setMobileOpen={openSidebar} />

			{isMobileOpen && (
				<div
					className="fixed inset-0 z-30 bg-black/20 md:hidden"
					onClick={closeSidebar}
					onKeyDown={(e) => {
						if (e.key === 'Escape') {
							closeSidebar();
						}
					}}
					role="button"
					tabIndex={0}
				/>
			)}

			<nav
				aria-hidden={!isMobileOpen}
				className={cn(
					'fixed inset-y-0 left-0 z-40 w-64 bg-background',
					'border-r pt-16 transition-transform duration-200 ease-out md:translate-x-0',
					isMobileOpen ? 'translate-x-0' : '-translate-x-full'
				)}
				ref={sidebarRef}
			>
				<Button
					aria-label="Close sidebar"
					className="absolute top-3 right-3 z-50 h-8 w-8 p-0 md:hidden"
					onClick={closeSidebar}
					size="sm"
					type="button"
					variant="ghost"
				>
					<XIcon className="h-4 w-4" size={32} weight="duotone" />
					<span className="sr-only">Close sidebar</span>
				</Button>

				<ScrollArea className="h-[calc(100vh-4rem)]">
					<nav
						aria-label="Main navigation"
						className="select-none space-y-4 p-3"
					>
						{header}
						{navigation.map((section) => (
							<NavigationSection
								currentWebsiteId={currentWebsiteId}
								items={section.items}
								key={section.title}
								pathname={pathname}
								title={section.title}
							/>
						))}
					</nav>
				</ScrollArea>
			</nav>
		</>
	);
}
