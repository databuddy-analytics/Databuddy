'use client';

import { ArrowSquareOutIcon, FileTextIcon } from '@phosphor-icons/react';
import type React from 'react';
import { formatDomainLink } from '@/app/(main)/websites/[id]/_components/utils/analytics-helpers';
import { cn } from '@/lib/utils';

export interface PageLinkCellData {
	path: string;
	websiteDomain?: string;
	// Optional unique ID for the component instance
	id?: string;
}

interface PageLinkCellProps extends PageLinkCellData {
	className?: string;
	iconClassName?: string;
	textClassName?: string;
	maxLength?: number; // Max length for the displayed path before truncation
}

export const PageLinkCell: React.FC<PageLinkCellProps> = ({
	id,
	path,
	websiteDomain,
	className,
	iconClassName = 'h-4 w-4 text-muted-foreground',
	textClassName = 'text-sm',
	maxLength = 35, // Default max length for the path
}) => {
	if (!path) {
		return (
			<span className={cn('text-muted-foreground text-sm', className)} id={id}>
				(not set)
			</span>
		);
	}

	const { href, display } = formatDomainLink(path, websiteDomain, maxLength);
	const isExternal = href.startsWith('http');

	return (
		<a
			className={cn(
				'group flex items-center gap-1.5 hover:underline',
				className
			)}
			href={href}
			id={id}
			rel={isExternal ? 'noopener noreferrer' : undefined}
			target={isExternal ? '_blank' : undefined}
		>
			<FileTextIcon
				className={cn('flex-shrink-0', iconClassName)}
				weight="duotone"
			/>
			<span
				className={cn('truncate group-hover:text-primary', textClassName)}
				style={{ maxWidth: `${maxLength + 2}ch` }}
			>
				{display}
			</span>
			{isExternal && (
				<ArrowSquareOutIcon
					className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
					weight="duotone"
				/>
			)}
		</a>
	);
};

export default PageLinkCell;
