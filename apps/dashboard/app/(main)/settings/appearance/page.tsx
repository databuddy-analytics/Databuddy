"use client";

import { CalendarBlankIcon } from "@phosphor-icons/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { ChartBarIcon } from "@phosphor-icons/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { ClockIcon } from "@phosphor-icons/react";
import { CursorClickIcon } from "@phosphor-icons/react";
import { DesktopIcon } from "@phosphor-icons/react";
import { FunnelIcon } from "@phosphor-icons/react";
import { MoonIcon } from "@phosphor-icons/react";
import { PresentationChartIcon } from "@phosphor-icons/react";
import { SquaresFourIcon } from "@phosphor-icons/react";
import { StackIcon } from "@phosphor-icons/react";
import { SunIcon } from "@phosphor-icons/react";
import { UsersIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import type {
	ChartCurveType,
	ChartSeriesKind,
} from "@/components/ui/composables/chart";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	CHART_LOCATION_DESCRIPTIONS,
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
import { SettingsSection } from "../_components/settings-section";

const MOCK_CHART_DATA = [
	{ date: "2024-01-01", value: 186 },
	{ date: "2024-01-02", value: 305 },
	{ date: "2024-01-03", value: 237 },
	{ date: "2024-01-04", value: 73 },
	{ date: "2024-01-05", value: 209 },
	{ date: "2024-01-06", value: 214 },
];

const THEME_OPTIONS = [
	{
		id: "light",
		name: "Light",
		icon: SunIcon,
		description: "Light background",
	},
	{ id: "dark", name: "Dark", icon: MoonIcon, description: "Dark background" },
	{
		id: "system",
		name: "System",
		icon: DesktopIcon,
		description: "Auto-detect",
	},
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

const DEFAULT_DATE_RANGE_OPTIONS: {
	id: DefaultDateRangePreset;
	icon: typeof ClockIcon;
}[] = [
	{ id: "24h", icon: ClockIcon },
	{ id: "7d", icon: CalendarBlankIcon },
	{ id: "30d", icon: CalendarBlankIcon },
	{ id: "90d", icon: CalendarBlankIcon },
	{ id: "180d", icon: CalendarBlankIcon },
	{ id: "365d", icon: CalendarBlankIcon },
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

	// Get the "global" preference (first location as reference for "all")
	const globalPrefs = preferences["overview-stats"] ?? {
		chartType: "area" as ChartSeriesKind,
		chartStepType: "monotone" as ChartCurveType,
	};

	const previewPrefs = showGranular
		? (preferences[previewLocation] ?? globalPrefs)
		: globalPrefs;

	const isGlobalBar = globalPrefs.chartType === "bar";

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex-1 overflow-y-auto">
				<SettingsSection
					description="Choose your preferred color scheme"
					title="Theme"
				>
					<div className="grid gap-3 sm:grid-cols-3">
						{THEME_OPTIONS.map(({ id, name, icon: Icon, description }) => {
							const isActive = theme === id;
							return (
								<button
									className={cn(
										"flex flex-col items-center gap-2 rounded border p-4",
										isActive
											? "border-primary bg-primary/5"
											: "border-border hover:bg-accent"
									)}
									key={id}
									onClick={() => setTheme(id)}
									type="button"
								>
									<div
										className={cn(
											"flex size-10 items-center justify-center rounded-full",
											isActive ? "bg-primary/10" : "bg-accent"
										)}
									>
										<Icon
											className={cn(
												"size-5",
												isActive ? "text-foreground" : "text-muted-foreground"
											)}
											weight="duotone"
										/>
									</div>
									<div className="text-center">
										<p className="font-medium text-sm">{name}</p>
										<p className="text-muted-foreground text-xs">
											{description}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</SettingsSection>

				<SettingsSection
					description="Default time range when opening analytics pages"
					title="Default date range"
				>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{DEFAULT_DATE_RANGE_OPTIONS.map(({ id, icon: Icon }) => {
							const isActive = defaultDateRange === id;
							return (
								<button
									className={cn(
										"flex flex-col items-center gap-2 rounded border p-4",
										isActive
											? "border-primary bg-primary/5"
											: "border-border hover:bg-accent"
									)}
									key={id}
									onClick={() => setDefaultDateRange(id)}
									type="button"
								>
									<div
										className={cn(
											"flex size-10 items-center justify-center rounded-full",
											isActive ? "bg-primary/10" : "bg-accent"
										)}
									>
										<Icon
											className={cn(
												"size-5",
												isActive ? "text-foreground" : "text-muted-foreground"
											)}
											weight="duotone"
										/>
									</div>
									<div className="text-center">
										<p className="font-medium text-sm">{getPresetLabel(id)}</p>
										<p className="text-muted-foreground text-xs">
											Last{" "}
											{id === "24h" ? "24 hours" : id.replace("d", " days")}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</SettingsSection>

				<SettingsSection
					description="Configure chart styles for different sections of the app"
					title="Charts"
				>
					<div className="space-y-4">
						<div className="rounded border bg-accent/30 p-4">
							<div className="mb-3 flex items-center justify-between">
								<span className="font-medium text-sm">Preview</span>
								{showGranular && (
									<Select
										onValueChange={(v: ChartLocation) => setPreviewLocation(v)}
										value={previewLocation}
									>
										<SelectTrigger className="h-7 w-40" size="sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CHART_LOCATIONS.map((loc) => (
												<SelectItem key={loc} value={loc}>
													{CHART_LOCATION_LABELS[loc]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
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

						<div className="rounded border">
							<div className="flex items-center justify-between border-b bg-accent/50 px-4 py-2.5">
								<span className="font-medium text-sm">All Charts</span>
								<div className="flex items-center gap-2">
									<Select
										onValueChange={(v: ChartSeriesKind) =>
											updateAllPreferences({ chartType: v })
										}
										value={globalPrefs.chartType}
									>
										<SelectTrigger className="h-8 w-max" size="sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CHART_TYPE_OPTIONS.map(({ id, name, icon: OptIcon }) => (
												<SelectItem key={id} value={id}>
													<OptIcon className="size-4" weight="duotone" />
													{name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										disabled={isGlobalBar}
										onValueChange={(v: ChartCurveType) =>
											updateAllPreferences({ chartStepType: v })
										}
										value={globalPrefs.chartStepType}
									>
										<Tooltip open={isGlobalBar ? undefined : false}>
											<TooltipTrigger asChild>
												<SelectTrigger
													className={cn(
														"h-8 w-28",
														isGlobalBar && "opacity-50"
													)}
													size="sm"
												>
													<SelectValue />
												</SelectTrigger>
											</TooltipTrigger>
											<TooltipContent>
												<p>Bar charts do not support style</p>
											</TooltipContent>
										</Tooltip>
										<SelectContent>
											{STEP_TYPE_OPTIONS.map(({ id, name }) => (
												<SelectItem key={id} value={id}>
													{name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<Button
								className="w-full justify-between rounded-none border-0"
								onClick={() => setShowGranular(!showGranular)}
								size="sm"
								variant="ghost"
							>
								<span className="text-muted-foreground text-xs">
									{showGranular
										? "Hide per-location settings"
										: "Customize per location"}
								</span>
								<CaretDownIcon
									className={cn(
										"size-4 text-muted-foreground transition-transform",
										showGranular && "rotate-180"
									)}
								/>
							</Button>

							{showGranular && (
								<div className="border-t">
									<div className="grid grid-cols-[1fr_6.5rem_7.5rem] gap-3 border-b bg-accent/30 px-4 py-2">
										<span className="font-medium text-muted-foreground text-xs uppercase">
											Location
										</span>
										<span className="font-medium text-muted-foreground text-xs uppercase">
											Type
										</span>
										<span className="font-medium text-muted-foreground text-xs uppercase">
											Style
										</span>
									</div>
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
													"grid w-full cursor-pointer grid-cols-[1fr_6.5rem_7.5rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none",
													i < CHART_LOCATIONS.length - 1 && "border-b",
													isActive && "bg-accent/50"
												)}
												key={location}
												onClick={() => setPreviewLocation(location)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														setPreviewLocation(location);
													}
												}}
												role="tablist"
												tabIndex={0}
											>
												<div className="flex items-center gap-2">
													<LocationIcon
														className="size-4 shrink-0 text-muted-foreground"
														weight="duotone"
													/>
													<span
														className={cn(
															"truncate text-sm",
															isActive && "font-medium"
														)}
													>
														{CHART_LOCATION_LABELS[location]}
													</span>
												</div>
												<Select
													onValueChange={(v: ChartSeriesKind) =>
														updateLocationPreferences(location, {
															chartType: v,
														})
													}
													value={prefs.chartType}
												>
													<SelectTrigger
														className="h-7 w-full"
														onClick={(e) => e.stopPropagation()}
														size="sm"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{CHART_TYPE_OPTIONS.map(
															({ id, name, icon: OptIcon }) => (
																<SelectItem key={id} value={id}>
																	<OptIcon
																		className="size-4"
																		weight="duotone"
																	/>
																	{name}
																</SelectItem>
															)
														)}
													</SelectContent>
												</Select>
												<Select
													disabled={isBar}
													onValueChange={(v: ChartCurveType) =>
														updateLocationPreferences(location, {
															chartStepType: v,
														})
													}
													value={prefs.chartStepType}
												>
													<Tooltip open={isBar ? undefined : false}>
														<TooltipTrigger asChild>
															<SelectTrigger
																className={cn(
																	"h-7 w-full",
																	isBar && "opacity-50"
																)}
																onClick={(e) => e.stopPropagation()}
																size="sm"
															>
																<SelectValue />
															</SelectTrigger>
														</TooltipTrigger>
														<TooltipContent>
															<p>Bar charts do not support style</p>
														</TooltipContent>
													</Tooltip>
													<SelectContent>
														{STEP_TYPE_OPTIONS.map(({ id, name }) => (
															<SelectItem key={id} value={id}>
																{name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</SettingsSection>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Current Settings">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">Theme</span>
							<span className="font-medium text-sm capitalize">{theme}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Default date range
							</span>
							<span className="font-medium text-sm">
								{getPresetLabel(defaultDateRange)}
							</span>
						</div>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Chart Style">
					<div className="space-y-2">
						{showGranular ? (
							<>
								<p className="font-medium text-sm">
									{CHART_LOCATION_LABELS[previewLocation]}
								</p>
								<p className="text-muted-foreground text-xs">
									{CHART_LOCATION_DESCRIPTIONS[previewLocation]}
								</p>
							</>
						) : (
							<p className="font-medium text-sm">All Charts</p>
						)}
						<div className="space-y-1 pt-1 text-xs">
							<div className="flex items-center justify-between text-muted-foreground">
								<span>Type</span>
								<span className="font-medium text-foreground">
									{CHART_TYPE_OPTIONS.find(
										(c) => c.id === previewPrefs.chartType
									)?.name ?? "Area"}
								</span>
							</div>
							{previewPrefs.chartType !== "bar" && (
								<div className="flex items-center justify-between text-muted-foreground">
									<span>Style</span>
									<span className="font-medium text-foreground">
										{STEP_TYPE_OPTIONS.find(
											(s) => s.id === previewPrefs.chartStepType
										)?.name ?? "Smooth"}
									</span>
								</div>
							)}
						</div>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Keyboard Shortcuts">
					<KeyboardShortcuts compact />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
