"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BrandingColorSwatchProps {
	hex: string;
	name: string;
	usage: string;
	textColor?: "light" | "dark";
}

export function BrandingColorSwatch({
	hex,
	name,
	usage,
	textColor = "light",
}: BrandingColorSwatchProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(hex);
		toast.success(`${hex} copied`);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	}, [hex]);

	return (
		<button
			className="group flex flex-col overflow-hidden rounded border border-border text-left transition-all hover:shadow-sm"
			onClick={handleCopy}
			type="button"
		>
			<div
				className={cn(
					"relative flex h-24 items-end p-3 sm:h-28",
					textColor === "light" ? "text-white" : "text-neutral-900"
				)}
				style={{ backgroundColor: hex }}
			>
				<span className="font-mono text-xs opacity-80 transition-opacity group-hover:opacity-100">
					{hex}
				</span>
				<div className="absolute top-2 right-2">
					{copied ? (
						<CheckIcon className="size-4 text-emerald-400" weight="bold" />
					) : (
						<CopyIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-70" />
					)}
				</div>
			</div>
			<div className="flex flex-col gap-0.5 bg-background p-3">
				<span className="font-medium text-foreground text-sm">{name}</span>
				<span className="text-muted-foreground text-xs">{usage}</span>
			</div>
		</button>
	);
}
