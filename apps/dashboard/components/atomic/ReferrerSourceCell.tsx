"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { FaviconImage } from "../analytics/favicon-image";

export type ReferrerSourceCellData = {
	name?: string;
	referrer?: string;
	domain?: string;
	id?: string;
};

type ReferrerSourceCellProps = ReferrerSourceCellData & {
	className?: string;
};

export const ReferrerSourceCell: React.FC<ReferrerSourceCellProps> = ({
	id,
	name,
	referrer,
	domain,
	className,
}) => {
	const displayName = name || referrer || "Direct";

	if (displayName === "Direct" || !domain) {
		return (
			<span
				className={
					className ? `${className} font-medium text-sm` : "font-medium text-sm"
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
				"flex cursor-pointer items-center gap-2 font-medium text-sm hover:text-foreground hover:underline",
				className
			)}
			href={`https://${domain.trim()}`}
			id={id}
			onClick={(e) => {
				e.stopPropagation();
			}}
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
