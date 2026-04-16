import { CurrencyDollarIcon } from "@phosphor-icons/react";
import { MapPinIcon } from "@phosphor-icons/react";
import { QuestionIcon } from "@phosphor-icons/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { formatNumber } from "@/lib/formatters";

export interface RevenueEntry {
	country_code?: string;
	country_name?: string;
	customers: number;
	name: string;
	percentage: number;
	revenue: number;
	transactions: number;
}

const formatCurrency = (amount: number, currency = "USD"): string => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

interface RevenueRowProps {
	nameLabel?: string;
	type?:
		| "default"
		| "country"
		| "region"
		| "city"
		| "browser"
		| "device"
		| "os"
		| "referrer"
		| "utm";
}

export function createRevenueColumns({
	type = "default",
	nameLabel,
}: RevenueRowProps = {}): ColumnDef<RevenueEntry>[] {
	const getNameColumn = (): ColumnDef<RevenueEntry> => {
		const header =
			nameLabel ||
			{
				default: "Name",
				country: "Country",
				region: "Region",
				city: "City",
				browser: "Browser",
				device: "Device",
				os: "OS",
				referrer: "Referrer",
				utm: "Source",
			}[type];

		return {
			id: "name",
			accessorKey: type === "country" ? "country_name" : "name",
			header,
			cell: (info: CellContext<RevenueEntry, any>) => {
				const entry = info.row.original;
				const name = (info.getValue() as string) || entry.name || "";
				const isUnattributed = name === "Unattributed";

				const getIcon = () => {
					if (isUnattributed) {
						return (
							<QuestionIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						);
					}

					if (type === "country" || type === "region" || type === "city") {
						const countryCode = entry.country_code;
						if (
							countryCode &&
							countryCode !== "Unknown" &&
							countryCode !== "Unattributed"
						) {
							return <CountryFlag country={countryCode} size={16} />;
						}
						return (
							<MapPinIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						);
					}

					if (type === "browser") {
						return <BrowserIcon name={name} size="md" />;
					}

					if (type === "os") {
						return <OSIcon name={name} size="md" />;
					}

					return (
						<CurrencyDollarIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					);
				};

				const formatName = () => {
					if (isUnattributed) {
						return "Unattributed";
					}
					if (type === "country") {
						return name || "Unknown";
					}
					if ((type === "region" || type === "city") && entry.country_name) {
						return `${name}, ${entry.country_name}`;
					}
					return name || "Unknown";
				};

				return (
					<div className="flex items-center gap-2">
						{getIcon()}
						<span
							className={`font-medium ${isUnattributed ? "text-muted-foreground" : "text-foreground"}`}
						>
							{formatName()}
						</span>
					</div>
				);
			},
		};
	};

	return [
		getNameColumn(),
		{
			id: "revenue",
			accessorKey: "revenue",
			header: "Revenue",
			cell: (info: CellContext<RevenueEntry, any>) => {
				const value = info.getValue() as number;
				return (
					<span className="font-semibold text-success">
						{formatCurrency(value)}
					</span>
				);
			},
		},
		{
			id: "transactions",
			accessorKey: "transactions",
			header: "Transactions",
			cell: (info: CellContext<RevenueEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "customers",
			accessorKey: "customers",
			header: "Customers",
			cell: (info: CellContext<RevenueEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<RevenueEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
