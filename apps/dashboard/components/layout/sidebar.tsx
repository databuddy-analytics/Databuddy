'use client';

import { ListIcon, XIcon } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccordionStates } from '@/hooks/use-persistent-state';
import { useWebsites } from '@/hooks/use-websites';
import { cn } from '@/lib/utils';
import { CategorySidebar } from './category-sidebar';
import { MobileCategorySelector } from './navigation/mobile-category-selector';
import {
	getDefaultCategory,
	getNavigationWithWebsites,
} from './navigation/navigation-config';
import { NavigationSection } from './navigation/navigation-section';
import { SandboxHeader } from './navigation/sandbox-header';
import type { NavigationSection as NavigationSectionType } from './navigation/types';
import { WebsiteHeader } from './navigation/website-header';
import { OrganizationSelector } from './organization-selector';

type NavigationConfig = {
	navigation: NavigationSectionType[];
	header: React.ReactNode;
	currentWebsiteId?: string | null;
};

export function Sidebar() {
	const pathname = usePathname();
	const [isMobileOpen, setIsMobileOpen] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string>();
	const { websites, isLoading: isLoadingWebsites } = useWebsites();
	const accordionStates = useAccordionStates();
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

	const toggleSidebar = useCallback(() => {
		if (isMobileOpen) {
			closeSidebar();
		} else {
			openSidebar();
		}
	}, [isMobileOpen, closeSidebar, openSidebar]);

	const getNavigationConfig = useMemo((): NavigationConfig => {
		const contextConfig = getNavigationWithWebsites(
			pathname,
			websites,
			isLoadingWebsites
		);
		const defaultCat = getDefaultCategory(pathname);
		const activeCat = selectedCategory || defaultCat;

		// Get navigation from centralized config
		const navSections =
			contextConfig.navigationMap[
				activeCat as keyof typeof contextConfig.navigationMap
			] ||
			contextConfig.navigationMap[
				contextConfig.defaultCategory as keyof typeof contextConfig.navigationMap
			];

		// Determine header based on context
		let headerComponent: React.ReactNode;
		let currentId: string | null | undefined;

		if (isWebsite || isDemo) {
			headerComponent = isWebsite ? (
				<WebsiteHeader website={currentWebsite} />
			) : (
				<OrganizationSelector />
			);
			currentId = websiteId;
		} else if (isSandbox) {
			headerComponent = <SandboxHeader />;
			currentId = 'sandbox';
		} else {
			headerComponent = <OrganizationSelector />;
			currentId = undefined;
		}

		return {
			navigation: navSections,
			header: headerComponent,
			currentWebsiteId: currentId,
		};
	}, [
		pathname,
		selectedCategory,
		isWebsite,
		isDemo,
		isSandbox,
		websiteId,
		currentWebsite,
		websites,
		isLoadingWebsites,
	]);

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
			{/* Mobile Header */}
			<header className="fixed top-0 right-0 left-0 z-50 h-12 w-full border-b bg-background md:hidden">
				<div className="flex h-full items-center justify-between px-4">
					<div className="flex items-center gap-3">
						<Button
							aria-label="Toggle navigation menu"
							onClick={toggleSidebar}
							size="icon"
							type="button"
							variant="ghost"
						>
							<ListIcon className="h-5 w-5" weight="duotone" />
						</Button>

						<Link
							className="flex items-center gap-2 transition-opacity hover:opacity-80"
							href="/websites"
						>
							<div className="flex h-8 w-8 items-center justify-center">
								<Image
									alt="Databuddy Logo"
									className="drop-shadow-sm invert dark:invert-0"
									height={24}
									priority
									src="/logo.svg"
									width={24}
								/>
							</div>
							<span className="font-semibold text-lg">Databuddy</span>
						</Link>
					</div>
				</div>
			</header>

			{/* Category Sidebar - Desktop only */}
			<div className="hidden md:block">
				<CategorySidebar
					onCategoryChange={setSelectedCategory}
					selectedCategory={selectedCategory}
				/>
			</div>

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
					'fixed inset-y-0 z-40 w-72 bg-sidebar',
					'border-r border-sidebar-border transition-transform duration-200 ease-out',
					'left-0 md:left-12',
					'pt-12 md:pt-0',
					'md:translate-x-0',
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

				<ScrollArea className="h-full md:h-full">
					<div className="flex h-full flex-col">
						{header}

						{/* Mobile Category Selector */}
						<MobileCategorySelector
							onCategoryChange={setSelectedCategory}
							selectedCategory={selectedCategory}
						/>

						<nav aria-label="Main navigation" className="flex flex-col">
							{navigation.map((section) => (
								<NavigationSection
									accordionStates={accordionStates}
									currentWebsiteId={currentWebsiteId}
									icon={section.icon}
									items={section.items}
									key={section.title}
									pathname={pathname}
									title={section.title}
								/>
							))}
						</nav>
					</div>
				</ScrollArea>
			</nav>
		</>
	);
}
