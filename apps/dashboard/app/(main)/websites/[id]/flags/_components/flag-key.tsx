import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

export function FlagKey({
	flag,
	className,
	...props
}: { flag: Flag } & React.ComponentProps<"button">) {
	const { isCopied, copyToClipboard } = useCopyToClipboard();

	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>
				<Button
					className={cn(
						"h-4.5 font-mono text-xs has-[>svg]:px-1.5 dark:text-foreground/70",
						className
					)}
					onClick={() => copyToClipboard(flag.key)}
					size="sm"
					variant="ghost"
					{...props}
				>
					{flag.key}
					{isCopied ? (
						<CheckIcon className="size-3 text-green-500" />
					) : (
						<CopyIcon className="size-3 opacity-50" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{isCopied ? "Copied!" : "Click to copy key"}
			</TooltipContent>
		</Tooltip>
	);
}
