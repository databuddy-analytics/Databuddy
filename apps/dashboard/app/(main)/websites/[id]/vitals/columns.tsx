"use client";

import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import type { ColumnDef } from "@tanstack/react-table";
import { BrowserIcon, CountryFlag } from "@/components/icon";
import { WebVitalsMetricCell } from "../_components/tabs/performance/_components/web-vitals-metric-cell";
import {
	formatNumber,
	formatPerformanceTime,
} from "../_components/tabs/performance/_utils/performance-utils";

export type VitalsBreakdownData = {
	name: string;
	samples: number;
	visitors?: number;
	lcp?: number;
	fcp?: number;
	cls?: number;
	inp?: number;
	ttfb?: number;
	fps?: number;
	country_code?: string;
	country_name?: string;
};

const createMetricColumns = (): ColumnDef<VitalsBreakdownData>[] => [
	{
		id: "samples",
		accessorKey: "samples",
		header: "Samples",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground text-sm">
				{formatNumber(getValue() as number)}
			</span>
		),
	},
	{
		id: "lcp",
		accessorKey: "lcp",
		header: "LCP",
		cell: ({ row }) => (
			<WebVitalsMetricCell metric="lcp" value={row.original.lcp} />
		),
	},
	{
		id: "fcp",
		accessorKey: "fcp",
		header: "FCP",
		cell: ({ row }) => (
			<WebVitalsMetricCell metric="fcp" value={row.original.fcp} />
		),
	},
	{
		id: "cls",
		accessorKey: "cls",
		header: "CLS",
		cell: ({ row }) => (
			<WebVitalsMetricCell metric="cls" value={row.original.cls} />
		),
	},
	{
		id: "inp",
		accessorKey: "inp",
		header: "INP",
		cell: ({ row }) => (
			<WebVitalsMetricCell metric="inp" value={row.original.inp} />
		),
	},
	{
		id: "ttfb",
		accessorKey: "ttfb",
		header: "TTFB",
		cell: ({ row }) => {
			const value = row.original.ttfb;
			if (!value || value === 0) {
				return <span className="text-muted-foreground">N/A</span>;
			}
			const thresholds = { good: 800, poor: 1800 };
			const isGood = value <= thresholds.good;
			const isPoor = value > thresholds.poor;
			const colorClass = isGood
				? "text-green-600"
				: isPoor
					? "text-red-600"
					: "text-yellow-600";
			return <span className={colorClass}>{formatPerformanceTime(value)}</span>;
		},
	},
];

export const createPageColumns = (): ColumnDef<VitalsBreakdownData>[] => [
	{
		id: "name",
		accessorKey: "name",
		header: "Page",
		cell: ({ getValue }) => {
			const name = getValue() as string;
			return <span className="truncate font-medium text-sm">{name}</span>;
		},
	},
	...createMetricColumns(),
];

export const createCountryColumns = (): ColumnDef<VitalsBreakdownData>[] => [
	{
		id: "name",
		accessorKey: "name",
		header: "Country",
		cell: ({ row }) => {
			const name = row.original.country_name || row.original.name || "Unknown";
			const countryCode = row.original.country_code || row.original.name || "";
			return (
				<div className="flex items-center gap-2">
					<CountryFlag country={countryCode} size={16} />
					<span className="truncate font-medium text-sm">{name}</span>
				</div>
			);
		},
	},
	{
		id: "visitors",
		accessorKey: "visitors",
		header: "Visitors",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground text-sm">
				{formatNumber((getValue() as number) || 0)}
			</span>
		),
	},
	...createMetricColumns(),
];

export const createBrowserColumns = (): ColumnDef<VitalsBreakdownData>[] => [
	{
		id: "name",
		accessorKey: "name",
		header: "Browser",
		cell: ({ getValue }) => {
			const name = getValue() as string;
			return (
				<div className="flex items-center gap-2">
					<BrowserIcon name={name} size="sm" />
					<span className="truncate font-medium text-sm">{name}</span>
				</div>
			);
		},
	},
	{
		id: "visitors",
		accessorKey: "visitors",
		header: "Visitors",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground text-sm">
				{formatNumber((getValue() as number) || 0)}
			</span>
		),
	},
	...createMetricColumns(),
];

