"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { FaviconImage } from "../analytics/favicon-image";
import { TruncatedText } from "../ui/truncated-text";

export interface ReferrerSourceCellData {
	domain?: string;
	id?: string;
	name?: string;
	referrer?: string;
}

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
	const textClassName = className
		? `${className} font-medium text-sm`
		: "font-medium text-sm";

	if (displayName === "Direct" || !domain) {
		return (
			<TruncatedText
				className={cn("truncate", textClassName)}
				id={id}
				text={displayName}
			/>
		);
	}

	return (
		<a
			className={cn(
				"flex min-w-0 cursor-pointer items-center gap-2 hover:text-foreground hover:underline",
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
				className="shrink-0 rounded-sm"
				domain={domain}
				size={16}
			/>
			<TruncatedText
				className={cn("min-w-0 truncate", textClassName)}
				text={displayName}
			/>
		</a>
	);
};
