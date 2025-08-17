'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AsideLinkProps {
	href: string;
	startWith?: string;
	title: string;
	className?: string;
	activeClassName?: string;
	children: ReactNode;
}

export function AsideLink({
	href,
	startWith,
	title,
	className,
	activeClassName,
	children,
}: AsideLinkProps) {
	const pathname = usePathname();

	const isActive = startWith
		? pathname.startsWith(startWith) && pathname === href
		: pathname === href;

	return (
		<Link
			className={cn(className, isActive && activeClassName)}
			href={href}
			title={title}
		>
			{children}
		</Link>
	);
}
