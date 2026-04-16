"use client";

import type { IconProps } from "@phosphor-icons/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { LightbulbFilamentIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { ProhibitIcon } from "@phosphor-icons/react";
import { RobotIcon } from "@phosphor-icons/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { TrendUpIcon } from "@phosphor-icons/react";
import { WaveformIcon } from "@phosphor-icons/react";
import { XCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	getFeatureDescription,
	getFeatureLabel,
	getFeatureRoute,
} from "@/lib/feature-gates";
import { orpc } from "@/lib/orpc";

type PhosphorIcon = ForwardRefExoticComponent<
	IconProps & RefAttributes<SVGSVGElement>
>;

const FLAG_KEY_ICONS: Record<string, PhosphorIcon> = {
	monitors: HeartbeatIcon,
	insights: LightbulbFilamentIcon,
	revenue: TrendUpIcon,
	anomalies: WaveformIcon,
	pulse: LightningIcon,
	agent: RobotIcon,
};

function getFeatureIcon(flagKey: string): PhosphorIcon {
	return FLAG_KEY_ICONS[flagKey] ?? LightningIcon;
}

function SuccessState({ flagKey }: { flagKey: string }) {
	const router = useRouter();
	const label = getFeatureLabel(flagKey);
	const description = getFeatureDescription(flagKey);
	const FeatureIcon = getFeatureIcon(flagKey);

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-sm space-y-6 text-center">
				<div className="flex justify-center">
					<div className="rounded border border-green-500/20 bg-green-500/10 p-4">
						<CheckCircleIcon
							className="size-8 text-green-600 dark:text-green-400"
							weight="fill"
						/>
					</div>
				</div>

				<div className="space-y-2 text-balance">
					<h2 className="font-semibold text-foreground text-xl">
						Welcome to {label}
					</h2>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>

				<div className="rounded border bg-card p-3">
					<div className="flex items-center gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary">
							<FeatureIcon
								className="size-4.5 text-foreground"
								weight="duotone"
							/>
						</div>
						<div className="text-left">
							<p className="font-medium text-foreground text-sm">{label}</p>
							<p className="text-muted-foreground text-xs">
								Permanently unlocked
							</p>
						</div>
					</div>
				</div>

				<Button
					className="w-full gap-2"
					onClick={() => router.push(getFeatureRoute(flagKey))}
				>
					Get Started
					<ArrowRightIcon className="size-4" weight="fill" />
				</Button>
			</div>
		</div>
	);
}

function ErrorState({
	title,
	message,
	icon,
}: {
	title: string;
	message: string;
	icon: React.ReactNode;
}) {
	const router = useRouter();

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-sm space-y-6 text-center">
				<div className="flex justify-center">
					<div className="rounded border border-destructive/20 bg-destructive/10 p-4">
						{icon}
					</div>
				</div>

				<div className="space-y-2 text-balance">
					<h2 className="font-medium text-foreground text-xl">{title}</h2>
					<p className="text-muted-foreground text-sm">{message}</p>
				</div>

				<Button onClick={() => router.push("/home")} variant="outline">
					Back to Home
				</Button>
			</div>
		</div>
	);
}

function classifyError(error: unknown): {
	title: string;
	message: string;
	icon: React.ReactNode;
} {
	const msg = error instanceof Error ? error.message.toLowerCase() : "";

	if (msg.includes("revoked")) {
		return {
			title: "Link Revoked",
			message:
				"This invite link has been revoked. Ask the person who shared it for a new one.",
			icon: (
				<ProhibitIcon className="size-8 text-destructive" weight="duotone" />
			),
		};
	}

	if (msg.includes("already been redeemed")) {
		return {
			title: "Already Claimed",
			message:
				"This invite link has already been used by someone else. Ask for a new link.",
			icon: (
				<XCircleIcon className="size-8 text-destructive" weight="duotone" />
			),
		};
	}

	if (msg.includes("not found")) {
		return {
			title: "Link Not Found",
			message:
				"This invite link doesn't exist or is invalid. Double-check the link and try again.",
			icon: (
				<XCircleIcon className="size-8 text-destructive" weight="duotone" />
			),
		};
	}

	return {
		title: "Something Went Wrong",
		message:
			error instanceof Error
				? error.message
				: "An unexpected error occurred. Please try again.",
		icon: <XCircleIcon className="size-8 text-destructive" weight="duotone" />,
	};
}

function LoadingState() {
	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="flex flex-col items-center gap-4">
				<SpinnerGapIcon className="size-6 animate-spin text-muted-foreground" />
				<p className="text-muted-foreground text-sm">Loading invite...</p>
			</div>
		</div>
	);
}

