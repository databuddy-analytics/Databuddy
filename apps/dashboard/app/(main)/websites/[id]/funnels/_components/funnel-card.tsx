'use client';

import {
	CaretDownIcon,
	CaretRightIcon,
	CaretUpIcon,
	DotsThreeIcon,
	FileTextIcon,
	FunnelIcon,
	MouseRightClickIcon,
	PencilIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Funnel } from '@/hooks/use-funnels';

interface FunnelCardProps {
	funnel: Funnel;
	isExpanded: boolean;
	onToggle: (funnelId: string) => void;
	onEdit: (funnel: Funnel) => void;
	onDelete: (funnelId: string) => void;
	children?: React.ReactNode;
}

const getStepIcon = (stepType: string) => {
	if (stepType === 'PAGE_VIEW') {
		return (
			<FileTextIcon
				className="mr-1 h-3 w-3"
				style={{ color: 'var(--color-primary)' }}
				weight="duotone"
			/>
		);
	}
	if (stepType === 'EVENT') {
		return (
			<MouseRightClickIcon
				className="mr-1 h-3 w-3"
				style={{ color: 'var(--color-warning)' }}
				weight="duotone"
			/>
		);
	}
	return (
		<DotsThreeIcon
			className="mr-1 h-3 w-3"
			style={{ color: 'var(--color-muted-foreground)' }}
			weight="duotone"
		/>
	);
};

const getStepTooltipText = (stepType: string, target: string) => {
	if (stepType === 'PAGE_VIEW') {
		return `Page: ${target}`;
	}
	if (stepType === 'EVENT') {
		return `Event: ${target}`;
	}
	return target;
};

export function FunnelCard({
	funnel,
	isExpanded,
	onToggle,
	onEdit,
	onDelete,
	children,
}: FunnelCardProps) {
	const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement;
		if (target.closest('button')) {
			return;
		}
		onToggle(funnel.id);
	};

	return (
		<Card
			className="mb-4 cursor-pointer select-none overflow-hidden border bg-background transition focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
			onClick={handleCardClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					onToggle(funnel.id);
				}
			}}
			style={{ outline: 'none' }}
			tabIndex={0}
		>
			<div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
				<div className="flex flex-grow flex-col text-left">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<h3
							className="mr-2 truncate font-semibold text-base"
							style={{ color: 'var(--color-foreground)' }}
						>
							{funnel.name}
						</h3>
						{(funnel.steps || []).map((step, index) => (
							<div
								className="flex items-center"
								key={step.name + step.type + step.target}
							>
								{index > 0 && (
									<CaretRightIcon
										className="mx-1 h-3 w-3"
										style={{ color: 'var(--color-muted-foreground)' }}
										weight="fill"
									/>
								)}
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<span
												className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
												style={{
													background: 'var(--color-muted)',
													color: 'var(--color-foreground)',
													borderColor: 'var(--color-border)',
												}}
											>
												{getStepIcon(step.type)}
												<span className="inline-block max-w-[120px] overflow-hidden text-ellipsis">
													{step.name || step.target}
												</span>
											</span>
										</TooltipTrigger>
										<TooltipContent className="px-2 py-1 text-xs" side="bottom">
											{getStepTooltipText(step.type, step.target)}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							</div>
						))}
					</div>
					{funnel.filters && funnel.filters.length > 0 && (
						<div className="mt-1 flex items-center gap-2">
							<FunnelIcon
								className="h-3 w-3"
								style={{ color: 'var(--color-muted-foreground)' }}
								weight="duotone"
							/>
							<div className="flex flex-wrap gap-2">
								{funnel.filters.map((filter) => (
									<span
										className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
										key={filter.field + filter.operator + String(filter.value)}
										style={{
											background: 'var(--color-muted)',
											color: 'var(--color-foreground)',
											borderColor: 'var(--color-border)',
										}}
									>
										<span style={{ color: 'var(--color-muted-foreground)' }}>
											{filter.field}
										</span>
										<span
											className="mx-1"
											style={{
												color:
													filter.operator === 'not_equals' ||
													filter.operator === 'not_in'
														? 'var(--color-destructive)'
														: 'var(--color-success)',
											}}
										>
											{filter.operator}
										</span>
										<span
											className="inline-block max-w-[100px] overflow-hidden text-ellipsis"
											style={{ color: 'var(--color-foreground)' }}
										>
											{filter.value &&
											typeof filter.value === 'string' &&
											filter.value.length > 0
												? filter.value
												: 'empty'}
										</span>
									</span>
								))}
							</div>
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						className="focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
						onClick={(e) => {
							e.stopPropagation();
							onEdit(funnel);
						}}
						size="icon"
						type="button"
						variant="ghost"
					>
						<PencilIcon className="h-4 w-4" weight="duotone" />
					</Button>
					<Button
						className="focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(funnel.id);
						}}
						size="icon"
						type="button"
						variant="ghost"
					>
						<TrashIcon className="h-4 w-4" weight="duotone" />
					</Button>
					<Button
						className="focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
						onClick={(e) => {
							e.stopPropagation();
							onToggle(funnel.id);
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
