import { cn } from "@/lib/utils";

interface TabConfig<TData> {
	columns: any[];
	data: TData[];
	getFilter?: (row: TData) => { field: string; value: string };
	id: string;
	label: string;
}

interface TableTabsProps<TData> {
	activeTab: string;
	onTabChange: (tabId: string) => void;
	tabs: TabConfig<TData>[];
}

export function TableTabs<TData>({
	tabs,
	activeTab,
	onTabChange,
}: TableTabsProps<TData>) {
	if (!tabs?.length || tabs.length <= 1) {
		return null;
	}

	return (
		<div className="flex gap-1 border-b bg-card px-3" role="tablist">
			{tabs.map((tab) => {
				const isActive = activeTab === tab.id;
				const itemCount = tab.data?.length || 0;

				return (
					<button
						aria-controls={`tabpanel-${tab.id}`}
						aria-selected={isActive}
						className={cn(
							"-mb-px cursor-pointer border-b-2 px-3 py-2 font-medium text-sm transition-colors hover:text-foreground",
							isActive
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground"
						)}
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						role="tab"
						type="button"
					>
						{tab.label}
						{itemCount > 0 && (
							<span className="ml-1.5 text-muted-foreground text-xs tabular-nums">
								{itemCount > 999 ? "999+" : itemCount}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
