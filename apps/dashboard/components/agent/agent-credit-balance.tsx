"use client";

import { useAtomValue } from "jotai";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
	useBillingContext,
	useUsageFeature,
} from "@/components/providers/billing-provider";
import { useChatSafe } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { CoinsIcon } from "@databuddy/ui/icons";
import { Button, Skeleton, Tooltip } from "@databuddy/ui";
import { agentCreditShakeNonceAtom } from "./agent-atoms";

interface AgentCreditBalanceProps {
	variant?: "default" | "compact";
}

export function AgentCreditBalance({
	variant = "default",
}: AgentCreditBalanceProps) {
	const { balance, limit, unlimited } = useUsageFeature("agent_credits");
	const { refetch, isLoading } = useBillingContext();
	const chat = useChatSafe();
	const status = chat?.status ?? "ready";
	const router = useRouter();
	const shakeNonce = useAtomValue(agentCreditShakeNonceAtom);
	const prevStatusRef = useRef(status);

	useEffect(() => {
		const prev = prevStatusRef.current;
		prevStatusRef.current = status;
		const justFinished =
			(prev === "streaming" || prev === "submitted") &&
			(status === "ready" || status === "error");
		if (!justFinished) {
			return;
		}
		const timer = setTimeout(() => refetch(), 1500);
		return () => clearTimeout(timer);
	}, [status, refetch]);

	if (isLoading) {
		return (
			<Skeleton
				className={cn(
					"rounded",
					variant === "compact" ? "h-8 w-10" : "h-8 w-20"
				)}
			/>
		);
	}

	if (unlimited) {
		if (variant === "compact") {
			return null;
		}
		return (
			<Tooltip content="Unlimited agent credits on your plan">
				<Button
					className="gap-1 border border-border/60 bg-card px-2 text-muted-foreground text-xs hover:border-border hover:bg-card hover:text-foreground"
					onClick={() => router.push("/billing")}
					size="sm"
					variant="secondary"
				>
					<CoinsIcon className="size-3" />
					<span className="font-medium tabular-nums">Unlimited</span>
				</Button>
			</Tooltip>
		);
	}

	const isEmpty = balance <= 0;
	const isLow = !isEmpty && limit > 0 && balance / limit < 0.2;
	const label =
		variant === "compact"
			? `${balance.toLocaleString()}`
			: `${balance.toLocaleString()} / ${limit.toLocaleString()}`;

	return (
		<Tooltip
			content={
				isEmpty
					? "Out of agent credits - click to upgrade"
					: `${balance.toLocaleString()} of ${limit.toLocaleString()} agent credits remaining this month`
			}
		>
			<motion.div
				animate={
					shakeNonce === 0 ? { x: 0 } : { x: [0, -2, 2, -2, 2, 0] }
				}
				className="inline-flex max-w-full"
				initial={{ x: 0 }}
				key={shakeNonce}
				transition={{ duration: 0.18, ease: "easeOut" }}
			>
				<Button
					className={cn(
						"gap-1.5 border px-2 text-xs",
						variant === "compact" && "px-1.5 text-[11px]",
						isEmpty &&
							"border-destructive/40 bg-destructive/5 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive",
						isLow &&
							"border-amber-500/40 bg-amber-500/5 text-amber-600 hover:border-amber-500/60 hover:bg-amber-500/10 dark:text-amber-400",
						!(isEmpty || isLow) &&
							"border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
					)}
					onClick={() => router.push(isEmpty ? "/billing#topup" : "/billing")}
					size="sm"
					variant="secondary"
				>
					{variant === "compact" ? null : (
						<CoinsIcon className="size-3" />
					)}
					<span className="font-medium tabular-nums">{label}</span>
				</Button>
			</motion.div>
		</Tooltip>
	);
}
