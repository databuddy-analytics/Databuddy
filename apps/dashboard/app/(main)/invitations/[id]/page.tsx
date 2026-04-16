"use client";

import { authClient } from "@databuddy/auth/client";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { BuildingsIcon } from "@phosphor-icons/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { ClockIcon } from "@phosphor-icons/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { UserPlusIcon } from "@phosphor-icons/react";
import { XCircleIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../websites/_components/page-header";

interface InvitationData {
	email: string;
	expiresAt: Date;
	id: string;
	inviterEmail: string;
	inviterId: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	role: string;
	status: "pending" | "accepted" | "rejected" | "canceled";
	teamId?: string;
}

type ActionStatus = "idle" | "accepting" | "success";

function ContentSkeleton() {
	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<div className="w-full max-w-md space-y-6">
				<div className="flex justify-center">
					<Skeleton className="size-16 rounded" />
				</div>
				<div className="space-y-3 text-center">
					<Skeleton className="mx-auto h-7 w-48" />
					<Skeleton className="mx-auto h-5 w-64" />
				</div>
				<div className="space-y-4 rounded border p-4">
					<div className="flex items-center gap-3">
						<Skeleton className="size-10 rounded" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-24" />
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Skeleton className="size-10 rounded" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-40" />
						</div>
					</div>
				</div>
				<div className="flex gap-3">
					<Skeleton className="h-10 flex-1" />
					<Skeleton className="h-10 w-28" />
				</div>
			</div>
		</div>
	);
}

function formatRole(role: string) {
	return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function InvitationDetails({
	invitation,
	actionStatus,
	onAcceptAction,
	onDeclineAction,
}: {
	invitation: InvitationData;
	actionStatus: ActionStatus;
	onAcceptAction: () => void;
	onDeclineAction: () => void;
}) {
	const isExpiringSoon = dayjs(invitation.expiresAt).diff(dayjs(), "day") <= 1;

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-md space-y-6">
				<div className="flex justify-center">
					<div className="rounded border bg-secondary p-4">
						<UserPlusIcon
							className="size-8 text-accent-foreground"
							weight="fill"
						/>
					</div>
				</div>

				<div className="space-y-2 text-balance text-center">
					<h2 className="font-medium text-foreground text-xl">
						You're invited to join
					</h2>
					<p className="font-medium text-2xl text-foreground">
						{invitation.organizationName}
					</p>
					<p className="text-muted-foreground text-sm">
						<span className="font-medium text-foreground">
							{invitation.inviterEmail}
						</span>{" "}
						invited you as a{" "}
						<Badge className="ml-1" variant="secondary">
							{formatRole(invitation.role)}
						</Badge>
					</p>
				</div>

				<div className="space-y-3 rounded border bg-card p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded bg-secondary">
							<BuildingsIcon
								className="size-5 text-accent-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-foreground text-sm">
								{invitation.organizationName}
							</p>
							<p className="text-muted-foreground text-xs">
								{invitation.organizationSlug
									? `@${invitation.organizationSlug}`
									: "Organization"}
							</p>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<div
							className={cn(
								"flex size-10 shrink-0 items-center justify-center rounded",
								isExpiringSoon ? "bg-amber-500/10" : "bg-secondary"
							)}
						>
							<ClockIcon
								className={cn(
									"size-5",
									isExpiringSoon
										? "text-amber-600 dark:text-amber-400"
										: "text-accent-foreground"
								)}
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-foreground text-sm">
								{isExpiringSoon ? "Expires soon" : "Expires"}
							</p>
							<p className="text-muted-foreground text-xs">
								{dayjs(invitation.expiresAt).fromNow()}
							</p>
						</div>
						{isExpiringSoon && <Badge variant="amber">Expiring</Badge>}
					</div>
				</div>

				<div className="flex flex-col gap-3 sm:flex-row">
					<Button
						className="flex-1 gap-2"
						disabled={actionStatus !== "idle"}
						onClick={onAcceptAction}
					>
						{actionStatus === "accepting" ? (
							<SpinnerGapIcon className="size-4 animate-spin" />
						) : (
							<UserPlusIcon className="size-4" weight="duotone" />
						)}
						{actionStatus === "accepting" ? "Joining…" : "Join Organization"}
					</Button>
					<Button
						disabled={actionStatus !== "idle"}
						onClick={onDeclineAction}
						variant="outline"
					>
						Maybe Later
					</Button>
				</div>
			</div>
		</div>
	);
}

