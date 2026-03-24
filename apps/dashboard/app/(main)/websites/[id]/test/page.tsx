"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import {
	CalendarDotsIcon,
	FunnelIcon,
	PencilSimpleIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useAtomValue } from "jotai";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Layout } from "react-grid-layout";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { StatCard } from "@/components/analytics/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	formattedDateRangeAtom,
	timeGranularityAtom,
	timezoneAtom,
} from "@/stores/jotai/filterAtoms";
import { CardSheet } from "./_components/add-card-sheet";
import { useDashboardData } from "./_components/hooks/use-dashboard-data";
import { getCategoryIcon } from "./_components/utils/category-utils";
import type { DashboardCardConfig } from "./_components/utils/types";

const GRID_COLS = 4;
const GRID_ROW_HEIGHT = 140;

const DEFAULT_CARDS: DashboardCardConfig[] = [
	{
		id: "pageviews",
		type: "card",
		queryType: "summary_metrics",
		field: "pageviews",
		label: "Pageviews",
		displayMode: "text",
		category: "Analytics",
	},
	{
		id: "visitors",
		type: "card",
		queryType: "summary_metrics",
		field: "unique_visitors",
		label: "Unique Visitors",
		displayMode: "text",
		category: "Analytics",
	},
	{
		id: "sessions",
		type: "card",
		queryType: "summary_metrics",
		field: "sessions",
		label: "Sessions",
		displayMode: "text",
		category: "Analytics",
	},
	{
		id: "bounce-rate",
		type: "card",
		queryType: "summary_metrics",
		field: "bounce_rate",
		label: "Bounce Rate",
		displayMode: "text",
		category: "Analytics",
	},
];

export default function TestPage() {
	const { id: websiteId } = useParams<{ id: string }>();
	const formattedDateRange = useAtomValue(formattedDateRangeAtom);
	const granularity = useAtomValue(timeGranularityAtom);
	const timezone = useAtomValue(timezoneAtom);
	const [cards, setCards] = useState<DashboardCardConfig[]>(DEFAULT_CARDS);
	const [layout, setLayout] = useState<Layout>(() =>
		cards.map((card, i) => ({
			i: card.id,
			x: i % GRID_COLS,
			y: Math.floor(i / GRID_COLS),
			w: 1,
			h: 1,
		}))
	);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingCard, setEditingCard] = useState<DashboardCardConfig | null>(
		null
	);
	const { width, containerRef } = useContainerWidth();

	const dateRange: DateRange = useMemo(
		() => ({
			start_date: formattedDateRange.startDate,
			end_date: formattedDateRange.endDate,
			granularity,
			timezone,
		}),
		[
			formattedDateRange.startDate,
			formattedDateRange.endDate,
			granularity,
			timezone,
		]
	);

	const { getValue, getChartData, isLoading, isFetching } = useDashboardData(
		websiteId,
		dateRange,
		cards
	);

	const handleSaveCard = (card: DashboardCardConfig) => {
		if (editingCard) {
			setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
		} else {
			setCards((prev) => [...prev, card]);
			setLayout((prev) => [
				...prev,
				{
					i: card.id,
					x: prev.length % GRID_COLS,
					y: Math.floor(prev.length / GRID_COLS),
					w: 1,
					h: 1,
				},
			]);
		}
	};

	const handleDeleteCard = (cardId: string) => {
		setCards((prev) => prev.filter((c) => c.id !== cardId));
		setLayout((prev) => prev.filter((l) => l.i !== cardId));
	};

	const handleEditCard = (card: DashboardCardConfig) => {
		setEditingCard(card);
		setIsSheetOpen(true);
	};

	const handleCloseSheet = () => {
		setIsSheetOpen(false);
		setEditingCard(null);
	};

	const handleOpenAddSheet = () => {
		setEditingCard(null);
		setIsSheetOpen(true);
	};

	return (
		<div className="space-y-6 p-4 lg:p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-semibold text-lg">Custom Dashboard</h1>
					<p className="text-muted-foreground text-sm">
						{cards.length} card{cards.length === 1 ? "" : "s"}
					</p>
				</div>
				<Button onClick={handleOpenAddSheet} size="sm" variant="outline">
					<PlusIcon className="mr-1.5 size-4" />
					Add Card
				</Button>
			</div>

			<div ref={containerRef}>
				{width > 0 && (
					<GridLayout
						dragConfig={{ handle: ".drag-handle" }}
						gridConfig={{
							cols: GRID_COLS,
							rowHeight: GRID_ROW_HEIGHT,
							margin: [16, 16],
						}}
						layout={layout}
						onLayoutChange={setLayout}
						resizeConfig={{ enabled: false }}
						width={width}
					>
						{cards.map((card) => {
							const hasCustomDateRange =
								card.dateRangePreset && card.dateRangePreset !== "global";
							const hasFilters = card.filters && card.filters.length > 0;
							return (
								<div className="group/card relative" key={card.id}>
									<div className="drag-handle h-full cursor-grab">
										<StatCard
											chartData={
												card.displayMode === "chart"
													? getChartData(card.id, card.queryType, card.field)
													: undefined
											}
											chartType="area"
											className="h-full"
											displayMode={card.displayMode}
											icon={getCategoryIcon(card.category || "Other")}
											id={card.id}
											isLoading={isLoading || isFetching}
											title={card.title || card.label}
											value={getValue(card.id, card.queryType, card.field)}
										/>
									</div>
									<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
										{hasCustomDateRange && (
											<div className="flex size-6 items-center justify-center rounded bg-primary/10">
												<CalendarDotsIcon className="size-3 text-primary" />
											</div>
										)}
										{hasFilters && (
											<div className="flex size-6 items-center justify-center rounded bg-primary/10">
												<FunnelIcon className="size-3 text-primary" />
											</div>
										)}
										<button
											className="flex size-7 items-center justify-center rounded bg-secondary/80 backdrop-blur-sm transition-colors hover:bg-secondary"
											onClick={() => handleEditCard(card)}
											type="button"
										>
											<PencilSimpleIcon className="size-3.5 text-muted-foreground" />
										</button>
									</div>
								</div>
							);
						})}
					</GridLayout>
				)}

				{/* Add Card Tile - outside grid */}
				<Card
					className="group mt-4 flex h-[140px] cursor-pointer flex-col items-center justify-center gap-2 border-dashed bg-transparent py-0 transition-all hover:border-primary hover:bg-accent/50"
					onClick={handleOpenAddSheet}
				>
					<div className="flex size-10 items-center justify-center rounded-full bg-accent transition-colors group-hover:bg-primary/10">
						<PlusIcon className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
					</div>
					<span className="font-medium text-muted-foreground text-sm transition-colors group-hover:text-foreground">
						Add Card
					</span>
				</Card>
			</div>

			<CardSheet
				dateRange={dateRange}
				editingCard={editingCard}
				isOpen={isSheetOpen}
				onCloseAction={handleCloseSheet}
				onDeleteAction={handleDeleteCard}
				onSaveAction={handleSaveCard}
				websiteId={websiteId}
			/>
		</div>
	);
}
