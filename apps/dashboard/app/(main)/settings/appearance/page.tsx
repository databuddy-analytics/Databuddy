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
	type LocationPreferences,
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
	LayoutIcon,
	MoonIcon,
	PresentationChartIcon,
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

type Icon = typeof ChartBarIcon;

interface PickerOption<T extends string> {
	icon?: Icon;
	label: string;
	value: T;
}

const VISITORS_DATA = [
	{ date: "2024-01-01", value: 186 },
	{ date: "2024-01-02", value: 305 },
	{ date: "2024-01-03", value: 237 },
	{ date: "2024-01-04", value: 73 },
	{ date: "2024-01-05", value: 209 },
	{ date: "2024-01-06", value: 214 },
];

const PAGEVIEWS_DATA = VISITORS_DATA.map((point) => ({
	...point,
	value: point.value * 1.5,
}));

const THEME_OPTIONS = [
	{ value: "light", label: "Light", icon: SunIcon },
	{ value: "dark", label: "Dark", icon: MoonIcon },
	{ value: "system", label: "System", icon: DesktopIcon },
].map(({ value, label, icon: ThemeIcon }) => ({
	value,
	label: (
		<span className="flex items-center gap-1.5">
			<ThemeIcon className="size-3.5" />
			{label}
		</span>
	),
}));

const DATE_RANGE_OPTIONS: PickerOption<DefaultDateRangePreset>[] = (
	["24h", "7d", "30d", "90d", "180d", "365d"] as const
).map((value) => ({ value, label: getPresetLabel(value) }));

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

const LOCATION_ICONS: Record<ChartLocation, Icon> = {
	"overview-stats": LayoutIcon,
	"overview-main": PresentationChartIcon,
	funnels: FunnelIcon,
	"website-list": ChartLineIcon,
	events: CursorClickIcon,
};

const DEFAULT_PREFERENCES: LocationPreferences = {
	chartType: "area",
	chartStepType: "monotone",
};

const HOMEPAGE_REDIRECT_COOKIE = "databuddy-home-redirect";

function readSkipsHomepage() {
	return !document.cookie
		.split("; ")
		.includes(`${HOMEPAGE_REDIRECT_COOKIE}=off`);
}

function saveSkipsHomepage(skips: boolean) {
	const maxAge = skips ? 0 : 400 * 24 * 60 * 60;
	const scope = location.hostname.endsWith(".databuddy.cc")
		? "; domain=.databuddy.cc; secure"
		: "";
	document.cookie = `${HOMEPAGE_REDIRECT_COOKIE}=off; path=/; max-age=${maxAge}; samesite=lax${scope}`;
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
				aria-label={`${label}: ${selected?.label}`}
				disabled={disabled}
				render={
					<Button
						className="w-full justify-between sm:w-32"
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
					{options.map((option) => (
						<DropdownMenu.RadioItem
							className={cn(option.value === value && "font-medium")}
							key={option.value}
							value={option.value}
						>
							{option.icon && (
								<option.icon className="size-3.5 text-muted-foreground" />
							)}
							{option.label}
						</DropdownMenu.RadioItem>
					))}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function OverrideRow({
	isPreviewed,
	location,
	onChange,
	onPreview,
	preferences,
}: {
	isPreviewed: boolean;
	location: ChartLocation;
	onChange: (preferences: Partial<LocationPreferences>) => void;
	onPreview: () => void;
	preferences: LocationPreferences;
}) {
	const label = CHART_LOCATION_LABELS[location];
	const LocationIcon = LOCATION_ICONS[location];

	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 py-2 pr-5 pl-3 sm:flex-row sm:items-center sm:gap-2",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				isPreviewed && "bg-interactive-hover"
			)}
		>
			<Button
				aria-pressed={isPreviewed}
				className="min-w-0 justify-start gap-2.5 px-2 hover:bg-transparent sm:flex-1"
				onClick={onPreview}
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
					{label}
				</span>
			</Button>
			<div className="grid grid-cols-2 gap-2 pl-2 sm:flex sm:pl-0">
				<PreferencePicker
					label={`${label} chart type`}
					onChange={(chartType) => onChange({ chartType })}
					options={CHART_TYPE_OPTIONS}
					value={preferences.chartType}
				/>
				<PreferencePicker
					disabled={preferences.chartType === "bar"}
					label={`${label} curve`}
					onChange={(chartStepType) => onChange({ chartStepType })}
					options={CURVE_OPTIONS}
					value={preferences.chartStepType}
				/>
			</div>
		</div>
	);
}