function SuccessState({ organizationName }: { organizationName: string }) {
	const router = useRouter();

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="flex justify-center">
					<div className="rounded border border-green-500/20 bg-green-500/10 p-4">
						<CheckCircleIcon
							className="size-8 text-green-600 dark:text-green-400"
							weight="fill"
						/>
					</div>
				</div>

				<div className="space-y-2 text-balance">
					<h2 className="font-medium text-foreground text-xl">
						Welcome to {organizationName}!
					</h2>
					<p className="text-muted-foreground text-sm">
						You now have access to all projects and resources.
					</p>
				</div>

				<Button className="gap-2" onClick={() => router.push("/websites")}>
					Go to Dashboard
					<ArrowRightIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}

function ExpiredState() {
	const router = useRouter();

	return (
		<EmptyState
			action={{
				label: "Back to Home",
				onClick: () => router.push("/websites"),
			}}
			description="This invitation has expired or is no longer valid. Please contact the organization admin for a new invitation."
			icon={<XCircleIcon />}
			title="Invitation Expired"
			variant="error"
		/>
	);
}

function AlreadyMemberState({
	organizationName,
}: {
	organizationName: string;
}) {
	const router = useRouter();

	return (
		<EmptyState
			action={{
				label: "Go to Dashboard",
				onClick: () => router.push("/websites"),
			}}
			description={`You're already a member of ${organizationName}.`}
			icon={<CheckCircleIcon />}
			title="Already a Member"
			variant="minimal"
		/>
	);
}

function ErrorState({ message }: { message: string }) {
	const router = useRouter();

	return (
		<EmptyState
			action={{
				label: "Back to Home",
				onClick: () => router.push("/websites"),
			}}
			description={message}
			icon={<XCircleIcon />}
			title="Something went wrong"
			variant="error"
		/>
	);
}

export default function AcceptInvitationPage() {
	const router = useRouter();
	const params = useParams();
	const queryClient = useQueryClient();
	const invitationId = params.id as string;

	const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");

	const {
		data: invitation,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["invitation", invitationId],
		queryFn: async () => {
			const { data, error: fetchError } =
				await authClient.organization.getInvitation({
					query: { id: invitationId },
				});

			if (fetchError || !data) {
				throw new Error(fetchError?.message || "Failed to load invitation");
			}

			return data as InvitationData;
		},
		enabled: Boolean(invitationId),
		retry: false,
	});

	const handleAccept = useCallback(async () => {
		if (!invitation) {
			return;
		}

		setActionStatus("accepting");

		const result = await authClient.organization.acceptInvitation({
			invitationId,
		});

		if (result.data) {
			setActionStatus("success");
			queryClient.invalidateQueries({
				queryKey: orpc.organizations.getUserPendingInvitations.key(),
			});
		} else {
			setActionStatus("idle");
		}
	}, [invitation, invitationId, queryClient]);

	const handleDecline = useCallback(() => {
		router.push("/websites");
	}, [router]);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<PageHeader
					description="Loading invitation…"
					icon={<UserPlusIcon />}
					title="Invitation"
				/>
				<ContentSkeleton />
			</div>
		);
	}

	if (error) {
		const isExpired =
			error.message?.includes("expired") ||
			error.message?.includes("not found");
		return (
			<div className="flex h-full flex-col">
				<PageHeader
					description="Unable to process invitation"
					icon={<UserPlusIcon />}
					title="Invitation"
				/>
				{isExpired ? <ExpiredState /> : <ErrorState message={error.message} />}
			</div>
		);
	}

	if (!invitation) {
		return (
			<div className="flex h-full flex-col">
				<PageHeader
					description="Invitation not found"
					icon={<UserPlusIcon />}
					title="Invitation"
				/>
				<ErrorState message="Invitation not found" />
			</div>
		);
	}

	const isExpired =
		invitation.status === "canceled" ||
		invitation.status === "rejected" ||
		new Date(invitation.expiresAt) < new Date();

	const isAlreadyAccepted = invitation.status === "accepted";

	const getDescription = () => {
		if (actionStatus === "success") {
			return "Successfully joined";
		}
		if (isAlreadyAccepted) {
			return "Already a member";
		}
		if (isExpired) {
			return "Invitation expired";
		}
		return `Join ${invitation.organizationName}`;
	};

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description={getDescription()}
				icon={<UserPlusIcon />}
				title="Invitation"
			/>

			{actionStatus === "success" ? (
				<SuccessState organizationName={invitation.organizationName} />
			) : isAlreadyAccepted ? (
				<AlreadyMemberState organizationName={invitation.organizationName} />
			) : isExpired ? (
				<ExpiredState />
			) : (
				<InvitationDetails
					actionStatus={actionStatus}
					invitation={invitation}
					onAcceptAction={handleAccept}
					onDeclineAction={handleDecline}
				/>
			)}
		</div>
	);
}
