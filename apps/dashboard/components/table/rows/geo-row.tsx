import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { CountryFlag } from "@/components/icon";
import { formatNumber } from "@/lib/formatters";
import { MapPinIcon } from "@databuddy/ui/icons";
import { PercentageBadge } from "@databuddy/ui";

export interface GeoEntry {
	country_code?: string;
	country_name?: string;
	name: string;
	pageviews: number;
	percentage: number;
	visitors: number;
}

interface GeoRowProps {
	type: "country" | "region" | "city";
}

export function createGeoColumns({ type }: GeoRowProps): ColumnDef<GeoEntry>[] {
	return [
		{
			id: type,
			accessorKey: type === "country" ? "country_name" : "name",
			header: type.charAt(0).toUpperCase() + type.slice(1),
			cell: (info: CellContext<GeoEntry, any>) => {
				const entry = info.row.original;
				const name = (info.getValue() as string) || "";
				const countryCode = entry.country_code;
				const countryName = entry.country_name;

				const getIcon = () => {
					if (countryCode && countryCode !== "Unknown") {
						return <CountryFlag country={countryCode} size={18} />;
					}
					return <MapPinIcon className="size-[18px] text-muted-foreground" />;
				};

				const formatName = () => {
					if (type === "country") {
						return name || "Unknown";
					}
					// Region and City format: "Name, Country"
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
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellContext<GeoEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Pageviews",
			cell: (info: CellContext<GeoEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<GeoEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
