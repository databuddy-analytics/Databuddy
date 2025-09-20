'use client';

import { CaretDownIcon, CaretUpIcon, FlagIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { FlagActions } from './flag-actions';
import type { Flag } from './types';

interface FlagRowProps {
	flag: Flag;
	onEdit: () => void;
	isExpanded?: boolean;
	onToggle?: (flagId: string) => void;
	children?: React.ReactNode;
}

export function FlagRow({
	flag,
	onEdit,
	isExpanded = false,
	onToggle,
	children,
}: FlagRowProps) {
	const [_isArchiving, _setIsArchiving] = useState(false);

	const utils = trpc.useUtils();

	const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement;
		if (target.closest('button')) {
			return;
		}
		if (onToggle) {
			onToggle(flag.id);
		}
	};

	const getStatusBadge = (status: string) => {
		if (status === 'active') {
			return (
				<span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-0.5 text-green-700 text-xs dark:border-green-900/60 dark:bg-green-950 dark:text-green-300">
					<span className="h-1.5 w-1.5 rounded bg-green-500" />
					Active
				</span>
			);
		}
		if (status === 'inactive') {
			return (
				<span className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
					<span className="h-1.5 w-1.5 rounded bg-zinc-400" />
					Inactive
				</span>
			);
		}
		if (status === 'archived') {
			return (
				<span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 text-xs dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-300">
					<span className="h-1.5 w-1.5 rounded bg-amber-500" />
					Archived
				</span>
			);
		}
		return (
			<span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-muted-foreground text-xs">
				{status}
			</span>
		);
	};

	const ruleCount = Array.isArray(flag.rules) ? flag.rules.length : 0;
	const rollout =
		typeof flag.rolloutPercentage === 'number' ? flag.rolloutPercentage : 0;
	const isBooleanFlag = String(flag.type).toLowerCase() === 'boolean';
	const defaultLabel =
		isBooleanFlag && typeof flag.defaultValue === 'boolean'
			? `Default: ${flag.defaultValue ? 'On' : 'Off'}`
			: undefined;

	return (
		<Card
			className={`mb-4 cursor-pointer select-none overflow-hidden rounded border bg-background transition focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
				flag.status === 'active'
					? 'border-l-4 border-l-green-500'
					: flag.status === 'inactive'
						? 'border-l-4 border-l-zinc-400'
						: 'border-l-4 border-l-amber-500'
			}`}
			onClick={handleCardClick}
			onKeyDown={(e) => {
				if ((e.key === 'Enter' || e.key === ' ') && onToggle) {
					onToggle(flag.id);
				}
			}}
			style={{ outline: 'none' }}
			tabIndex={0}
		>
			<div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
				<div className="flex flex-grow flex-col text-left">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<h3
							className="mr-2 truncate font-mono font-semibold text-base"
							style={{ color: 'var(--color-foreground)' }}
						>
							{flag.key}
						</h3>
						{getStatusBadge(flag.status)}
						{/* Compact info chips */}
						<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
							<FlagIcon className="h-3 w-3" weight="duotone" />
							<span className="capitalize">{flag.type}</span>
						</span>
						{rollout > 0 && (
							<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
								<span className="h-1.5 w-1.5 rounded bg-primary" />
								{rollout}% rollout
							</span>
						)}
						{ruleCount > 0 && (
							<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
								{ruleCount} rule{ruleCount !== 1 ? 's' : ''}
							</span>
						)}
						{defaultLabel && (
							<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
								{defaultLabel}
							</span>
						)}
					</div>
					{flag.name && (
						<p className="mb-1 font-medium text-foreground text-sm">
							{flag.name}
						</p>
					)}
					{flag.description && (
						<p className="line-clamp-2 text-muted-foreground text-sm">
							{flag.description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<FlagActions
						flag={flag}
						onDeleted={() => utils.flags.list.invalidate()}
						onEdit={() => onEdit()}
					/>
					{onToggle && (
						<Button
							className="focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
							onClick={(e) => {
								e.stopPropagation();
								onToggle(flag.id);
							}}
							size="icon"
							type="button"
							variant="ghost"
						>
							{isExpanded ? (
								<CaretUpIcon className="h-4 w-4" weight="fill" />
							) : (
								<CaretDownIcon className="h-4 w-4" weight="fill" />
							)}
						</Button>
					)}
				</div>
			</div>
			{isExpanded && (
				<div className="border-border border-t bg-muted/30">
					<div className="p-4">{children}</div>
				</div>
			)}
		</Card>
	);
}
