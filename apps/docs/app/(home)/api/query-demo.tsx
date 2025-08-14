'use client';

import { XIcon } from '@phosphor-icons/react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryTypes } from './actions';
import { JsonNode } from './json-viewer';
import {
	type BatchQueryResponse,
	type DynamicQueryRequest,
	executeBatchQueries,
} from './query-builder';

interface QueryType {
	name: string;
	defaultLimit?: number;
	customizable?: boolean;
	allowedFilters?: string[];
}

function CornerDecorations() {
	return (
		<div className="pointer-events-none absolute inset-0">
			<div className="absolute top-0 left-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
		</div>
	);
}

export function QueryDemo() {
	const [availableTypes, setAvailableTypes] = useState<QueryType[]>([]);
	const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
	const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<BatchQueryResponse | null>(null);
	const listContainerRef = useRef<HTMLDivElement | null>(null);
	const savedScrollTopRef = useRef<number | null>(null);
	const clearSelection = () => {
		const viewport = listContainerRef.current?.querySelector(
			'[data-slot="scroll-area-viewport"]'
		) as HTMLElement | null;
		if (viewport) {
			savedScrollTopRef.current = viewport.scrollTop;
			viewport.style.setProperty('overflow-anchor', 'none');
		}
		setSelectedTypes(new Set());
		setSelectedOrder([]);
	};

	const displayedTypes = useMemo(() => {
		const selectedSet = new Set(selectedOrder);
		const selectedTypesOrdered = selectedOrder
			.map((name) => availableTypes.find((t) => t.name === name))
			.filter(Boolean) as QueryType[];
		const unselectedTypes = availableTypes.filter(
			(t) => !selectedSet.has(t.name)
		);
		return [...selectedTypesOrdered, ...unselectedTypes];
	}, [availableTypes, selectedOrder]);

	// Load available query types on mount
	const runQueries = useCallback(async (parameters: string[]) => {
		if (parameters.length === 0) {
			return;
		}

		setIsLoading(true);
		setResult(null);

		try {
			const queries: DynamicQueryRequest[] = [
				{
					id: 'custom-query',
					parameters,
					limit: 50,
				},
			];

			const websiteId = 'OXmNQsViBT-FOS_wZCTHc';
			const endDate = new Date().toISOString().split('T')[0];
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];

			const response = await executeBatchQueries(
				websiteId,
				startDate,
				endDate,
				queries
			);

			setResult(response);
		} catch {
			setResult({
				success: false,
				batch: true,
				results: [
					{
						success: false,
						queryId: 'custom-query',
						data: [],
						meta: {
							parameters,
							total_parameters: parameters.length,
							page: 1,
							limit: 50,
							filters_applied: 0,
						},
					},
				],
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		const loadTypes = async () => {
			const data = await getQueryTypes();
			if (data.success) {
				const types = data.types.map((name) => ({
					name,
					defaultLimit: data.configs[name]?.defaultLimit,
					customizable: data.configs[name]?.customizable,
					allowedFilters: data.configs[name]?.allowedFilters,
				}));
				setAvailableTypes(types);

				const sortedByUtility = [...types].sort((a, b) => {
					const aScore =
						(a.customizable ? 1 : 0) * 2 + (a.allowedFilters?.length || 0);
					const bScore =
						(b.customizable ? 1 : 0) * 2 + (b.allowedFilters?.length || 0);
					return bScore - aScore;
				});
				const defaultSelectedNames = sortedByUtility
					.slice(0, Math.min(3, sortedByUtility.length))
					.map((t) => t.name);
				if (defaultSelectedNames.length > 0) {
					setSelectedTypes(new Set(defaultSelectedNames));
					setSelectedOrder(defaultSelectedNames);
					runQueries(defaultSelectedNames);
				}
			}
		};
		loadTypes();
	}, [runQueries]);

	const handleTypeToggle = (typeName: string) => {
		// hack to preserve current scroll position of the scrollarea viewport
		const viewport = listContainerRef.current?.querySelector(
			'[data-slot="scroll-area-viewport"]'
		) as HTMLElement | null;
		if (viewport) {
			savedScrollTopRef.current = viewport.scrollTop;
			// prevent browser scroll anchoring from jumping to the moved item
			viewport.style.setProperty('overflow-anchor', 'none');
		}
		const newSelected = new Set(selectedTypes);
		if (newSelected.has(typeName)) {
			newSelected.delete(typeName);
			setSelectedOrder((prev) => prev.filter((n) => n !== typeName));
		} else {
			newSelected.add(typeName);
			setSelectedOrder((prev) => [...prev, typeName]);
		}
		setSelectedTypes(newSelected);
	};

	// restore the scroll position immediately after the DOM updates from reordering
	useLayoutEffect(() => {
		if (savedScrollTopRef.current !== null) {
			const viewport = listContainerRef.current?.querySelector(
				'[data-slot="scroll-area-viewport"]'
			) as HTMLElement | null;
			if (viewport) {
				viewport.scrollTop = savedScrollTopRef.current;
				viewport.style.removeProperty('overflow-anchor');
			}
			savedScrollTopRef.current = null;
		}
	});

	const handleExecuteQuery = async () => {
		if (selectedTypes.size === 0) {
			return;
		}

		await runQueries([...selectedOrder]);
	};

	return (
		<div className="w-full p-4 sm:p-6">
			<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
				{/* Left: Query Builder */}
				<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
					<div className="flex items-center justify-between">
						<h3 className="font-medium text-lg">Query Builder</h3>
						{selectedTypes.size > 0 && (
							<Badge className="font-mono text-xs" variant="secondary">
								{selectedTypes.size} selected
								<button
									aria-label="Clear selection"
									className={`${
										selectedTypes.size > 5
											? 'pointer-events-auto ml-1 w-4 scale-100 opacity-100'
											: 'pointer-events-none ml-0 w-0 scale-95 opacity-0'
									} inline-flex h-4 items-center justify-center rounded transition-all duration-200 hover:bg-muted/40`}
									onClick={clearSelection}
									type="button"
								>
									<XIcon className="size-3" weight="duotone" />
								</button>
							</Badge>
						)}
					</div>

					<div ref={listContainerRef}>
						<ScrollArea className="h-80 lg:h-96">
							<div className="grid grid-cols-1 gap-2 pr-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
								{displayedTypes.map((type) => (
									<Card
										className={`group relative cursor-pointer transition-all duration-200 hover:shadow-md ${
											selectedTypes.has(type.name)
												? 'bg-primary/5 shadow-inner'
												: 'border-border/50 bg-card/70 hover:border-border'
										}`}
										key={type.name}
										onClick={() => handleTypeToggle(type.name)}
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
													className={`h-3 w-3 flex-shrink-0 rounded-full border transition-colors ${
														selectedTypes.has(type.name)
															? 'border-primary bg-primary'
															: 'border-muted-foreground/30'
													}`}
												/>
											</div>
										</CardContent>
										<CornerDecorations />
									</Card>
								))}
							</div>
						</ScrollArea>
					</div>

					<Button
						className="w-full"
						disabled={selectedTypes.size === 0 || isLoading}
						onClick={handleExecuteQuery}
						size="lg"
					>
						{isLoading ? 'Executing...' : 'Execute Query'}
					</Button>
				</div>

				{/* Right: JSON Output */}
				<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
					<div className="flex items-center justify-between">
						<h3 className="font-medium text-lg">Response</h3>
						{result && (
							<Badge
								className="text-xs"
								variant={result.success ? 'default' : 'destructive'}
							>
								{result.success ? 'Success' : 'Failed'}
							</Badge>
						)}
					</div>

					<Card className="relative flex-1 border-border/50 bg-white dark:bg-black">
						<CardContent className="h-80 p-0 lg:h-96">
							<ScrollArea className="h-full">
								<div className="select-text break-words p-4 font-mono text-[13px] leading-6 tracking-tight sm:text-[13.5px]">
									{isLoading ? (
										<div className="space-y-2">
											<Skeleton className="h-4 w-5/6" />
											<Skeleton className="h-4 w-2/3" />
											<Skeleton className="h-4 w-11/12" />
											<Skeleton className="h-4 w-3/4" />
											<Skeleton className="h-4 w-1/2" />
											<Skeleton className="h-4 w-10/12" />
											<Skeleton className="h-4 w-8/12" />
											<Skeleton className="h-4 w-9/12" />
										</div>
									) : result ? (
										<JsonNode data={result} />
									) : (
										<div className="text-gray-400" />
									)}
								</div>
							</ScrollArea>
						</CardContent>
						<CornerDecorations />
					</Card>
				</div>
			</div>
		</div>
	);
}
