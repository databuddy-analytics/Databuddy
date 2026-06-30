"use client";

import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { DeviceTypeCell } from "@/components/analytics";
import { CountryFlag } from "@/components/icon";
import type { ReferrerEntry } from "@/components/table/rows/referrer-row";
import { formatNumber } from "@/lib/formatters";
import { MapPinIcon } from "@databuddy/ui/icons";
import { PercentageBadge } from "@databuddy/ui";

export interface SourceEntry extends ReferrerEntry {
	clicks: number;
	name: string;
	percentage: number;
}

export interface GeoEntry {
	clicks: number;
	country_code: string;
	country_name: string;
	name: string;
	percentage: number;
}

export function createGeoColumns(
	type: "country" | "region" | "city"
): ColumnDef<GeoEntry>[] {
	return [
		{
			id: type,
			accessorKey: type === "country" ? "country_name" : "name",
			header: type.charAt(0).toUpperCase() + type.slice(1),
			cell: (info: CellContext<GeoEntry, unknown>) => {
				const entry = info.row.original;
				const name = (info.getValue() as string) || "";
				const countryCode = entry.country_code;
				const countryName = entry.country_name;

				const getIcon = () => {
					if (countryCode && countryCode !== "Unknown" && countryCode !== "") {
						return <CountryFlag country={countryCode} size={18} />;
					}
					if (type === "country" && name && name !== "Unknown") {
						return <CountryFlag country={name} size={18} />;
					}
					return (
						<MapPinIcon
							className="size-[18px] text-muted-foreground"
							weight="duotone"
						/>
					);
				};

				const formatName = () => {
					if (type === "country") {
						return name || "Unknown";
					}
					if (countryName && name) {
						return `${name}, ${countryName}`;
					}
					return name || `Unknown ${type}`;
				};

				return (
					<div className="flex items-center gap-2">
						{getIcon()}
						<span className="font-medium">{formatName()}</span>
					</div>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: (info: CellContext<GeoEntry, unknown>) => (
				<span className="font-medium tabular-nums">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<GeoEntry, unknown>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

export function createDeviceColumns(): ColumnDef<SourceEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Device",
			cell: ({ row }: CellContext<SourceEntry, unknown>) => {
				const entry = row.original;
				return (
					<DeviceTypeCell
						device_type={entry.name?.toLowerCase() || "unknown"}
					/>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => (
				<span className="font-medium tabular-nums">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
