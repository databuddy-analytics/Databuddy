'use client';

import type React from 'react';
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
		<span
			className={
				className
					? `${className} flex items-center gap-2 font-medium text-sm`
					: 'flex items-center gap-2 font-medium text-sm'
			}
			id={id}
		>
			<FaviconImage
				altText={`${displayName} favicon`}
				className="rounded-sm"
				domain={domain}
				size={16}
			/>
			{displayName}
		</span>
	);
};

export default ReferrerSourceCell;
