"use client";

import { MapPinIcon } from "@phosphor-icons/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { DeviceTypeCell } from "@/components/analytics";
import { ReferrerSourceCell } from "@/components/atomic/ReferrerSourceCell";
import { CountryFlag } from "@/components/icon";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { formatNumber } from "@/lib/formatters";

export interface SourceEntry {
	clicks: number;
	domain?: string;
	name: string;
	percentage: number;
	referrer?: string;
}

export interface GeoEntry {
	clicks: number;
	country_code: string;
	country_name: string;
	name: string;
	percentage: number;
}

function extractDomain(referrer: string | undefined): string | undefined {
	if (!referrer || referrer === "Direct" || referrer === "") {
		return undefined;
	}
	try {
		if (referrer.startsWith("http://") || referrer.startsWith("https://")) {
			return new URL(referrer).hostname;
		}
		const cleaned = referrer.replace(/^\/+|\/+$/g, "");
		if (cleaned.includes(".")) {
			return cleaned.split("/")[0];
		}
		return undefined;
	} catch {
		return undefined;
	}
}

export function createReferrerColumns(): ColumnDef<SourceEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Source",
			cell: ({ row }: CellContext<SourceEntry, unknown>) => {
				const entry = row.original;
				const domain =
					entry.domain || extractDomain(entry.referrer || entry.name);
				return (
					<ReferrerSourceCell
						domain={domain}
						name={entry.name}
						referrer={entry.referrer}
					/>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => (
				<span className="font-medium text-foreground tabular-nums">
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
						return <CountryFlag country={countryCode} size={16} />;
					}
					if (type === "country" && name && name !== "Unknown") {
						return <CountryFlag country={name} size={16} />;
					}
					return (
						<MapPinIcon
							className="size-4 text-muted-foreground"
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
