'use client';

import {
	BugIcon,
	FunnelIcon,
	GlobeIcon,
	HouseIcon,
	InfoIcon,
	ListIcon,
	MapPinIcon,
	TargetIcon,
	UserIcon,
	UsersIcon,
	XIcon,
} from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AnalyticsToolbar } from '@/app/(main)/websites/[id]/_components/analytics-toolbar';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from '@/stores/jotai/filterAtoms';

const DEMO_WEBSITE_ID = 'OXmNQsViBT-FOS_wZCTHc';
const DEMO_WEBSITE_URL = 'https://www.databuddy.cc';

const demoNavigation = [
	{
		title: 'Web Analytics',
		items: [
			{
				name: 'Overview',
				icon: HouseIcon,
				href: `/demo/${DEMO_WEBSITE_ID}`,
				highlight: true,
			},
			{
				name: 'Sessions',
				icon: UserIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/sessions`,
				highlight: true,
			},
			{
				name: 'Errors',
				icon: BugIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/errors`,
				highlight: true,
			},
			{
				name: 'Map',
				icon: MapPinIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/map`,
				highlight: true,
			},
		],
	},
	{
		title: 'Product Analytics',
		items: [
			{
				name: 'Profiles',
				icon: UsersIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/profiles`,
				highlight: true,
			},
			{
				name: 'Funnels',
				icon: FunnelIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/funnels`,
				highlight: true,
			},
			{
				name: 'Goals',
				icon: TargetIcon,
				href: `/demo/${DEMO_WEBSITE_ID}/goals`,
				highlight: true,
			},
		],
	},
];

function Sidebar() {
	const pathname = usePathname();
	const [isMobileOpen, setIsMobileOpen] = useState(false);

	const closeSidebar = useCallback(() => {
		setIsMobileOpen(false);
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape' && isMobileOpen) {
				closeSidebar();
			}
		},
		[isMobileOpen, closeSidebar]
	);

	useEffect(() => {
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	return (
		<>
			<header className="fixed top-0 right-0 left-0 z-50 h-16 w-full border-b bg-background/95 backdrop-blur-md">
				<div className="flex h-full items-center px-4 md:px-6">
					<div className="flex items-center gap-4">
						<Button
							aria-label="Toggle menu"
							className="md:hidden"
							onClick={() => setIsMobileOpen(true)}
							size="icon"
							variant="ghost"
						>
							<ListIcon className="h-5 w-5" weight="duotone" />
						</Button>

						<div className="flex items-center gap-3">
							<Logo />
						</div>
					</div>

					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />

						<Button
							aria-label="Help"
							className="hidden h-8 w-8 md:flex"
							size="icon"
							variant="ghost"
						>
							<InfoIcon className="h-6 w-6" weight="duotone" />
						</Button>

						<NotificationsPopover />
						<UserMenu />
					</div>
				</div>
			</header>

			{isMobileOpen && (
				<div
					aria-hidden="true"
					className="fixed inset-0 z-30 bg-black/20 md:hidden"
					onClick={closeSidebar}
				/>
			)}

			<aside
				aria-label="Demo navigation"
				className={cn(
					'fixed inset-y-0 left-0 z-40 w-64 bg-background',
					'border-r pt-16 transition-transform duration-200 ease-out md:translate-x-0',
					isMobileOpen ? 'translate-x-0' : '-translate-x-full'
				)}
			>
				<Button
					aria-label="Close sidebar"
					className="absolute top-3 right-3 z-50 h-8 w-8 p-0 md:hidden"
					onClick={closeSidebar}
					size="sm"
					variant="ghost"
				>
					<XIcon className="h-4 w-4" weight="duotone" />
				</Button>

				<ScrollArea className="h-[calc(100vh-4rem)]">
					<nav className="space-y-4 p-3">
						<div className="flex items-center gap-3 rounded border bg-muted/50 p-3">
							<div className="rounded border border-primary/20 bg-primary/10 p-2">
								<GlobeIcon
									aria-hidden="true"
									className="h-5 w-5 text-primary"
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<h2 className="truncate font-semibold text-sm">Landing Page</h2>
								<Link
									className="truncate text-muted-foreground text-xs"
									href={DEMO_WEBSITE_URL}
									rel="noopener"
									target="_blank"
								>
									www.databuddy.cc
								</Link>
							</div>
						</div>

						{demoNavigation.map((section) => (
							<div key={section.title}>
								<h3 className="mb-2 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									{section.title}
								</h3>
								<ul className="ml-1 space-y-1">
									{section.items.map((item) => {
										const isActive = pathname === item.href;
										const Icon = item.icon;

										return (
											<li key={item.name}>
												<Link
													className={cn(
														'flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition-all',
														isActive
															? 'bg-primary/15 font-medium text-primary'
															: 'text-foreground hover:bg-accent/70'
													)}
													href={item.href}
												>
													<Icon
														aria-hidden="true"
														className={cn(
															'h-4 w-4',
															isActive && 'text-primary'
														)}
														weight="duotone"
													/>
													<span className="truncate">{item.name}</span>
												</Link>
											</li>
										);
									})}
								</ul>
							</div>
						))}
					</nav>
				</ScrollArea>
			</aside>
		</>
	);
}

interface MainLayoutProps {
	children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters, setSelectedFilters] = useAtom(
		dynamicQueryFiltersAtom
	);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			// Simulate refresh for demo
			await new Promise((resolve) => setTimeout(resolve, 1000));
			toast.success('Demo data refreshed');
		} catch {
			toast.error('Failed to refresh data');
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="h-screen overflow-hidden bg-gradient-to-br from-background to-muted/20 text-foreground">
			<Sidebar />
			<main className="relative h-screen pt-16 md:pl-64">
				<div className="h-[calc(100vh-4rem)] overflow-y-scroll">
					<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
						{/* Analytics toolbar for demo */}
						<AnalyticsToolbar
							isRefreshing={isRefreshing}
							onFiltersChange={setSelectedFilters}
							onRefresh={handleRefresh}
							selectedFilters={selectedFilters}
						/>

						{children}
					</div>
				</div>
			</main>
		</div>
	);
}
