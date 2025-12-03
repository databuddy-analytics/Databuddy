'use client';

import {
	Bell,
	LayoutDashboard,
	LineChart,
	Settings2,
	Users2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const routes = [
	{
		label: 'Dashboard',
		icon: LayoutDashboard,
		href: '/dashboard',
		color: 'text-slate-400',
	},
	{
		label: 'Analytics',
		icon: LineChart,
		href: '/dashboard/analytics',
		color: 'text-slate-400',
	},
	{
		label: 'Users',
		icon: Users2,
		href: '/dashboard/users',
		color: 'text-slate-400',
	},
	{
		label: 'Notifications',
		icon: Bell,
		href: '/dashboard/notifications',
		color: 'text-slate-400',
	},
	{
		label: 'Settings',
		icon: Settings2,
		href: '/dashboard/settings',
		color: 'text-slate-400',
	},
];

export function MainNav() {
	const pathname = usePathname();

	return (
		<nav className="flex flex-col space-y-1">
			{routes.map((route) => (
				<Link
					className={cn(
						'flex items-center gap-x-3 border-transparent border-l-2 px-3 py-2 font-medium text-slate-400 text-sm hover:bg-slate-800 hover:text-slate-100',
						pathname === route.href &&
							'border-sky-500 border-l-2 bg-slate-800 text-slate-100'
					)}
					href={route.href}
					key={route.href}
				>
					<route.icon
						className={cn(
							'size-4 stroke-[1.5]',
							pathname === route.href ? 'text-sky-500' : route.color
						)}
					/>
					{route.label}
				</Link>
			))}
		</nav>
	);
}