function RedeemPrompt({
	flagKey,
	isPending,
	onRedeemAction,
}: {
	flagKey: string;
	isPending: boolean;
	onRedeemAction: () => void;
}) {
	const router = useRouter();
	const label = getFeatureLabel(flagKey);
	const description = getFeatureDescription(flagKey);
	const FeatureIcon = getFeatureIcon(flagKey);

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-sm space-y-6 text-center">
				<div className="flex justify-center">
					<div className="rounded border bg-secondary p-4">
						<FeatureIcon className="size-8 text-foreground" weight="duotone" />
					</div>
				</div>

				<div className="space-y-2 text-balance">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						You've been invited to
					</p>
					<h2 className="font-semibold text-foreground text-xl">{label}</h2>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>

				<div className="rounded border bg-card p-3 text-left">
					<ul className="space-y-2 text-muted-foreground text-xs">
						<li className="flex items-start gap-2">
							<CheckCircleIcon
								className="mt-0.5 size-3.5 shrink-0 text-green-600"
								weight="fill"
							/>
							Permanent access — no expiration
						</li>
						<li className="flex items-start gap-2">
							<CheckCircleIcon
								className="mt-0.5 size-3.5 shrink-0 text-green-600"
								weight="fill"
							/>
							Invite-only — not publicly available
						</li>
						<li className="flex items-start gap-2">
							<CheckCircleIcon
								className="mt-0.5 size-3.5 shrink-0 text-green-600"
								weight="fill"
							/>
							You'll get your own invite links to share
						</li>
					</ul>
				</div>

				<div className="flex flex-col gap-2">
					<Button
						className="w-full gap-2"
						disabled={isPending}
						onClick={onRedeemAction}
					>
						{isPending ? (
							<SpinnerGapIcon className="size-4 animate-spin" />
						) : null}
						{isPending ? "Unlocking…" : "Unlock Access"}
					</Button>
					<Button
						className="w-full"
						disabled={isPending}
						onClick={() => router.push("/home")}
						variant="ghost"
					>
						Maybe Later
					</Button>
				</div>
			</div>
		</div>
	);
}

export default function RedeemInvitePage() {
	const params = useParams();
	const token = params.token as string;

	const {
		data: peek,
		isLoading: isPeekLoading,
		isError: isPeekError,
		error: peekError,
	} = useQuery({
		...orpc.featureInvite.peekLink.queryOptions({
			input: { token },
		}),
		retry: false,
	});

	const {
		mutate: redeem,
		data,
		isPending,
		isSuccess,
		isError: isRedeemError,
		error: redeemError,
	} = useMutation({
		mutationFn: () => orpc.featureInvite.redeemLink.call({ token }),
	});

	const handleRedeem = useCallback(() => {
		redeem();
	}, [redeem]);

	if (isPeekLoading) {
		return (
			<div className="flex h-dvh flex-col">
				<LoadingState />
			</div>
		);
	}

	if (isSuccess && data) {
		return (
			<div className="flex h-dvh flex-col">
				<SuccessState flagKey={data.flagKey} />
			</div>
		);
	}

	if (isPeekError) {
		const errInfo = classifyError(peekError);
		return (
			<div className="flex h-dvh flex-col">
				<ErrorState
					icon={errInfo.icon}
					message={errInfo.message}
					title={errInfo.title}
				/>
			</div>
		);
	}

	if (isRedeemError) {
		const errInfo = classifyError(redeemError);
		return (
			<div className="flex h-dvh flex-col">
				<ErrorState
					icon={errInfo.icon}
					message={errInfo.message}
					title={errInfo.title}
				/>
			</div>
		);
	}

	if (peek?.status === "redeemed") {
		return (
			<div className="flex h-dvh flex-col">
				<ErrorState
					icon={
						<XCircleIcon className="size-8 text-destructive" weight="duotone" />
					}
					message="This invite link has already been used by someone else. Ask for a new link."
					title="Already Claimed"
				/>
			</div>
		);
	}

	if (peek?.status === "revoked") {
		return (
			<div className="flex h-dvh flex-col">
				<ErrorState
					icon={
						<ProhibitIcon
							className="size-8 text-destructive"
							weight="duotone"
						/>
					}
					message="This invite link has been revoked. Ask the person who shared it for a new one."
					title="Link Revoked"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-dvh flex-col">
			<RedeemPrompt
				flagKey={peek?.flagKey ?? ""}
				isPending={isPending}
				onRedeemAction={handleRedeem}
			/>
		</div>
	);
}
