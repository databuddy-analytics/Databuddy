'use client';

import { InfoIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWebsites } from '@/hooks/use-websites';
import { cn } from '@/lib/utils';
import {
	getDefaultCategory,
	getNavigationWithWebsites,
} from './navigation/navigation-config';
import { SignOutButton } from './sign-out-button';
import { ThemeToggle } from './theme-toggle';

const HelpDialog = dynamic(
	() => import('./help-dialog').then((mod) => mod.HelpDialog),
	{
		ssr: false,
		loading: () => null,
	}
);

interface CategorySidebarProps {
	onCategoryChange?: (categoryId: string) => void;
	selectedCategory?: string;
}

export function CategorySidebar({
	onCategoryChange,
	selectedCategory,
}: CategorySidebarProps) {
	const pathname = usePathname();
	const { websites, isLoading: isLoadingWebsites } = useWebsites();
	const [helpOpen, setHelpOpen] = useState(false);

	const { categories, defaultCategory } = useMemo(() => {
		const config = getNavigationWithWebsites(
			pathname,
			websites,
			isLoadingWebsites
		);
		const defaultCat = getDefaultCategory(pathname);
		return { categories: config.categories, defaultCategory: defaultCat };
	}, [pathname, websites, isLoadingWebsites]);

	const activeCategory = selectedCategory || defaultCategory;

	return (
		<div className="fixed inset-y-0 left-0 z-40 w-12 border-r bg-background">
			<div className="flex h-full flex-col">
				{/* Logo */}
				<div className="flex h-16 items-center justify-center border-border border-b">
					<Link 
						className="relative flex-shrink-0 transition-opacity hover:opacity-80"
						href="/websites"
					>
						<Image
							alt="DataBuddy Logo"
							className="drop-shadow-sm invert dark:invert-0"
							height={32}
							priority
							src="/logo.svg"
							width={32}
						/>
					</Link>
				</div>
				{categories.map((category) => {
					const Icon = category.icon;
					const isActive = activeCategory === category.id;

					return (
						<Tooltip key={category.id}>
							<TooltipTrigger asChild>
								<button
									className={cn(
										'flex items-center justify-center px-4 py-2 transition-colors hover:bg-muted/50',
										'focus:outline-none',
										isActive && 'bg-muted text-foreground'
									)}
									onClick={() => onCategoryChange?.(category.id)}
									type="button"
								>
									<Icon
										className={cn(
											'h-5 w-5 transition-colors',
											isActive ? 'text-primary' : 'text-muted-foreground'
										)}
										weight={isActive ? 'fill' : 'duotone'}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{category.name}
							</TooltipContent>
						</Tooltip>
					);
				})}

				{/* Bottom area - spacer to push bottom items down */}
				<div className="flex-1" />

				{/* Bottom controls */}
				<div className="space-y-2 border-border border-t p-2 pb-4">
					{/* Notifications */}
					<div className="flex justify-center">
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex h-8 w-8 items-center justify-center">
									<NotificationsPopover />
								</div>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Notifications
							</TooltipContent>
						</Tooltip>
					</div>

					{/* Theme Toggle */}
					<div className="flex justify-center">
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex h-8 w-8 items-center justify-center">
									<ThemeToggle />
								</div>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Toggle Theme
							</TooltipContent>
						</Tooltip>
					</div>

					{/* Support */}
					<div className="flex justify-center">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted/50 focus:outline-none"
									onClick={() => setHelpOpen(true)}
									type="button"
								>
									<InfoIcon
										className="h-4 w-4 not-dark:text-primary"
										weight="duotone"
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Help and Support
							</TooltipContent>
						</Tooltip>
					</div>

					{/* Profile */}
					<div className="flex justify-center">
						<SignOutButton />
					</div>
				</div>

				{/* Help Dialog */}
				<HelpDialog onOpenChange={setHelpOpen} open={helpOpen} />
			</div>
		</div>
	);
}
