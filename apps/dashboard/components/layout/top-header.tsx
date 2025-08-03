'use client';

import { InfoIcon, ListIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { memo, useState } from 'react';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

const HelpDialog = dynamic(
	() => import('./help-dialog').then((mod) => mod.HelpDialog),
	{
		ssr: false,
		loading: () => null,
	}
);

interface TopHeaderProps {
	toggleMobileSidebar: () => void;
}

export const TopHeader = memo(function TopHeaderComponent({
	toggleMobileSidebar,
}: TopHeaderProps) {
	const [helpOpen, setHelpOpen] = useState(false);

	const handleHelpClick = () => {
		setHelpOpen(true);
	};

	return (
		<header className="fixed top-0 right-0 left-0 z-50 h-16 w-full border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
			<div className="flex h-full items-center justify-between px-4 md:px-6">
				<div className="flex items-center gap-4">
					<Button
						aria-label="Toggle navigation menu"
						className="md:hidden"
						onClick={toggleMobileSidebar}
						size="icon"
						type="button"
						variant="ghost"
					>
						<ListIcon
							className="h-5 w-5 not-dark:text-primary"
							size={32}
							weight="duotone"
						/>
						<span className="sr-only">Toggle menu</span>
					</Button>

					<div className="flex select-none items-center gap-3">
						<div className="flex flex-row items-center gap-3">
							<Logo />
						</div>
					</div>
				</div>

				<div className="flex items-center gap-1">
					<ThemeToggle />

					<Button
						aria-label="Help and support"
						className="hidden h-8 w-8 md:flex"
						onClick={handleHelpClick}
						size="icon"
						type="button"
						variant="ghost"
					>
						<InfoIcon
							className="h-5 w-5 not-dark:text-primary"
							size={32}
							weight="duotone"
						/>
						<span className="sr-only">Help</span>
					</Button>

					<NotificationsPopover />

					<UserMenu />
				</div>
			</div>

			<HelpDialog onOpenChange={setHelpOpen} open={helpOpen} />
		</header>
	);
});
