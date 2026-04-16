"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AsideLinkProps {
	activeClassName?: string;
	children: ReactNode;
	className?: string;
	href: string;
	startWith?: string;
	title: string;
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
	const isExternal = href.startsWith("http");

	const isActive =
		!isExternal &&
		(startWith
			? pathname.startsWith(startWith) && pathname === href
			: pathname === href);

	if (isExternal) {
		return (
			<a
				className={cn(className)}
				href={href}
				rel="noopener noreferrer"
				target="_blank"
				title={title}
			>
				{children}
			</a>
		);
	}

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
