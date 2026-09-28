"use client";

import { isSelfHosted } from "@databuddy/env/public";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { StatCard } from "@/components/analytics/stat-card";
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
import {
	CaretUpDownIcon,
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
} from "@databuddy/ui/icons";
import { DropdownMenu, Switch } from "@databuddy/ui/client";
import {
	Button,
	Card,
	SegmentedControl,
	Text,
	useHydrated,
} from "@databuddy/ui";

type IconComponent = typeof ChartBarIcon;

const MOCK_CHART_DATA = [
	{ date: "2024-01-01", value: 186 },
	{ date: "2024-01-02", value: 305 },
	{ date: "2024-01-03", value: 237 },
	{ date: "2024-01-04", value: 73 },
	{ date: "2024-01-05", value: 209 },
	{ date: "2024-01-06", value: 214 },
];

const THEME_OPTIONS = [
	{ value: "light", label: "Light", icon: SunIcon },
	{ value: "dark", label: "Dark", icon: MoonIcon },
	{ value: "system", label: "System", icon: DesktopIcon },
] as const;

type ThemeValue = (typeof THEME_OPTIONS)[number]["value"];

const THEME_SEGMENTS = THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
	value,
	label: (
		<span className="flex items-center gap-1.5">
			<Icon className="size-3.5" />
			{label}
		</span>
	),
}));

interface PickerOption<T extends string> {
	icon?: IconComponent;
	label: string;
	value: T;
}

const CHART_TYPE_OPTIONS: PickerOption<ChartSeriesKind>[] = [
	{ value: "area", label: "Area", icon: StackIcon },
	{ value: "line", label: "Line", icon: ChartLineIcon },
	{ value: "bar", label: "Bar", icon: ChartBarIcon },
];

const CURVE_OPTIONS: PickerOption<ChartCurveType>[] = [
	{ value: "monotone", label: "Smooth" },
	{ value: "linear", label: "Linear" },
	{ value: "step", label: "Step" },
	{ value: "stepBefore", label: "Step before" },
	{ value: "stepAfter", label: "Step after" },
];

const DATE_RANGE_OPTIONS: PickerOption<DefaultDateRangePreset>[] = (
	["24h", "7d", "30d", "90d", "180d", "365d"] as const
).map((value) => ({ value, label: getPresetLabel(value) }));

const LOCATION_ICONS: Record<ChartLocation, IconComponent> = {
	"overview-stats": SquaresFourIcon,
	"overview-main": PresentationChartIcon,
	funnels: FunnelIcon,
	"website-list": ChartLineIcon,
	events: CursorClickIcon,
};

const DEFAULT_LOCATION_PREFERENCES = {
	chartType: "area" as ChartSeriesKind,
	chartStepType: "monotone" as ChartCurveType,
};

const HOMEPAGE_REDIRECT_COOKIE = "databuddy-home-redirect";

function readOpensDashboard() {
	return !document.cookie
		.split("; ")
		.includes(`${HOMEPAGE_REDIRECT_COOKIE}=off`);
}

function writeOpensDashboard(opensDashboard: boolean) {
	const lifetime = opensDashboard ? "max-age=0" : "max-age=34560000";
	const scope = location.hostname.endsWith(".databuddy.cc")
		? "; domain=.databuddy.cc; secure"
		: "";
	document.cookie = `${HOMEPAGE_REDIRECT_COOKIE}=off; path=/; ${lifetime}; samesite=lax${scope}`;
}