export default function AppearanceSettingsPage() {
	const isHydrated = useHydrated();
	const { theme, setTheme } = useTheme();
	const { defaultDateRange, setDefaultDateRange } = useDefaultDateRange();
	const { preferences, updateLocationPreferences, updateAllPreferences } =
		useAllChartPreferences();
	const [skipsHomepage, setSkipsHomepage] = useState(true);
	const [showOverrides, setShowOverrides] = useState(false);
	const [previewLocation, setPreviewLocation] = useState<ChartLocation | null>(
		null
	);

	useEffect(() => setSkipsHomepage(readSkipsHomepage()), []);

	const themeValue =
		isHydrated && (theme === "light" || theme === "dark") ? theme : "system";
	const preferencesFor = (location: ChartLocation) =>
		preferences[location] ?? DEFAULT_PREFERENCES;
	const globalPreferences = preferencesFor("overview-stats");
	const previewPreferences = previewLocation
		? preferencesFor(previewLocation)
		: globalPreferences;
	const everyPageIsBar = CHART_LOCATIONS.every(
		(location) => preferencesFor(location).chartType === "bar"
	);

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
								aria-label="Theme"
								onChange={setTheme}
								options={THEME_OPTIONS}
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
									checked={skipsHomepage}
									onCheckedChange={(checked) => {
										saveSkipsHomepage(checked);
										setSkipsHomepage(checked);
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
							{previewLocation
								? `Preview · ${CHART_LOCATION_LABELS[previewLocation]}`
								: "Preview"}
						</Text>
						<div className="grid gap-3 sm:grid-cols-2">
							<StatCard
								chartData={VISITORS_DATA}
								chartStepType={previewPreferences.chartStepType}
								chartType={previewPreferences.chartType}
								icon={ChartLineIcon}
								id="preview-visitors"
								showChart
								title="Visitors"
								value="1,234"
							/>
							<StatCard
								chartData={PAGEVIEWS_DATA}
								chartStepType={previewPreferences.chartStepType}
								chartType={previewPreferences.chartType}
								icon={StackIcon}
								id="preview-pageviews"
								showChart
								title="Pageviews"
								value="3,456"
							/>
						</div>
					</Card.Content>
					<Card.Content className="divide-y divide-border/60 border-border/60 border-t p-0">
						<PreferenceRow
							description="Applies to every page and replaces overrides"
							title="Chart type"
						>
							<PreferencePicker
								label="Chart type"
								onChange={(chartType) => updateAllPreferences({ chartType })}
								options={CHART_TYPE_OPTIONS}
								value={globalPreferences.chartType}
							/>
						</PreferenceRow>
						<PreferenceRow
							description={
								everyPageIsBar
									? "Bar charts have no curve"
									: "How lines connect between data points"
							}
							title="Curve"
						>
							<PreferencePicker
								disabled={everyPageIsBar}
								label="Curve"
								onChange={(chartStepType) =>
									updateAllPreferences({ chartStepType })
								}
								options={CURVE_OPTIONS}
								value={globalPreferences.chartStepType}
							/>
						</PreferenceRow>
						<PreferenceRow
							description="Give specific pages their own style"
							title="Per-page overrides"
						>
							<Button
								aria-expanded={showOverrides}
								onClick={() => {
									setShowOverrides((open) => !open);
									setPreviewLocation(null);
								}}
								size="sm"
								variant="secondary"
							>
								{showOverrides ? "Done" : "Customize"}
							</Button>
						</PreferenceRow>
						{showOverrides &&
							CHART_LOCATIONS.map((location) => (
								<OverrideRow
									isPreviewed={location === previewLocation}
									key={location}
									location={location}
									onChange={(changes) => {
										updateLocationPreferences(location, changes);
										setPreviewLocation(location);
									}}
									onPreview={() =>
										setPreviewLocation(
											location === previewLocation ? null : location
										)
									}
									preferences={preferencesFor(location)}
								/>
							))}
					</Card.Content>
				</Card>
			</div>
		</div>
	);
}
