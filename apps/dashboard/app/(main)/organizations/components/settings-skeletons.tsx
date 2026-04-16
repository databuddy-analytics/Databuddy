import { RightSidebar } from "@/components/right-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

function SettingsShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col border-b lg:border-b-0">{children}</div>
			<RightSidebar.Skeleton />
		</div>
	);
}

function MemberRowSkeleton() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-56" />
			</div>
			<Skeleton className="h-8 w-24 rounded" />
			<Skeleton className="size-7 rounded" />
		</div>
	);
}

export function MembersSkeleton() {
	return (
		<SettingsShell>
			<div className="flex-1 divide-y overflow-y-auto">
				<MemberRowSkeleton />
				<MemberRowSkeleton />
				<MemberRowSkeleton />
				<MemberRowSkeleton />
			</div>
		</SettingsShell>
	);
}

function InvitationRowSkeleton() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-40" />
			</div>
			<Skeleton className="h-8 w-20 rounded" />
		</div>
	);
}

export function InvitationsSkeleton() {
	return (
		<SettingsShell>
			<div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
				<Skeleton className="h-9 w-24 rounded" />
				<Skeleton className="h-9 w-24 rounded" />
				<Skeleton className="h-9 w-24 rounded" />
			</div>
			<div className="flex-1 divide-y overflow-y-auto">
				<InvitationRowSkeleton />
				<InvitationRowSkeleton />
				<InvitationRowSkeleton />
			</div>
		</SettingsShell>
	);
}

export function MembersPageSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-10 shrink-0 items-center gap-5 border-b bg-accent/30 px-3">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-4 w-24" />
			</div>
			<div className="min-h-0 flex-1">
				<MembersSkeleton />
			</div>
		</div>
	);
}

function ApiKeyRowSkeleton() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded border" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-40" />
				<div className="flex items-center gap-3">
					<Skeleton className="h-4 w-20 rounded" />
					<Skeleton className="h-3 w-28" />
				</div>
			</div>
			<Skeleton className="h-6 w-16 rounded" />
			<Skeleton className="size-4" />
		</div>
	);
}

export function ApiKeysSkeleton() {
	return (
		<SettingsShell>
			<div className="flex-1 divide-y overflow-y-auto">
				<ApiKeyRowSkeleton />
				<ApiKeyRowSkeleton />
				<ApiKeyRowSkeleton />
			</div>
		</SettingsShell>
	);
}

export function GeneralSettingsSkeleton() {
	return (
		<SettingsShell>
			<div className="flex-1 overflow-y-auto">
				<section className="space-y-4 border-b px-5 py-6">
					<div className="space-y-1.5">
						<Skeleton className="h-4 w-44" />
						<Skeleton className="h-3 w-60" />
					</div>
					<div className="flex items-center gap-4">
						<Skeleton className="size-16 rounded-full" />
						<Skeleton className="h-9 w-28 rounded" />
					</div>
				</section>

				<section className="space-y-4 border-b px-5 py-6">
					<div className="space-y-1.5">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-3 w-80" />
					</div>
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-3.5 w-32" />
							<Skeleton className="h-4 w-64" />
						</div>
						<Skeleton className="h-8 w-20 rounded" />
					</div>
					{/* Name + slug inputs */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-3 w-48" />
						</div>
						<div className="space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-3 w-56" />
						</div>
					</div>
				</section>

				<section className="border-b px-5 py-6">
					<div className="mb-4 flex items-start justify-between gap-4">
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-56" />
							<Skeleton className="h-3 w-72" />
						</div>
						<Skeleton className="h-8 w-28 rounded" />
					</div>
					<div className="divide-y rounded border">
						{["a", "b", "c"].map((k) => (
							<div
								className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
								key={`site-${k}`}
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
				</section>
			</div>
		</SettingsShell>
	);
}

export function DangerZoneSkeleton() {
	return (
		<SettingsShell>
			<div className="flex flex-col gap-6 p-5">
				<section className="space-y-4">
					<div className="space-y-1.5">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-80" />
					</div>
					<Skeleton className="h-14 w-full rounded" />
					<Skeleton className="h-40 w-full rounded" />
				</section>

				<section className="mt-auto rounded border border-destructive/20 bg-destructive/5 p-4">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-64" />
						</div>
						<Skeleton className="h-8 w-20 rounded" />
					</div>
				</section>
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
