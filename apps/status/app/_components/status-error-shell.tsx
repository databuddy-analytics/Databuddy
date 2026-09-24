"use client";

import type { ReactNode } from "react";
import { Button } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import Image from "next/image";
import { DATABUDDY_UPTIME_URL, DATABUDDY_URL } from "@/lib/status-url";

interface StatusErrorShellProps {
	action?: ReactNode;
	code: string;
	description: string;
	detail?: ReactNode;
	title: string;
}

export function StatusErrorShell({
	action,
	code,
	description,
	detail,
	title,
}: StatusErrorShellProps) {
	return (
		<div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute select-none font-extrabold text-[120px] text-foreground opacity-[0.04] sm:text-[180px]"
			>
				{code}
			</div>

			<div className="relative flex w-full max-w-sm flex-col items-center text-center">
				<div className="relative mb-6">
					<div
						aria-hidden="true"
						className="absolute inset-[-20px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)]"
					/>
					<Image
						alt="Databuddy"
						className="relative block dark:hidden"
						height={72}
						priority
						src="/brand/logomark/black.svg"
						width={72}
					/>
					<Image
						alt=""
						aria-hidden
						className="relative hidden dark:block"
						height={72}
						priority
						src="/brand/logomark/white.svg"
						width={72}
					/>
					<span
						aria-hidden="true"
						className="absolute -top-2 -right-3.5 text-destructive opacity-70 motion-safe:animate-bounce"
					>
						<WarningCircleIcon className="size-5" />
					</span>
				</div>

				<div className="space-y-2">
					<p className="font-semibold text-[13px] text-purple-500 uppercase tracking-[0.15em] opacity-70">
						{code}
					</p>
					<h1 className="text-balance font-semibold text-foreground text-lg">
						{title}
					</h1>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
				</div>

				{detail ? (
					<div className="mt-3 font-mono text-muted-foreground/60 text-xs tabular-nums">
						{detail}
					</div>
				) : null}

				<div className="mt-6 flex w-full flex-col gap-3">
					{action ?? (
						<Button asChild className="w-full" size="lg">
							<a href={DATABUDDY_UPTIME_URL}>
								Open uptime
								<ArrowRightIcon className="ml-2 size-4" />
							</a>
						</Button>
					)}
					<Button asChild className="w-full" size="lg" variant="secondary">
						<a href={DATABUDDY_URL}>Databuddy home</a>
					</Button>
				</div>
			</div>
		</div>
	);
}

export function StatusRetryButton({ onClick }: { onClick: () => void }) {
	return (
		<Button className="w-full" onClick={onClick} size="lg">
			<ArrowClockwiseIcon className="mr-2 size-4" />
			Try again
		</Button>
	);
}
