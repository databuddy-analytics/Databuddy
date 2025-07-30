'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ClosableAlertProps {
	id: string;
	title: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	variant?: 'warning' | 'error' | 'success' | 'info';
	className?: string;
	children?: React.ReactNode;
	onClose?: (id: string) => void;
}

export function ClosableAlert({
	id,
	title,
	description,
	icon: Icon,
	variant = 'info',
	className,
	children,
	onClose,
}: ClosableAlertProps) {
	const [isVisible, setIsVisible] = useState(true);
	const [isExpanded, setIsExpanded] = useState(false);

	const handleClose = () => {
		setIsVisible(false);
		onClose?.(id);
	};

	if (!isVisible) {
		return null;
	}

	// Only use color for critical errors
	const isError = variant === 'error';

	return (
		<div
			className={cn(
				'rounded border bg-muted/50 transition-all duration-200',
				isError && 'border-destructive/20 bg-destructive/5',
				className
			)}
		>
			{/* Header - always visible */}
			<div className="flex items-center justify-between p-3">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<Icon
						className={cn(
							'h-4 w-4 flex-shrink-0',
							isError ? 'text-destructive' : 'text-muted-foreground'
						)}
					/>
					<div className="min-w-0 flex-1">
						<h4 className="font-medium text-sm">{title}</h4>
						{!isExpanded && (
							<p className="truncate text-muted-foreground text-xs">
								{description}
							</p>
						)}
					</div>
				</div>

				<div className="ml-2 flex items-center gap-1">
					{children && (
						<Button
							className="h-6 w-6 rounded p-0"
							onClick={() => setIsExpanded(!isExpanded)}
							size="sm"
							variant="ghost"
						>
							{isExpanded ? (
								<ChevronUp className="h-3 w-3" />
							) : (
								<ChevronDown className="h-3 w-3" />
							)}
						</Button>
					)}
					<Button
						className="h-6 w-6 rounded p-0"
						onClick={handleClose}
						size="sm"
						variant="ghost"
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
			</div>

			{/* Expandable content */}
			{isExpanded && (
				<div className="border-border/50 border-t px-3 pb-3">
					<div className="space-y-2 pt-3">
						<p className="text-muted-foreground text-xs leading-relaxed">
							{description}
						</p>
						{children}
					</div>
				</div>
			)}
		</div>
	);
}
