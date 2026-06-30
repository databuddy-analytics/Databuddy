"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "@databuddy/ui/icons";
import { EmptyState } from "@databuddy/ui";

interface ResourceUnavailableStateProps {
	backHref: string;
	backLabel: string;
	className?: string;
}

export function ResourceUnavailableState({
	backHref,
	backLabel,
	className,
}: ResourceUnavailableStateProps) {
	const router = useRouter();

	return (
		<EmptyState
			action={{
				label: backLabel,
				onClick: () => router.push(backHref),
				variant: "secondary",
			}}
			className={className}
			description="This resource is unavailable in the current workspace. Switch workspaces or check that you have access."
			icon={<LockIcon />}
			isMainContent
			title="Resource unavailable"
			variant="error"
		/>
	);
}
