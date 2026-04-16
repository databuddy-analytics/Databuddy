"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { ColumnDef } from "@tanstack/react-table";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { DataTable } from "@/components/table/data-table";
import {
	createRevenueColumns,
	type RevenueEntry,
} from "@/components/table/rows";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";

interface RevenueAttributionTablesProps {
	dateRange: DateRange;
	isLoading?: boolean;
	onAddFilter?: (field: string, value: string) => void;
	websiteId: string;
}

export function RevenueAttributionTables({
	websiteId,
	dateRange,
	onAddFilter,
}: RevenueAttributionTablesProps) {
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const queries = useMemo(
		() => [
			{
				id: "revenue-traffic",
				parameters: [
					"revenue_by_referrer",
					"revenue_by_utm_source",
					"revenue_by_utm_medium",
					"revenue_by_utm_campaign",
					"revenue_by_entry_page",
				],
				filters,
			},
			{
				id: "revenue-geo",
				parameters: [
					"revenue_by_country",
					"revenue_by_region",
					"revenue_by_city",
				],
				filters,
			},
			{
				id: "revenue-tech",
				parameters: [
					"revenue_by_device",
					"revenue_by_browser",
					"revenue_by_os",
				],
				filters,
			},
		],
		[filters]
	);

	const { isLoading: queryLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const isLoading = queryLoading;

	const trafficData = useMemo(
		() => ({
			referrers:
				(getDataForQuery(
					"revenue-traffic",
					"revenue_by_referrer"
				) as RevenueEntry[]) || [],
			utm_sources:
				(getDataForQuery(
					"revenue-traffic",
					"revenue_by_utm_source"
				) as RevenueEntry[]) || [],
			utm_mediums:
				(getDataForQuery(
					"revenue-traffic",
					"revenue_by_utm_medium"
				) as RevenueEntry[]) || [],
			utm_campaigns:
				(getDataForQuery(
					"revenue-traffic",
					"revenue_by_utm_campaign"
				) as RevenueEntry[]) || [],
			entry_pages:
				(getDataForQuery(
					"revenue-traffic",
					"revenue_by_entry_page"
				) as RevenueEntry[]) || [],
		}),
		[getDataForQuery]
	);

	const geoData = useMemo(
		() => ({
			countries:
				(getDataForQuery(
					"revenue-geo",
					"revenue_by_country"
				) as RevenueEntry[]) || [],
			regions:
				(getDataForQuery(
					"revenue-geo",
					"revenue_by_region"
				) as RevenueEntry[]) || [],
			cities:
				(getDataForQuery("revenue-geo", "revenue_by_city") as RevenueEntry[]) ||
				[],
		}),
		[getDataForQuery]
	);

	const techData = useMemo(
		() => ({
			devices:
				(getDataForQuery(
					"revenue-tech",
					"revenue_by_device"
				) as RevenueEntry[]) || [],
			browsers:
				(getDataForQuery(
					"revenue-tech",
					"revenue_by_browser"
				) as RevenueEntry[]) || [],
			os:
				(getDataForQuery("revenue-tech", "revenue_by_os") as RevenueEntry[]) ||
				[],
		}),
		[getDataForQuery]
	);

	const referrerColumns = useMemo(
		() => createRevenueColumns({ type: "referrer" }),
		[]
	);
	const utmColumns = useMemo(
		() => createRevenueColumns({ type: "utm", nameLabel: "Source" }),
		[]
	);
	const pageColumns = useMemo(
		() => createRevenueColumns({ type: "default", nameLabel: "Entry Page" }),
		[]
	);
	const countryColumns = useMemo(
		() => createRevenueColumns({ type: "country" }),
		[]
	);
	const regionColumns = useMemo(
		() => createRevenueColumns({ type: "region" }),
		[]
	);
	const cityColumns = useMemo(() => createRevenueColumns({ type: "city" }), []);
	const deviceColumns = useMemo(
		() => createRevenueColumns({ type: "device" }),
		[]
	);
	const browserColumns = useMemo(
		() => createRevenueColumns({ type: "browser" }),
		[]
	);
	const osColumns = useMemo(() => createRevenueColumns({ type: "os" }), []);

	const trafficTabs = useMemo(
		() => [
			{
				id: "referrers",
				label: "Referrers",
				data: trafficData.referrers,
				columns: referrerColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "referrer",
					value: row.name,
				}),
			},
			{
				id: "utm_sources",
				label: "UTM Sources",
				data: trafficData.utm_sources,
				columns: utmColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "utm_source",
					value: row.name,
				}),
			},
			{
				id: "utm_mediums",
				label: "UTM Mediums",
				data: trafficData.utm_mediums,
				columns: utmColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "utm_medium",
					value: row.name,
				}),
			},
			{
				id: "utm_campaigns",
				label: "UTM Campaigns",
				data: trafficData.utm_campaigns,
				columns: utmColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "utm_campaign",
					value: row.name,
				}),
			},
			{
				id: "entry_pages",
				label: "Entry Pages",
				data: trafficData.entry_pages,
				columns: pageColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "path",
					value: row.name,
				}),
			},
		],
		[trafficData, referrerColumns, utmColumns, pageColumns]
	);

	const geoTabs = useMemo(
		() => [
			{
				id: "countries",
				label: "Countries",
				data: geoData.countries,
				columns: countryColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "country",
					value: row.country_name || row.name,
				}),
			},
			{
				id: "regions",
				label: "Regions",
				data: geoData.regions,
				columns: regionColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "region",
					value: row.name,
				}),
			},
			{
				id: "cities",
				label: "Cities",
				data: geoData.cities,
				columns: cityColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "city",
					value: row.name,
				}),
			},
		],
		[geoData, countryColumns, regionColumns, cityColumns]
	);

	const techTabs = useMemo(
		() => [
			{
				id: "devices",
				label: "Devices",
				data: techData.devices,
				columns: deviceColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "device_type",
					value: row.name,
				}),
			},
			{
				id: "browsers",
				label: "Browsers",
				data: techData.browsers,
				columns: browserColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "browser_name",
					value: row.name,
				}),
			},
			{
				id: "os",
				label: "Operating Systems",
				data: techData.os,
				columns: osColumns as ColumnDef<RevenueEntry, unknown>[],
				getFilter: (row: RevenueEntry) => ({
					field: "os_name",
					value: row.name,
				}),
			},
		],
		[techData, deviceColumns, browserColumns, osColumns]
	);

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<DataTable
					description="Revenue by traffic source with attribution"
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={trafficTabs}
					title="Traffic Sources"
				/>

				<DataTable
					description="Revenue by geographic location"
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={geoTabs}
					title="Geographic"
				/>
			</div>

			<DataTable
				description="Revenue by device and browser with attribution"
				isLoading={isLoading}
				minHeight={300}
				onAddFilter={onAddFilter}
				tabs={techTabs}
				title="Technology"
			/>
		</div>
	);
}
