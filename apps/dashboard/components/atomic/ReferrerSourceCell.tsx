'use client';

import type React from 'react';
import { cn } from '@/lib/utils';
import { FaviconImage } from '../analytics/favicon-image';

export interface ReferrerSourceCellData {
	name?: string;
	referrer?: string;
	domain?: string;
	id?: string;
}

interface ReferrerSourceCellProps extends ReferrerSourceCellData {
	className?: string;
}

export const ReferrerSourceCell: React.FC<ReferrerSourceCellProps> = ({
	id,
	name,
	referrer,
	domain,
	className,
}) => {
	const displayName = name || referrer || 'Direct';

	if (displayName === 'Direct' || !domain) {
		return (
			<span
				className={
					className ? `${className} font-medium text-sm` : 'font-medium text-sm'
				}
				id={id}
			>
				{displayName}
			</span>
		);
	}

	return (
		<a
			className={cn(
				'flex cursor-pointer items-center gap-2 font-medium text-sm transition-colors hover:text-blue-600 hover:underline',
				className
			)}
			href={`https://${domain.trim()}`}
			id={id}
			rel="noopener noreferrer nofollow"
			target="_blank"
		>
			<FaviconImage
				altText={`${displayName} favicon`}
				className="rounded-sm"
				domain={domain}
				size={16}
			/>
			{displayName}
		</a>
	);
};

export default ReferrerSourceCell;
