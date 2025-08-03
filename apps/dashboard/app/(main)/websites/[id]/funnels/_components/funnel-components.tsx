'use client';

import { DotsNineIcon, TrashIcon } from '@phosphor-icons/react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Command,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type { FunnelStep } from '@/hooks/use-funnels';
import { cn } from '@/lib/utils';

const MAX_SUGGESTIONS = 7;

// Optimized Autocomplete Component
export const AutocompleteInput = memo(
	({
		value,
		onValueChange,
		suggestions,
		placeholder,
		className,
	}: {
		value: string;
		onValueChange: (value: string) => void;
		suggestions: string[];
		placeholder?: string;
		className?: string;
	}) => {
		const [searchValue, setSearchValue] = useState('');
		const [isOpen, setIsOpen] = useState(false);
		const [filteredSuggestions, setFilteredSuggestions] = useState(
			suggestions.slice(0, MAX_SUGGESTIONS)
		);

		const handleInputChange = (newValue: string) => {
			onValueChange(newValue);
			setSearchValue(newValue);

			if (newValue.trim()) {
				const filtered = suggestions
					.filter((s) => s.toLowerCase().includes(newValue.toLowerCase()))
					.slice(0, MAX_SUGGESTIONS);
				setFilteredSuggestions(filtered);
				setIsOpen(filtered.length > 0);
			} else {
				setFilteredSuggestions(suggestions.slice(0, MAX_SUGGESTIONS));
				setIsOpen(suggestions.length > 0);
			}
		};

		const handleSelect = (suggestion: string) => {
			onValueChange(suggestion);
			setIsOpen(false);
		};

		return (
			<Popover onOpenChange={setIsOpen} open={isOpen}>
				<PopoverTrigger asChild>
					<Button
						aria-expanded={isOpen}
						className={cn(
							'flex justify-start overflow-x-auto bg-transparent px-3',
							className
						)}
						role="combobox"
						variant="outline"
					>
						{value === '' ? placeholder : value}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="p-0">
					<Command shouldFilter={false}>
						<CommandInput
							className="w-full"
							onValueChange={handleInputChange}
							placeholder={placeholder}
							value={searchValue}
						/>
						<CommandList>
							{filteredSuggestions.map((suggestion) => (
								<CommandItem
									className="w-full cursor-pointer border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent hover:text-accent-foreground"
									key={suggestion}
									onSelect={() => handleSelect(suggestion)}
									value={suggestion}
								>
									{suggestion}
								</CommandItem>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		);
	}
);

AutocompleteInput.displayName = 'AutocompleteInput';

// Optimized Draggable Step Component
export const DraggableStep = memo(
	({
		step,
		index,
		updateStep,
		removeStep,
		canRemove,
		getStepSuggestions,
		isDragging,
	}: {
		step: FunnelStep;
		index: number;
		updateStep: (index: number, field: keyof FunnelStep, value: string) => void;
		removeStep: (index: number) => void;
		canRemove: boolean;
		getStepSuggestions: (stepType: string) => string[];
		isDragging?: boolean;
	}) => {
		return (
			<div
				className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-150 ${
					isDragging
						? 'scale-[0.98] border-primary/30 bg-background/95 opacity-60 shadow-xl'
						: 'hover:border-border hover:shadow-sm'
				}`}
			>
				{/* Drag Handle */}
				<div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
					<DotsNineIcon
						className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground"
						size={16}
					/>
				</div>

				{/* Step Number */}
				<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary/20 bg-gradient-to-br from-primary to-primary/80 font-semibold text-primary-foreground text-sm shadow-sm">
					{index + 1}
				</div>

				{/* Step Fields */}
				<div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
					<Select
						onValueChange={(value) => updateStep(index, 'type', value)}
						value={step.type}
					>
						<SelectTrigger className="rounded-lg border-border/50 focus:border-primary/50">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="rounded-lg">
							<SelectItem value="PAGE_VIEW">Page View</SelectItem>
							<SelectItem value="EVENT">Event</SelectItem>
						</SelectContent>
					</Select>
					<AutocompleteInput
						className="rounded-lg border-border/50 focus:border-primary/50 focus:ring-primary/20"
						onValueChange={(value) => updateStep(index, 'target', value)}
						placeholder={step.type === 'PAGE_VIEW' ? '/path' : 'event_name'}
						suggestions={getStepSuggestions(step.type)}
						value={step.target || ''}
					/>
					<Input
						className="rounded-lg border-border/50 focus:border-primary/50 focus:ring-primary/20"
						onChange={(e) => updateStep(index, 'name', e.target.value)}
						placeholder="Step name"
						value={step.name}
					/>
				</div>

				{/* Remove Button */}
				{canRemove && (
					<Button
						className="h-8 w-8 flex-shrink-0 rounded-lg p-0 transition-colors hover:bg-destructive/10 hover:text-destructive"
						onClick={() => removeStep(index)}
						size="sm"
						variant="ghost"
					>
						<TrashIcon className="h-4 w-4" size={16} weight="duotone" />
					</Button>
				)}
			</div>
		);
	}
);

DraggableStep.displayName = 'DraggableStep';
