'use client';

import {
	BugIcon,
	ClockIcon,
	FunnelIcon,
	GlobeIcon,
	HouseIcon,
	InfoIcon,
	ListIcon,
	MapPinIcon,
	TargetIcon,
	UsersIcon,
	XIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const demoNavigation = [
	{
		title: 'Web Analytics',
		items: [
			{
				name: 'Overview',
				icon: HouseIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc',
				highlight: true,
			},
			{
				name: 'Sessions',
				icon: ClockIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/sessions',
				highlight: true,
			},
			{
				name: 'Errors',
				icon: BugIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/errors',
				highlight: true,
			},
			{
				name: 'Map',
				icon: MapPinIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/map',
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
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/profiles',
				highlight: true,
			},
			{
				name: 'Funnels',
				icon: FunnelIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/funnels',
				highlight: true,
			},
			{
				name: 'Goals',
				icon: TargetIcon,
				href: '/demo/OXmNQsViBT-FOS_wZCTHc/goals',
				highlight: true,
			},
		],
	},
];

export function Sidebar() {
	const pathname = usePathname();
	const [isMobileOpen, setIsMobileOpen] = useState(false);

	const closeSidebar = useCallback(() => {
		setIsMobileOpen(false);
	}, []);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isMobileOpen) {
				closeSidebar();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isMobileOpen, closeSidebar]);

	return (
		<>
			{/* Top Header */}
			<header className="fixed top-0 right-0 left-0 z-50 h-16 w-full border-b bg-background/95 backdrop-blur-md">
				<div className="flex h-full items-center px-4 md:px-6">
					{/* Left side: Logo + Mobile menu */}
					<div className="flex items-center gap-4">
						<Button
							className="md:hidden"
							onClick={() => setIsMobileOpen(true)}
							size="icon"
							variant="ghost"
						>
							<ListIcon className="h-5 w-5" size={32} weight="duotone" />
							<span className="sr-only">Toggle menu</span>
						</Button>

						<div className="flex items-center gap-3">
							<div className="flex flex-row items-center gap-3">
								<Logo />
							</div>
						</div>
					</div>

					{/* Right Side - User Controls */}
					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />

						{/* Help */}
						<Button
							className="hidden h-8 w-8 md:flex"
							size="icon"
							variant="ghost"
						>
							<InfoIcon className="h-6 w-6" size={32} weight="duotone" />
							<span className="sr-only">Help</span>
						</Button>

						{/* Notifications */}
						<NotificationsPopover />

						{/* User Menu */}
						<UserMenu />
					</div>
				</div>
			</header>

			{/* Mobile backdrop */}
			{isMobileOpen && (
				<div
					className="fixed inset-0 z-30 bg-black/20 md:hidden"
					onClick={closeSidebar}
					onKeyDown={closeSidebar}
					onKeyPress={closeSidebar}
					onKeyUp={closeSidebar}
				/>
			)}

			{/* Sidebar */}
			<div
				className={cn(
					'fixed inset-y-0 left-0 z-40 w-64 bg-background',
					'border-r pt-16 transition-transform duration-200 ease-out md:translate-x-0',
					isMobileOpen ? 'translate-x-0' : '-translate-x-full'
				)}
			>
				{/* Mobile close button */}
				<Button
					className="absolute top-3 right-3 z-50 h-8 w-8 p-0 md:hidden"
					onClick={closeSidebar}
					size="sm"
					variant="ghost"
				>
					<XIcon className="h-4 w-4" size={32} weight="duotone" />
					<span className="sr-only">Close sidebar</span>
				</Button>

				<ScrollArea className="h-[calc(100vh-4rem)]">
					<div className="space-y-4 p-3">
						{/* Demo Website Header */}
						<div className="flex items-center gap-3 rounded border bg-muted/50 p-3">
							<div className="rounded border border-primary/20 bg-primary/10 p-2">
								<GlobeIcon
									className="h-5 w-5 text-primary"
									size={32}
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<h2 className="truncate font-semibold text-sm">Landing Page</h2>
								<Link
									className="truncate text-muted-foreground text-xs"
									href="https://www.databuddy.cc"
									target="_blank"
								>
									www.databuddy.cc
								</Link>
							</div>
						</div>

						{/* Demo Navigation */}
						{demoNavigation.map((section) => (
							<div key={section.title}>
								<h3 className="mb-2 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									{section.title}
								</h3>
								<div className="ml-1 space-y-1">
									{section.items.map((item) => {
										const isActive = pathname === item.href;
										const Icon = item.icon;

										return (
											<Link
												className={cn(
													'flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition-all',
													isActive
														? 'bg-primary/15 font-medium text-primary'
														: 'text-foreground hover:bg-accent/70'
												)}
												href={item.href}
												key={item.name}
											>
												<Icon
													className={cn('h-4 w-4', isActive && 'text-primary')}
													size={32}
													weight="duotone"
												/>
												<span className="truncate">{item.name}</span>
											</Link>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
			</div>
		</>
	);
}

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="h-screen overflow-hidden bg-gradient-to-br from-background to-muted/20 text-foreground">
			<Sidebar />
			<div className="relative h-screen pt-16 md:pl-72">
				<div className="h-[calc(100vh-4rem)] overflow-y-scroll">{children}</div>
			</div>
		</div>
	);
}
