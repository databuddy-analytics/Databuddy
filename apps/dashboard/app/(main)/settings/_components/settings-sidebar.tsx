'use client';

import type { Icon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NavItem {
	id: string;
	label: string;
	icon: Icon;
	disabled?: boolean;
}

interface SettingsSidebarProps {
	items: NavItem[];
	activeTab: string;
	setActiveTab: (tab: string) => void;
	className?: string;
}

export function SettingsSidebar({
	items,
	activeTab,
	setActiveTab,
	className,
}: SettingsSidebarProps) {
	return (
		<nav className={cn('flex flex-col gap-1', className)}>
			{items.map((item) => (
				<Button
					className="w-full justify-start"
					disabled={item.disabled}
					key={item.id}
					onClick={() => setActiveTab(item.id)}
					variant={activeTab === item.id ? 'secondary' : 'ghost'}
				>
					<item.icon className="mr-2 h-4 w-4" />
					{item.label}
				</Button>
			))}
		</nav>
	);
}
