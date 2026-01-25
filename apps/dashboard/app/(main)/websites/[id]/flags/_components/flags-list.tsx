"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FlagRow } from "./flag-row";
import type { Flag, TargetGroup } from "./types";

interface FlagsListProps {
	flags: Flag[];
	groups: Map<string, TargetGroup[]>;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
}

export function FlagsList({ flags, groups, onEdit, onDelete }: FlagsListProps) {
	const flagMap = useMemo(() => {
		const map = new Map<string, Flag>();
		for (const f of flags) {
			map.set(f.key, f);
		}
		return map;
	}, [flags]);

	const dependentsMap = useMemo(() => {
		const map = new Map<string, Flag[]>();
		for (const f of flags) {
			if (f.dependencies) {
				for (const depKey of f.dependencies) {
					const existing = map.get(depKey) || [];
					existing.push(f);
					map.set(depKey, existing);
				}
			}
		}
		return map;
	}, [flags]);

	return (
		<div className="w-full overflow-x-auto">
			{flags.map((flag) => (
				<FlagRow
					dependents={dependentsMap.get(flag.key) ?? []}
					flag={flag}
					flagMap={flagMap}
					groups={groups.get(flag.id) ?? []}
					key={flag.id}
					onDelete={onDelete}
					onEdit={onEdit}
				/>
			))}
		</div>
	);
}

export function FlagsListSkeleton() {
	return (
		<div className="w-full overflow-x-auto">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex items-center gap-4 border-b px-4 py-3"
					key={`skeleton-${i + 1}`}
				>
					<div className="flex min-w-[280px] shrink-0 items-center gap-3">
						<Skeleton className="size-7 rounded" />
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-5 w-20" />
					</div>
					<div className="min-w-[300px] flex-1">
						<Skeleton className="h-3 w-48" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-9 w-9 rounded-full" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-3 w-12" />
					</div>
					<div className="w-[100px] shrink-0">
						<Skeleton className="h-4 w-12" />
					</div>
					<div className="w-[120px] shrink-0">
						<Skeleton className="h-5 w-14" />
					</div>
					<div className="w-[60px] shrink-0">
						<Skeleton className="size-8 rounded" />
					</div>
				</div>
			))}
		</div>
	);
}
