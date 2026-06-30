"use client";

import { parseReferrer } from "@databuddy/shared/utils/referrer";
import type React from "react";
import { cn } from "@/lib/utils";
import { FaviconImage } from "../analytics/favicon-image";
import { TruncatedText } from "../ui/truncated-text";

export interface ReferrerSourceCellData {
	domain?: string;
	id?: string;
	name?: string;
	referrer?: string;
	referrer_type?: string;
	source?: string;
}

type ReferrerSourceCellProps = ReferrerSourceCellData & {
	className?: string;
};

export const ReferrerSourceCell: React.FC<ReferrerSourceCellProps> = ({
	id,
	name,
	referrer,
	domain,
	referrer_type,
	source,
	className,
}) => {
	const rawSource = getRawSource({ name, referrer, source });
	const parsedSource = parseReferrer(rawSource || name);
	const isDirectType = referrer_type === "direct";
	const displayName = isDirectType
		? "Direct"
		: getDisplayName(name, parsedSource.name, rawSource);
	const displayDomain = isDirectType ? "" : domain || parsedSource.domain;
	const textClassName = className
		? `${className} font-medium text-[15px]`
		: "font-medium text-[15px]";
	const isAI = referrer_type === "ai";
	const isDirect = displayName.toLowerCase() === "direct";

	if (isDirect || !displayDomain) {
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
			href={`https://${displayDomain.trim()}`}
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
				domain={displayDomain}
				size={18}
			/>
			<TruncatedText
				className={cn("min-w-0 truncate", textClassName)}
				text={displayName}
			/>
			{isAI ? (
				<span className="shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 font-medium text-[10px] text-purple-500 leading-none">
					AI
				</span>
			) : null}
		</a>
	);
};

function getRawSource({
	name,
	referrer,
	source,
}: Pick<ReferrerSourceCellData, "name" | "referrer" | "source">): string {
	if (source) {
		return source;
	}
	if (referrer) {
		return referrer;
	}
	if (name && isRawReferrerValue(name)) {
		return name;
	}
	return "";
}

function getDisplayName(
	name: string | undefined,
	parsedName: string,
	rawSource: string
): string {
	if (name && !isRawReferrerValue(name)) {
		return name;
	}
	return parsedName || rawSource || "Direct";
}

function isRawReferrerValue(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return (
		normalized === "" ||
		normalized === "direct" ||
		normalized.startsWith("http://") ||
		normalized.startsWith("https://") ||
		(normalized.includes(".") && !normalized.includes(" "))
	);
}
