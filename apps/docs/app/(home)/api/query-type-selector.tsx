'use client';

import { XIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface QueryType {
	name: string;
	defaultLimit?: number;
	customizable?: boolean;
	allowedFilters?: string[];
}

interface QueryTypeSelectorProps {
	availableTypes: QueryType[];
	selectedTypes: Set<string>;
	isLoading: boolean;
	onTypeToggle: (typeName: string) => void;
	onClearSelection: () => void;
	onExecuteQuery: () => void;
}

export function QueryTypeSelector({
	availableTypes,
	selectedTypes,
	isLoading,
	onTypeToggle,
	onClearSelection,
	onExecuteQuery,
}: QueryTypeSelectorProps) {
	return (
		<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
			<div className="flex items-center justify-between">
				<h3 className="font-medium text-lg">Query Builder</h3>
				{selectedTypes.size > 0 && (
					<Badge className="rounded-none font-mono text-xs" variant="secondary">
						{selectedTypes.size} selected
						<button
							aria-label="Clear selection"
							className={`${
								selectedTypes.size > 5
									? 'pointer-events-auto ml-1 w-4 scale-100 opacity-100'
									: 'pointer-events-none ml-0 w-0 scale-95 opacity-0'
							} inline-flex h-4 items-center justify-center rounded transition-all duration-200 hover:bg-muted/40`}
							onClick={onClearSelection}
							type="button"
						>
							<XIcon className="size-3" weight="duotone" />
						</button>
					</Badge>
				)}
			</div>

			<ScrollArea className="h-80 lg:h-96">
				<div className="grid grid-cols-1 gap-2 pr-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
					{[...selectedTypes].map((type) => (
						<Card
							className={
								'group relative cursor-pointer border transition-all duration-200 hover:border-border/80 hover:shadow-sm '
							}
							key={type}
							onClick={() => onTypeToggle(type)}
						>
							<CardContent className="p-2">
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<code className="truncate font-medium font-mono text-xs">
												{type}
											</code>
											{availableTypes.find((t) => t.name === type)
												?.customizable && (
												<Badge
													className="px-1.5 py-0.5 text-[10px] leading-none"
													variant="outline"
												>
													Custom
												</Badge>
											)}
										</div>
										{availableTypes.find((t) => t.name === type)
											?.defaultLimit && (
											<div className="mt-0.5 text-[10px] text-muted-foreground">
												Limit:
												{
													availableTypes.find((t) => t.name === type)
														.defaultLimit
												}
											</div>
										)}
									</div>
									<div
										className={
											'h-3 w-3 flex-shrink-0 rounded-full border border-primary bg-primary transition-colors'
										}
									/>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
				{selectedTypes.size > 0 && <Separator className="my-4" />}
				<div className="grid grid-cols-1 gap-2 pr-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
					{availableTypes
						.filter((type) => !selectedTypes.has(type.name))
						.map((type) => (
							<Card
								className={`group 'border-border/30 relative cursor-pointer border bg-card/70 transition-all duration-200 hover:border-border/80 hover:shadow-sm`}
								key={type.name}
								onClick={() => onTypeToggle(type.name)}
							>
								<CardContent className="p-2">
									<div className="flex items-center justify-between gap-2">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<code className="truncate font-medium font-mono text-xs">
													{type.name}
												</code>
												{type.customizable && (
													<Badge
														className="px-1.5 py-0.5 text-[10px] leading-none"
														variant="outline"
													>
														Custom
													</Badge>
												)}
											</div>
											{type.defaultLimit && (
												<div className="mt-0.5 text-[10px] text-muted-foreground">
													Limit: {type.defaultLimit}
												</div>
											)}
										</div>
										<div
											className={
												'h-3 w-3 flex-shrink-0 rounded-full border border-muted-foreground/30 transition-colors'
											}
										/>
									</div>
								</CardContent>
							</Card>
						))}
				</div>
			</ScrollArea>

			<Button
				className="w-full"
				disabled={selectedTypes.size === 0 || isLoading}
				onClick={onExecuteQuery}
				size="lg"
			>
				{isLoading ? 'Executing...' : 'Execute Query'}
			</Button>
		</div>
	);
}
