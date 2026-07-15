"use client";

import type { DateRange } from "@/types/analytics";
import type { DynamicQueryFilter } from "@/types/api";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/table/data-table";
import {
	createRevenueColumns,
	type RevenueEntry,
} from "@/components/table/rows";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";

interface RevenueAttributionTablesProps {
	currency: string;
	dateRange: DateRange;
	enabled?: boolean;
	onAddFilter?: (field: string, value: string) => void;
	queryFilters: DynamicQueryFilter[];
	websiteId: string;
}

export function RevenueAttributionTables({
	currency,
	websiteId,
	dateRange,
	enabled = true,
	onAddFilter,
	queryFilters,
}: RevenueAttributionTablesProps) {
	const queries = useMemo(
		() => [
			{
				id: "revenue-products",
				parameters: ["revenue_by_product"],
				filters: queryFilters,
			},
			{
				id: "revenue-traffic",
				parameters: [
					"revenue_by_referrer",
					"revenue_by_utm_source",
					"revenue_by_utm_medium",
					"revenue_by_utm_campaign",
					"revenue_by_entry_page",
				],
				filters: queryFilters,
			},
			{
				id: "revenue-geo",
				parameters: [
					"revenue_by_country",
					"revenue_by_region",
					"revenue_by_city",
				],
				filters: queryFilters,
			},
			{
				id: "revenue-tech",
				parameters: [
					"revenue_by_device",
					"revenue_by_browser",
					"revenue_by_os",
				],
				filters: queryFilters,
			},
		],
		[queryFilters]
	);

	const { isLoading: queryLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries,
		{ enabled }
	);

	const isLoading = queryLoading;

	const productData = useMemo(
		() =>
			(getDataForQuery(
				"revenue-products",
				"revenue_by_product"
			) as RevenueEntry[]) || [],
		[getDataForQuery]
	);

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

	const productColumns = useMemo(
		() =>
			createRevenueColumns({ currency, type: "default", nameLabel: "Product" }),
		[currency]
	);
	const referrerColumns = useMemo(
		() => createRevenueColumns({ currency, type: "referrer" }),
		[currency]
	);
	const utmColumns = useMemo(
		() => createRevenueColumns({ currency, type: "utm", nameLabel: "Source" }),
		[currency]
	);
	const pageColumns = useMemo(
		() =>
			createRevenueColumns({
				currency,
				type: "default",
				nameLabel: "Entry Page",
			}),
		[currency]
	);
	const countryColumns = useMemo(
		() => createRevenueColumns({ currency, type: "country" }),
		[currency]
	);
	const regionColumns = useMemo(
		() => createRevenueColumns({ currency, type: "region" }),
		[currency]
	);
	const cityColumns = useMemo(
		() => createRevenueColumns({ currency, type: "city" }),
		[currency]
	);
	const deviceColumns = useMemo(
		() => createRevenueColumns({ currency, type: "device" }),
		[currency]
	);
	const browserColumns = useMemo(
		() => createRevenueColumns({ currency, type: "browser" }),
		[currency]
	);
	const osColumns = useMemo(
		() => createRevenueColumns({ currency, type: "os" }),
		[currency]
	);

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
		<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
			<DataTable
				description="Revenue by traffic source with attribution"
				isLoading={isLoading}
				minHeight={350}
				onAddFilter={onAddFilter}
				showBrandInHeader
				tabs={trafficTabs}
				title="Traffic Sources"
			/>

			<DataTable
				description="Revenue breakdown by product"
				initialPageSize={8}
				isLoading={isLoading}
				minHeight={350}
				onAddFilter={onAddFilter}
				tabs={[
					{
						id: "products",
						label: "Products",
						data: productData,
						columns: productColumns as ColumnDef<RevenueEntry, unknown>[],
					},
				]}
				title="Products"
			/>

			<DataTable
				description="Revenue by geographic location"
				isLoading={isLoading}
				minHeight={350}
				onAddFilter={onAddFilter}
				tabs={geoTabs}
				title="Geographic"
			/>

			{techTabs.map((tab) => (
				<DataTable
					description={`Revenue by ${tab.label.toLowerCase()}`}
					initialPageSize={8}
					isLoading={isLoading}
					key={tab.id}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={[tab]}
					title={tab.label}
				/>
			))}
		</div>
	);
}