export const createDeviceColumns = (): ColumnDef<VitalsBreakdownData>[] => [
	{
		id: "name",
		accessorKey: "name",
		header: "Device",
		cell: ({ getValue }) => {
			const name = getValue() as string;
			const deviceLabels: Record<string, string> = {
				mobile: "Mobile",
				desktop: "Desktop",
				tablet: "Tablet",
			};
			return (
				<span className="truncate font-medium text-sm">
					{deviceLabels[name.toLowerCase()] || name}
				</span>
			);
		},
	},
	{
		id: "visitors",
		accessorKey: "visitors",
		header: "Visitors",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground text-sm">
				{formatNumber((getValue() as number) || 0)}
			</span>
		),
	},
	...createMetricColumns(),
];

export const createRegionColumns = (): ColumnDef<VitalsBreakdownData>[] => {
	const getRegionCountryIcon = (name: string) => {
		if (typeof name !== "string" || !name.includes(",")) {
			return <CountryFlag country={""} size={16} />;
		}
		const countryPart = name.split(",")[1]?.trim();
		const code = getCountryCode(countryPart || "");
		return <CountryFlag country={code} size={16} />;
	};

	const formatRegionName = (name: string) => {
		if (typeof name !== "string" || !name.includes(",")) {
			return name || "Unknown region";
		}
		const [region, countryPart] = name.split(",").map((s) => s.trim());
		if (!(region && countryPart)) {
			return name || "Unknown region";
		}
		const code = getCountryCode(countryPart);
		const countryName = getCountryName(code);
		if (
			countryName &&
			region &&
			countryName.toLowerCase() === region.toLowerCase()
		) {
			return countryName;
		}
		return countryName ? `${region}, ${countryName}` : name;
	};

	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Region",
			cell: ({ row }) => {
				const name = row.original.name || "Unknown region";
				return (
					<div className="flex items-center gap-2">
						{getRegionCountryIcon(name)}
						<span className="truncate font-medium text-sm">
							{formatRegionName(name)}
						</span>
					</div>
				);
			},
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: ({ getValue }) => (
				<span className="text-muted-foreground text-sm">
					{formatNumber((getValue() as number) || 0)}
				</span>
			),
		},
		...createMetricColumns(),
	];
};

export const createCityColumns = (): ColumnDef<VitalsBreakdownData>[] => {
	const getCityCountryIcon = (name: string) => {
		if (typeof name !== "string" || !name.includes(",")) {
			return <CountryFlag country={""} size={16} />;
		}
		const countryPart = name.split(",")[1]?.trim();
		const code = getCountryCode(countryPart || "");
		return <CountryFlag country={code} size={16} />;
	};

	const formatCityName = (name: string) => {
		if (typeof name !== "string" || !name.includes(",")) {
			return name || "Unknown city";
		}
		const [city, countryPart] = name.split(",").map((s) => s.trim());
		if (!(city && countryPart)) {
			return name || "Unknown city";
		}
		const code = getCountryCode(countryPart);
		const countryName = getCountryName(code);
		return countryName ? `${city}, ${countryName}` : name;
	};

	return [
		{
			id: "name",
			accessorKey: "name",
			header: "City",
			cell: ({ row }) => {
				const name = row.original.name || "Unknown city";
				return (
					<div className="flex items-center gap-2">
						{getCityCountryIcon(name)}
						<span className="truncate font-medium text-sm">
							{formatCityName(name)}
						</span>
					</div>
				);
			},
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: ({ getValue }) => (
				<span className="text-muted-foreground text-sm">
					{formatNumber((getValue() as number) || 0)}
				</span>
			),
		},
		...createMetricColumns(),
	];
};
