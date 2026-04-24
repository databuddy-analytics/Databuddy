"use client";

import {
	CaretDownIcon,
	ChartBarIcon,
	ChartLineIcon,
	CursorClickIcon,
	DesktopIcon,
	FunnelIcon,
	MoonIcon,
	PresentationChartIcon,
	SquaresFourIcon,
	StackIcon,
	SunIcon,
	UsersIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";
import { useState } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { Card } from "@/components/ds/card";
import { Select } from "@/components/ds/select";
import { Text } from "@/components/ds/text";
import { Tooltip } from "@/components/ds/tooltip";
import type {
	ChartCurveType,
	ChartSeriesKind,
} from "@/components/ui/composables/chart";
import {
	CHART_LOCATION_LABELS,
	CHART_LOCATIONS,
	type ChartLocation,
	useAllChartPreferences,
} from "@/hooks/use-chart-preferences";
import {
	type DefaultDateRangePreset,
	getPresetLabel,
	useDefaultDateRange,
} from "@/hooks/use-default-date-range";
import { cn } from "@/lib/utils";

const MOCK_CHART_DATA = [
	{ date: "2024-01-01", value: 186 },
	{ date: "2024-01-02", value: 305 },
	{ date: "2024-01-03", value: 237 },
	{ date: "2024-01-04", value: 73 },
	{ date: "2024-01-05", value: 209 },
	{ date: "2024-01-06", value: 214 },
];

const THEME_OPTIONS = [
	{ id: "light", name: "Light", icon: SunIcon },
	{ id: "dark", name: "Dark", icon: MoonIcon },
	{ id: "system", name: "System", icon: DesktopIcon },
] as const;

const CHART_TYPE_OPTIONS: {
	id: ChartSeriesKind;
	name: string;
	icon: typeof ChartBarIcon;
}[] = [
	{ id: "bar", name: "Bar", icon: ChartBarIcon },
	{ id: "line", name: "Line", icon: ChartLineIcon },
	{ id: "area", name: "Area", icon: StackIcon },
];

const STEP_TYPE_OPTIONS: { id: ChartCurveType; name: string }[] = [
	{ id: "monotone", name: "Smooth" },
	{ id: "linear", name: "Linear" },
	{ id: "step", name: "Step" },
	{ id: "stepBefore", name: "Step Before" },
	{ id: "stepAfter", name: "Step After" },
];

const DEFAULT_DATE_RANGE_OPTIONS: DefaultDateRangePreset[] = [
	"24h",
	"7d",
	"30d",
	"90d",
	"180d",
	"365d",
];

const LOCATION_ICONS: Record<ChartLocation, typeof ChartLineIcon> = {
	"overview-stats": SquaresFourIcon,
	"overview-main": PresentationChartIcon,
	funnels: FunnelIcon,
	retention: UsersIcon,
	"website-list": ChartLineIcon,
	events: CursorClickIcon,
};

export default function AppearanceSettingsPage() {
	const { theme, setTheme } = useTheme();
	const { defaultDateRange, setDefaultDateRange } = useDefaultDateRange();
	const { preferences, updateLocationPreferences, updateAllPreferences } =
		useAllChartPreferences();
	const [previewLocation, setPreviewLocation] =
		useState<ChartLocation>("overview-stats");
	const [showGranular, setShowGranular] = useState(false);

	const globalPrefs = preferences["overview-stats"] ?? {
		chartType: "area" as ChartSeriesKind,
		chartStepType: "monotone" as ChartCurveType,
	};

	const previewPrefs = showGranular
		? (preferences[previewLocation] ?? globalPrefs)
		: globalPrefs;

	const isGlobalBar = globalPrefs.chartType === "bar";

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Card.Title>Theme</Card.Title>
						<Card.Description>
							Choose your preferred color scheme
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div className="inline-flex rounded-md bg-secondary p-1">
							{THEME_OPTIONS.map(({ id, name, icon: Icon }) => {
								const isActive = theme === id;
								return (
									<button
										className={cn(
											"flex items-center gap-1.5 rounded px-3 py-1.5",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											isActive
												? "bg-card text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground"
										)}
										key={id}
										onClick={() => setTheme(id)}
										type="button"
									>
										<Icon
											className="size-3.5"
											weight={isActive ? "duotone" : "regular"}
										/>
										<Text variant="label">{name}</Text>
									</button>
								);
							})}
						</div>
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Card.Title>Default Date Range</Card.Title>
						<Card.Description>
							Default time range when opening analytics pages
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div className="inline-flex flex-wrap gap-1.5">
							{DEFAULT_DATE_RANGE_OPTIONS.map((id) => {
								const isActive = defaultDateRange === id;
								return (
									<button
										className={cn(
											"rounded-md border px-3 py-1.5",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											isActive
												? "border-primary bg-primary/10 text-foreground"
												: "border-border/60 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
										)}
										key={id}
										onClick={() => setDefaultDateRange(id)}
										type="button"
									>
										<Text variant="label">{getPresetLabel(id)}</Text>
									</button>
								);
							})}
						</div>
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Card.Title>Charts</Card.Title>
						<Card.Description>
							Configure chart styles across the app
						</Card.Description>
					</Card.Header>
					<Card.Content className="space-y-4">
						<div className="overflow-hidden rounded-md border border-border/60 bg-secondary/30 p-4">
							<div className="mb-3 flex items-center justify-between">
								<Text tone="muted" variant="caption">
									Preview
								</Text>
								{showGranular && (
									<Select
										onValueChange={(v) =>
											setPreviewLocation(v as ChartLocation)
										}
										value={previewLocation}
									>
										<Select.Trigger className="w-40 [--control-h:--spacing(7)]" />
										<Select.Content>
											{CHART_LOCATIONS.map((loc) => (
												<Select.Item key={loc} value={loc}>
													{CHART_LOCATION_LABELS[loc]}
												</Select.Item>
											))}
										</Select.Content>
									</Select>
								)}
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<StatCard
									chartData={MOCK_CHART_DATA}
									chartStepType={previewPrefs.chartStepType}
									chartType={previewPrefs.chartType}
									icon={ChartLineIcon}
									id="preview-1"
									showChart
									title="Visitors"
									value="1,234"
								/>
								<StatCard
									chartData={MOCK_CHART_DATA.map((d) => ({
										...d,
										value: d.value * 1.5,
									}))}
									chartStepType={previewPrefs.chartStepType}
									chartType={previewPrefs.chartType}
									icon={StackIcon}
									id="preview-2"
									showChart
									title="Pageviews"
									value="3,456"
								/>
							</div>
						</div>

						<div className="overflow-hidden rounded-md border border-border/60">
							<div className="flex items-center justify-between bg-muted px-4 py-2.5">
								<Text variant="label">All Charts</Text>
								<div className="flex items-center gap-2">
									<Select
										onValueChange={(v) =>
											updateAllPreferences({
												chartType: v as ChartSeriesKind,
											})
										}
										value={globalPrefs.chartType}
									>
										<Select.Trigger className="w-max [--control-h:--spacing(7)]" />
										<Select.Content>
											{CHART_TYPE_OPTIONS.map(({ id, name, icon: OptIcon }) => (
												<Select.Item key={id} value={id}>
													<OptIcon className="size-3.5" weight="duotone" />
													{name}
												</Select.Item>
											))}
										</Select.Content>
									</Select>
									<Select
										disabled={isGlobalBar}
										onValueChange={(v) =>
											updateAllPreferences({
												chartStepType: v as ChartCurveType,
											})
										}
										value={globalPrefs.chartStepType}
									>
										{isGlobalBar ? (
											<Tooltip content="Bar charts do not support style">
												<Select.Trigger
													className={cn("h-7 w-28", "opacity-50")}
												/>
											</Tooltip>
										) : (
											<Select.Trigger className="h-7 w-28" />
										)}
										<Select.Content>
											{STEP_TYPE_OPTIONS.map(({ id, name }) => (
												<Select.Item key={id} value={id}>
													{name}
												</Select.Item>
											))}
										</Select.Content>
									</Select>
								</div>
							</div>

							<button
								className={cn(
									"flex w-full items-center justify-between px-4 py-2.5",
									"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
									"hover:bg-interactive-hover",
									showGranular && "border-border/60 border-b"
								)}
								onClick={() => setShowGranular(!showGranular)}
								type="button"
							>
								<Text tone="muted" variant="caption">
									{showGranular
										? "Hide per-location settings"
										: "Customize per location"}
								</Text>
								<CaretDownIcon
									className={cn(
										"size-3.5 text-muted-foreground",
										"transition-transform duration-(--duration-quick) ease-(--ease-smooth)",
										showGranular && "rotate-180"
									)}
								/>
							</button>

							{showGranular && (
								<div>
									{CHART_LOCATIONS.map((location, i) => {
										const prefs = preferences[location] ?? {
											chartType: "area" as ChartSeriesKind,
											chartStepType: "monotone" as ChartCurveType,
										};
										const isBar = prefs.chartType === "bar";
										const isActive = location === previewLocation;
										const LocationIcon = LOCATION_ICONS[location];

										return (
											<div
												className={cn(
													"flex w-full items-center gap-3 px-4 py-2.5",
													i < CHART_LOCATIONS.length - 1 &&
														"border-border/60 border-b",
													isActive && "bg-secondary/50"
												)}
												key={location}
											>
												<button
													className={cn(
														"flex min-w-0 flex-1 items-center gap-2",
														"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
														"rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
													)}
													onClick={() => setPreviewLocation(location)}
													type="button"
												>
													<LocationIcon
														className="size-4 shrink-0 text-muted-foreground"
														weight="duotone"
													/>
													<Text
														className={cn(
															"truncate text-left",
															isActive && "font-medium"
														)}
														variant="body"
													>
														{CHART_LOCATION_LABELS[location]}
													</Text>
												</button>
												<div className="flex shrink-0 items-center gap-2">
													<Select
														onValueChange={(v) =>
															updateLocationPreferences(location, {
																chartType: v as ChartSeriesKind,
															})
														}
														value={prefs.chartType}
													>
														<Select.Trigger className="w-[6.5rem] [--control-h:--spacing(7)]" />
														<Select.Content>
															{CHART_TYPE_OPTIONS.map(
																({ id, name, icon: OptIcon }) => (
																	<Select.Item key={id} value={id}>
																		<OptIcon
																			className="size-3.5"
																			weight="duotone"
																		/>
																		{name}
																	</Select.Item>
																)
															)}
														</Select.Content>
													</Select>
													<Select
														disabled={isBar}
														onValueChange={(v) =>
															updateLocationPreferences(location, {
																chartStepType: v as ChartCurveType,
															})
														}
														value={prefs.chartStepType}
													>
														{isBar ? (
															<Tooltip content="Bar charts do not support style">
																<Select.Trigger
																	className={cn("h-7 w-[7.5rem]", "opacity-50")}
																/>
															</Tooltip>
														) : (
															<Select.Trigger className="h-7 w-[7.5rem]" />
														)}
														<Select.Content>
															{STEP_TYPE_OPTIONS.map(({ id, name }) => (
																<Select.Item key={id} value={id}>
																	{name}
																</Select.Item>
															))}
														</Select.Content>
													</Select>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</Card.Content>
				</Card>
			</div>
		</div>
	);
}
