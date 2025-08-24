'use client';

import {
	CaretDownIcon,
	CheckIcon,
	FlaskIcon,
	StarIcon,
} from '@phosphor-icons/react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AssistantModel } from '../types/model';
import { MODEL_CONFIGS } from '../types/model';

const modelIcons: Record<string, React.ReactNode> = {
	chat: <StarIcon className="h-4 w-4 text-yellow-400" weight="duotone" />, // Use Star for default
	agent: <FlaskIcon className="h-4 w-4 text-blue-400" weight="duotone" />, // Flask for experimental/agent
	'agent-max': (
		<FlaskIcon className="h-4 w-4 text-purple-400" weight="duotone" />
	), // Flask for max
};

interface ModelSelectorProps {
	selectedModel: AssistantModel;
	disabled?: boolean;
}

export function ModelSelector({
	selectedModel,
	disabled = false,
}: ModelSelectorProps) {
	const currentConfig = MODEL_CONFIGS[selectedModel];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className={cn(
						'h-8 border border-border/50 bg-background/70 px-3 font-semibold text-xs',
						'hover:bg-accent hover:text-accent-foreground',
						'transition-colors duration-200'
					)}
					disabled={disabled}
					size="sm"
					variant="outline"
				>
					{modelIcons[selectedModel]}
					<span className="mr-1 ml-2">{currentConfig.name}</span>
					<CaretDownIcon className="h-3 w-3 opacity-50" weight="duotone" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-56 border border-border/60 bg-background/95 p-1 shadow-xl"
			>
				{Object.values(MODEL_CONFIGS).map((config) => (
					<DropdownMenuItem
						className={cn(
							'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
							config.isEnabled
								? 'cursor-pointer hover:bg-muted/60 hover:text-foreground'
								: 'cursor-not-allowed opacity-50',
							selectedModel === config.id &&
								'border border-primary bg-accent/80 text-accent-foreground'
						)}
						disabled={!config.isEnabled}
						key={config.id}
						// onClick={() => !config.isEnabled && onModelChange(config.id)}
					>
						<div className="flex min-w-[28px] items-center gap-2">
							{modelIcons[config.id]}
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate font-semibold text-sm">
								{config.name}
							</div>
							<div className="text-muted-foreground text-xs leading-tight">
								{config.description}
							</div>
						</div>
						{selectedModel === config.id && (
							<CheckIcon
								className="ml-2 h-4 w-4 text-primary"
								weight="duotone"
							/>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