function PreferenceRow({
	children,
	description,
	title,
}: {
	children: ReactNode;
	description: ReactNode;
	title: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
			<div className="min-w-0">
				<p className="font-medium text-[13px] text-foreground">{title}</p>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function PreferencePicker<T extends string>({
	disabled,
	label,
	onChange,
	options,
	value,
}: {
	disabled?: boolean;
	label: string;
	onChange: (value: T) => void;
	options: PickerOption<T>[];
	value: T;
}) {
	const selected = options.find((option) => option.value === value);
	const SelectedIcon = selected?.icon;

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				aria-label={label}
				disabled={disabled}
				render={
					<Button
						className="w-32 justify-between"
						size="sm"
						variant="secondary"
					>
						<span className="flex min-w-0 items-center gap-1.5">
							{SelectedIcon && (
								<SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<span className="truncate">{selected?.label}</span>
						</span>
						<CaretUpDownIcon
							aria-hidden="true"
							className="size-3 shrink-0 text-muted-foreground"
						/>
					</Button>
				}
			/>
			<DropdownMenu.Content align="end" className="min-w-32">
				<DropdownMenu.RadioGroup
					onValueChange={(next) => {
						const option = options.find((item) => item.value === next);
						if (option) {
							onChange(option.value);
						}
					}}
					value={value}
				>
					{options.map(
						({ icon: Icon, label: optionLabel, value: optionValue }) => (
							<DropdownMenu.RadioItem
								className={cn(optionValue === value && "font-medium")}
								key={optionValue}
								value={optionValue}
							>
								{Icon && <Icon className="size-3.5 text-muted-foreground" />}
								{optionLabel}
							</DropdownMenu.RadioItem>
						)
					)}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

export default function AppearanceSettingsPage() {
	const isHydrated = useHydrated();
	const { theme, setTheme } = useTheme();
	const { defaultDateRange, setDefaultDateRange } = useDefaultDateRange();
	const { preferences, updateLocationPreferences, updateAllPreferences } =
		useAllChartPreferences();
	const [opensDashboard, setOpensDashboard] = useState(true);
	const [showOverrides, setShowOverrides] = useState(false);
	const [previewLocation, setPreviewLocation] = useState<ChartLocation | null>(
		null
	);

	useEffect(() => setOpensDashboard(readOpensDashboard()), []);

	const themeValue: ThemeValue =
		(isHydrated &&
			THEME_OPTIONS.find((option) => option.value === theme)?.value) ||
		"system";
	const globalPrefs =
		preferences["overview-stats"] ?? DEFAULT_LOCATION_PREFERENCES;
	const previewedLocation = showOverrides ? previewLocation : null;
	const previewPrefs = previewedLocation
		? (preferences[previewedLocation] ?? globalPrefs)
		: globalPrefs;

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-4xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Card.Title>General</Card.Title>
						<Card.Description>Saved in this browser</Card.Description>
					</Card.Header>
					<Card.Content className="divide-y divide-border/60 p-0">
						<PreferenceRow
							description="Follow your system or pick one"
							title="Theme"
						>
							<SegmentedControl
								onChange={setTheme}
								options={THEME_SEGMENTS}
								size="sm"
								value={themeValue}
							/>
						</PreferenceRow>
						<PreferenceRow
							description="Where analytics pages start when you open them"
							title="Default date range"
						>
							<PreferencePicker
								label="Default date range"
								onChange={setDefaultDateRange}
								options={DATE_RANGE_OPTIONS}
								value={defaultDateRange}
							/>
						</PreferenceRow>
						{!isSelfHosted && (
							<PreferenceRow
								description="Visiting databuddy.cc while signed in opens the dashboard. Links from the dashboard and docs still show the homepage."
								title="Skip the homepage"
							>
								<Switch
									aria-label="Skip the homepage"
									checked={opensDashboard}
									onCheckedChange={(checked) => {
										writeOpensDashboard(checked);
										setOpensDashboard(checked);
									}}
								/>
							</PreferenceRow>
						)}
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Card.Title>Charts</Card.Title>
						<Card.Description>
							How charts look across your analytics pages
						</Card.Description>
					</Card.Header>
					<Card.Content className="space-y-2.5">
						<Text tone="muted" variant="caption">
							{previewedLocation
								? `Preview · ${CHART_LOCATION_LABELS[previewedLocation]}`
								: "Preview"}
						</Text>
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
					</Card.Content>
					<div className="divide-y divide-border/60 border-border/60 border-t">
						<PreferenceRow
							description="Applies to every page and replaces overrides"
							title="Chart type"
						>
							<PreferencePicker
								label="Chart type"
								onChange={(chartType) => updateAllPreferences({ chartType })}
								options={CHART_TYPE_OPTIONS}
								value={globalPrefs.chartType}
							/>
						</PreferenceRow>
						<PreferenceRow
							description={
								globalPrefs.chartType === "bar"
									? "Bar charts have no curve"
									: "How lines connect between data points"
							}
							title="Curve"
						>
							<PreferencePicker
								disabled={globalPrefs.chartType === "bar"}
								label="Curve"
								onChange={(chartStepType) =>
									updateAllPreferences({ chartStepType })
								}
								options={CURVE_OPTIONS}
								value={globalPrefs.chartStepType}
							/>
						</PreferenceRow>
						<PreferenceRow
							description="Give specific pages their own style"
							title="Per-page overrides"
						>
							<Button
								aria-expanded={showOverrides}
								onClick={() => setShowOverrides((open) => !open)}
								size="sm"
								variant="secondary"
							>
								{showOverrides ? "Done" : "Customize"}
							</Button>
						</PreferenceRow>
						{showOverrides &&
							CHART_LOCATIONS.map((location) => {
								const prefs =
									preferences[location] ?? DEFAULT_LOCATION_PREFERENCES;
								const LocationIcon = LOCATION_ICONS[location];
								const isPreviewed = location === previewedLocation;

								return (
									<div
										className={cn(
											"flex items-center gap-2 py-2 pr-5 pl-3",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											isPreviewed && "bg-interactive-hover"
										)}
										key={location}
									>
										<Button
											className="min-w-0 flex-1 justify-start gap-2.5 px-2 hover:bg-transparent"
											onClick={() =>
												setPreviewLocation(isPreviewed ? null : location)
											}
											size="sm"
											variant="ghost"
										>
											<LocationIcon className="size-4 shrink-0 text-muted-foreground" />
											<span
												className={cn(
													"truncate text-[13px] text-foreground",
													isPreviewed ? "font-medium" : "font-normal"
												)}
											>
												{CHART_LOCATION_LABELS[location]}
											</span>
										</Button>
										<PreferencePicker
											label={`${CHART_LOCATION_LABELS[location]} chart type`}
											onChange={(chartType) => {
												updateLocationPreferences(location, { chartType });
												setPreviewLocation(location);
											}}
											options={CHART_TYPE_OPTIONS}
											value={prefs.chartType}
										/>
										<PreferencePicker
											disabled={prefs.chartType === "bar"}
											label={`${CHART_LOCATION_LABELS[location]} curve`}
											onChange={(chartStepType) => {
												updateLocationPreferences(location, { chartStepType });
												setPreviewLocation(location);
											}}
											options={CURVE_OPTIONS}
											value={prefs.chartStepType}
										/>
									</div>
								);
							})}
					</div>
				</Card>
			</div>
		</div>
	);
}
