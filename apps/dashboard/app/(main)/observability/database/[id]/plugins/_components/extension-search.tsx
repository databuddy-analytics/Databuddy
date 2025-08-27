'use client';

import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ExtensionSearchProps {
	search: string;
	onSearchChange: (search: string) => void;
	placeholder?: string;
	className?: string;
}

export function ExtensionSearch({
	search,
	onSearchChange,
	placeholder = 'Search extensions...',
	className = '',
}: ExtensionSearchProps) {
	const handleClear = () => {
		onSearchChange('');
	};

	return (
		<div className={`relative max-w-md flex-1 ${className}`}>
			<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 z-10 h-4 w-4 text-muted-foreground" />
			<Input
				className="rounded border-border/50 bg-background/50 pr-10 pl-10 backdrop-blur-sm transition-all duration-200 focus:border-primary/50 focus:bg-background"
				onChange={(e) => onSearchChange(e.target.value)}
				placeholder={placeholder}
				value={search}
			/>
			{search && (
				<Button
					className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7 rounded-full"
					onClick={handleClear}
					size="sm"
					variant="ghost"
				>
					<XIcon className="h-3 w-3" />
				</Button>
			)}
		</div>
	);
}
