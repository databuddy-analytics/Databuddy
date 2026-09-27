import { Card, Skeleton } from "@databuddy/ui";

function SettingsShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-y-auto">{children}</div>
		</div>
	);
}

function MemberRowSkeleton() {
	return (
		<div className="flex items-center gap-3 px-5 py-3">
			<Skeleton className="size-10 rounded-full" />
			<div className="min-w-0 flex-1 space-y-1">
				<Skeleton className="h-3.5 w-28" />
				<Skeleton className="h-3 w-44" />
			</div>
			<Skeleton className="h-5 w-14 rounded-full" />
		</div>
	);
}

export function MembersSkeleton() {
	return (
		<Card>
			<Card.Header className="flex-row items-start justify-between gap-4">
				<div className="space-y-1">
					<Skeleton className="h-3.5 w-16" />
					<Skeleton className="h-3 w-24" />
				</div>
				<Skeleton className="h-6 w-16 rounded-md" />
			</Card.Header>
			<Card.Content className="p-0">
				<div className="divide-y">
					<MemberRowSkeleton />
					<MemberRowSkeleton />
					<MemberRowSkeleton />
				</div>
			</Card.Content>
		</Card>
	);
}

function InvitationRowSkeleton() {
	return (
		<div className="flex items-center gap-3 px-5 py-3">
			<Skeleton className="size-8 rounded-full" />
			<div className="min-w-0 flex-1 space-y-1">
				<Skeleton className="h-3.5 w-40" />
				<Skeleton className="h-3 w-32" />
			</div>
			<Skeleton className="h-5 w-14 rounded-full" />
			<Skeleton className="size-7 rounded-md" />
		</div>
	);
}

export function InvitationsSkeleton() {
	return (
		<Card>
			<Card.Header className="flex-row items-start justify-between gap-4">
				<div className="space-y-1">
					<Skeleton className="h-3.5 w-20" />
					<Skeleton className="h-3 w-36" />
				</div>
				<Skeleton className="h-6 w-16 rounded-md" />
			</Card.Header>
			<Card.Content className="p-0">
				<div className="divide-y">
					<InvitationRowSkeleton />
					<InvitationRowSkeleton />
				</div>
			</Card.Content>
		</Card>
	);
}

export function MembersPageSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-6 p-5">
			<MembersSkeleton />
			<InvitationsSkeleton />
		</div>
	);
}

export function GeneralSettingsSkeleton() {
	return (
		<SettingsShell>
			<div className="mx-auto max-w-4xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Skeleton className="h-3.5 w-44" />
						<Skeleton className="h-3 w-60" />
					</Card.Header>
					<Card.Content>
						<div className="flex items-center gap-4">
							<Skeleton className="size-10 rounded-full" />
							<div className="space-y-1">
								<Skeleton className="h-3.5 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
						</div>
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Skeleton className="h-3.5 w-48" />
						<Skeleton className="h-3 w-80" />
					</Card.Header>
					<Card.Content className="space-y-4">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0 flex-1 space-y-1">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-3 w-64" />
							</div>
							<Skeleton className="h-6 w-16 rounded" />
						</div>
						<Skeleton className="h-px w-full" />
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Skeleton className="h-3 w-32" />
								<Skeleton className="h-8 w-full rounded-md" />
								<Skeleton className="h-3 w-48" />
							</div>
							<div className="space-y-2">
								<Skeleton className="h-3 w-28" />
								<Skeleton className="h-8 w-full rounded-md" />
								<Skeleton className="h-3 w-56" />
							</div>
						</div>
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Skeleton className="h-3.5 w-56" />
						<Skeleton className="h-3 w-72" />
					</Card.Header>
					<Card.Content className="p-0">
						<div className="divide-y">
							{["a", "b", "c"].map((k) => (
								<div
									className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
									key={k}
								>
									<Skeleton className="size-8 rounded" />
									<div className="space-y-1.5">
										<Skeleton className="h-3.5 w-32" />
										<Skeleton className="h-3 w-48" />
									</div>
									<Skeleton className="size-4" />
								</div>
							))}
						</div>
					</Card.Content>
				</Card>
			</div>
		</SettingsShell>
	);
}

function OrgListRowSkeleton() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-24" />
			</div>
			<Skeleton className="h-6 w-14 rounded" />
		</div>
	);
}

export function OrganizationsListSkeleton() {
	return (
		<SettingsShell>
			<div className="flex-1 divide-y overflow-y-auto">
				<OrgListRowSkeleton />
				<OrgListRowSkeleton />
				<OrgListRowSkeleton />
			</div>
		</SettingsShell>
	);
}
