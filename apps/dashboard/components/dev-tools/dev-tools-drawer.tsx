"use client";

import {
	BugIcon,
	CaretDownIcon,
	ChartBarIcon,
	ChartLineIcon,
	CheckCircleIcon,
	ClipboardIcon,
	CopyIcon,
	DatabaseIcon,
	DesktopIcon,
	FunnelIcon,
	GearIcon,
	InfoIcon,
	LightningIcon,
	MonitorIcon,
	MoonIcon,
	PresentationChartIcon,
	SquaresFourIcon,
	StackIcon,
	SunIcon,
	TrashIcon,
	UsersIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
	ChartStepType,
	ChartType,
} from "@/components/analytics/stat-card";
import {
	CHART_LOCATION_LABELS,
	CHART_LOCATIONS,
	type ChartLocation,
	useAllChartPreferences,
} from "@/hooks/use-chart-preferences";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";

function InfoSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<h3 className="flex items-center gap-2 font-medium text-sm">
				<InfoIcon className="size-4" weight="duotone" />
				{title}
			</h3>
			<div className="rounded border bg-muted/30 p-3 text-xs">{children}</div>
		</div>
	);
}

function ActionButton({
	icon: Icon,
	label,
	onClick,
	variant = "outline",
}: {
	icon: typeof BugIcon;
	label: string;
	onClick: () => void;
	variant?: "outline" | "destructive";
}) {
	return (
		<Button
			className="flex items-center gap-2"
			onClick={onClick}
			size="sm"
			variant={variant}
		>
			<Icon className="size-4" weight="duotone" />
			{label}
		</Button>
	);
}

function EnvironmentInfo() {
	const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
	const env = process.env.NODE_ENV || "development";

	return (
		<InfoSection title="Environment">
			<div className="space-y-1.5 font-mono">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">API URL:</span>
					<span className="font-medium">{apiUrl}</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Environment:</span>
					<span className="font-medium">{env}</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Hostname:</span>
					<span className="font-medium">{window.location.hostname}</span>
				</div>
			</div>
		</InfoSection>
	);
}

function ReactQueryCache() {
	const queryClient = useQueryClient();
	const [cacheStats, setCacheStats] = useState({
		queries: 0,
		mutations: 0,
	});

	const updateStats = useCallback(() => {
		const cache = queryClient.getQueryCache();
		const mutationCache = queryClient.getMutationCache();
		setCacheStats({
			queries: cache.getAll().length,
			mutations: mutationCache.getAll().length,
		});
	}, [queryClient]);

	useEffect(() => {
		updateStats();
		const interval = setInterval(updateStats, 1000);
		return () => clearInterval(interval);
	}, [updateStats]);

	const handleClearCache = () => {
		queryClient.clear();
		updateStats();
		toast.success("React Query cache cleared");
	};

	const handleInvalidateAll = () => {
		queryClient.invalidateQueries();
		toast.success("All queries invalidated");
	};

	return (
		<InfoSection title="React Query Cache">
			<div className="space-y-3">
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Active Queries:</span>
					<span className="font-medium font-mono">{cacheStats.queries}</span>
				</div>
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Active Mutations:</span>
					<span className="font-medium font-mono">{cacheStats.mutations}</span>
				</div>
				<div className="flex flex-wrap gap-2 pt-2">
					<ActionButton
						icon={TrashIcon}
						label="Clear Cache"
						onClick={handleClearCache}
					/>
					<ActionButton
						icon={LightningIcon}
						label="Invalidate All"
						onClick={handleInvalidateAll}
					/>
				</div>
			</div>
		</InfoSection>
	);
}

function StorageManagement() {
	const [storageStats, setStorageStats] = useState({
		localStorage: 0,
		sessionStorage: 0,
	});

	const updateStats = useCallback(() => {
		let localStorageSize = 0;
		let sessionStorageSize = 0;

		for (const key in localStorage) {
			if (Object.hasOwn(localStorage, key)) {
				localStorageSize += localStorage[key].length + key.length;
			}
		}

		for (const key in sessionStorage) {
			if (Object.hasOwn(sessionStorage, key)) {
				sessionStorageSize += sessionStorage[key].length + key.length;
			}
		}

		setStorageStats({
			localStorage: localStorageSize,
			sessionStorage: sessionStorageSize,
		});
	}, []);

	useEffect(() => {
		updateStats();
		const interval = setInterval(updateStats, 2000);
		return () => clearInterval(interval);
	}, [updateStats]);

	const formatBytes = (bytes: number) => {
		if (bytes === 0) {
			return "0 B";
		}
		const k = 1024;
		const sizes = ["B", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
	};

	const handleClearLocalStorage = () => {
		localStorage.clear();
		updateStats();
		toast.success("LocalStorage cleared");
	};

	const handleClearSessionStorage = () => {
		sessionStorage.clear();
		updateStats();
		toast.success("SessionStorage cleared");
	};

	return (
		<InfoSection title="Storage">
			<div className="space-y-3">
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">LocalStorage:</span>
					<span className="font-medium font-mono">
						{formatBytes(storageStats.localStorage)}
					</span>
				</div>
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">SessionStorage:</span>
					<span className="font-medium font-mono">
						{formatBytes(storageStats.sessionStorage)}
					</span>
				</div>
				<div className="flex flex-wrap gap-2 pt-2">
					<ActionButton
						icon={TrashIcon}
						label="Clear LocalStorage"
						onClick={handleClearLocalStorage}
						variant="destructive"
					/>
					<ActionButton
						icon={TrashIcon}
						label="Clear SessionStorage"
						onClick={handleClearSessionStorage}
						variant="destructive"
					/>
				</div>
			</div>
		</InfoSection>
	);
}

function PerformanceInfo() {
	const [memoryInfo, setMemoryInfo] = useState<{
		usedJSHeapSize?: number;
		totalJSHeapSize?: number;
		jsHeapSizeLimit?: number;
	}>({});

	useEffect(() => {
		let animationFrameId: number;
		let lastUpdate = 0;
		const throttleMs = 100; // Update at most every 500ms

		const updateMemory = (timestamp: number) => {
			if (timestamp - lastUpdate >= throttleMs) {
				if ("memory" in performance) {
					const mem = (performance as { memory?: typeof memoryInfo }).memory;
					if (mem) {
						setMemoryInfo({
							usedJSHeapSize: mem.usedJSHeapSize,
							totalJSHeapSize: mem.totalJSHeapSize,
							jsHeapSizeLimit: mem.jsHeapSizeLimit,
						});
					}
				}
				lastUpdate = timestamp;
			}

			animationFrameId = requestAnimationFrame(updateMemory);
		};

		// Initial update
		if ("memory" in performance) {
			const mem = (performance as { memory?: typeof memoryInfo }).memory;
			if (mem) {
				setMemoryInfo({
					usedJSHeapSize: mem.usedJSHeapSize,
					totalJSHeapSize: mem.totalJSHeapSize,
					jsHeapSizeLimit: mem.jsHeapSizeLimit,
				});
			}
		}

		animationFrameId = requestAnimationFrame(updateMemory);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, []);

	const formatBytes = (bytes?: number) => {
		if (!bytes) {
			return "N/A";
		}
		const k = 1024;
		const sizes = ["B", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
	};

	if (Object.keys(memoryInfo).length === 0) {
		return null;
	}

	return (
		<InfoSection title="Performance">
			<div className="space-y-1.5 text-xs">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Used Heap:</span>
					<span className="font-medium font-mono">
						{formatBytes(memoryInfo.usedJSHeapSize)}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Total Heap:</span>
					<span className="font-medium font-mono">
						{formatBytes(memoryInfo.totalJSHeapSize)}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Heap Limit:</span>
					<span className="font-medium font-mono">
						{formatBytes(memoryInfo.jsHeapSizeLimit)}
					</span>
				</div>
			</div>
		</InfoSection>
	);
}

const THEME_OPTIONS = [
	{
		id: "light",
		name: "Light",
		icon: SunIcon,
	},
	{
		id: "dark",
		name: "Dark",
		icon: MoonIcon,
	},
	{
		id: "system",
		name: "System",
		icon: DesktopIcon,
	},
] as const;

const CHART_TYPE_OPTIONS: {
	id: ChartType;
	name: string;
	icon: typeof ChartBarIcon;
}[] = [
	{ id: "bar", name: "Bar", icon: ChartBarIcon },
	{ id: "line", name: "Line", icon: ChartLineIcon },
	{ id: "area", name: "Area", icon: StackIcon },
];

const STEP_TYPE_OPTIONS: { id: ChartStepType; name: string }[] = [
	{ id: "monotone", name: "Smooth" },
	{ id: "linear", name: "Linear" },
	{ id: "step", name: "Step" },
	{ id: "stepBefore", name: "Step Before" },
	{ id: "stepAfter", name: "Step After" },
];

const LOCATION_ICONS: Record<ChartLocation, typeof ChartLineIcon> = {
	"overview-stats": SquaresFourIcon,
	"overview-main": PresentationChartIcon,
	funnels: FunnelIcon,
	retention: UsersIcon,
	"website-list": ChartLineIcon,
};

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();
	const { preferences, updateLocationPreferences, updateAllPreferences } =
		useAllChartPreferences();
	const [showGranular, setShowGranular] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	const currentTheme = theme ?? "system";
	const globalPrefs = preferences["overview-stats"] ?? {
		chartType: "area" as ChartType,
		chartStepType: "monotone" as ChartStepType,
	};
	const isGlobalBar = globalPrefs.chartType === "bar";

	return (
		<div className="space-y-4">
			{/* Theme */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-2 font-medium text-sm">
					<MonitorIcon className="size-4" weight="duotone" />
					Theme
				</h3>
				<div className="flex gap-2">
					{THEME_OPTIONS.map(({ id, name, icon: Icon }) => (
						<Button
							className="flex-1"
							key={id}
							onClick={() => setTheme(id)}
							size="sm"
							variant={currentTheme === id ? "default" : "outline"}
						>
							<Icon className="size-4" weight="duotone" />
							{name}
						</Button>
					))}
				</div>
			</div>

			<Separator />

			{/* Chart Preferences */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-2 font-medium text-sm">
					<ChartLineIcon className="size-4" weight="duotone" />
					Charts
				</h3>

				{/* Global Settings */}
				<div className="rounded border bg-muted/30 p-3">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-muted-foreground text-xs">All Charts</span>
						<div className="flex items-center gap-2">
							<Select
								onValueChange={(v: ChartType) =>
									updateAllPreferences({ chartType: v })
								}
								value={globalPrefs.chartType}
							>
								<SelectTrigger className="h-7 w-20" size="sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CHART_TYPE_OPTIONS.map(({ id, name, icon: OptIcon }) => (
										<SelectItem key={id} value={id}>
											<div className="flex items-center gap-2">
												<OptIcon className="size-3" weight="duotone" />
												{name}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								disabled={isGlobalBar}
								onValueChange={(v: ChartStepType) =>
									updateAllPreferences({ chartStepType: v })
								}
								value={globalPrefs.chartStepType}
							>
								<SelectTrigger
									className={cn("h-7 w-24", isGlobalBar ? "opacity-50" : "")}
									size="sm"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STEP_TYPE_OPTIONS.map(({ id, name }) => (
										<SelectItem key={id} value={id}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<Button
						className="w-full justify-between"
						onClick={() => setShowGranular(!showGranular)}
						size="sm"
						variant="ghost"
					>
						<span className="text-muted-foreground text-xs">
							{showGranular ? "Hide per-location" : "Per-location settings"}
						</span>
						<CaretDownIcon
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								showGranular ? "rotate-180" : ""
							)}
						/>
					</Button>

					{/* Granular Settings */}
					{showGranular ? (
						<div className="mt-2 space-y-1 border-t pt-2">
							{CHART_LOCATIONS.map((location) => {
								const prefs = preferences[location] ?? {
									chartType: "area" as ChartType,
									chartStepType: "monotone" as ChartStepType,
								};
								const isBar = prefs.chartType === "bar";
								const Icon = LOCATION_ICONS[location];

								return (
									<div
										className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent/50"
										key={location}
									>
										<div className="flex items-center gap-2">
											<Icon
												className="size-3 shrink-0 text-muted-foreground"
												weight="duotone"
											/>
											<span className="truncate">
												{CHART_LOCATION_LABELS[location]}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<Select
												onValueChange={(v: ChartType) =>
													updateLocationPreferences(location, {
														chartType: v,
													})
												}
												value={prefs.chartType}
											>
												<SelectTrigger
													className="h-6 w-16"
													onClick={(e) => e.stopPropagation()}
													size="sm"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{CHART_TYPE_OPTIONS.map(
														({ id, name, icon: OptIcon }) => (
															<SelectItem key={id} value={id}>
																<div className="flex items-center gap-2">
																	<OptIcon
																		className="size-3"
																		weight="duotone"
																	/>
																	{name}
																</div>
															</SelectItem>
														)
													)}
												</SelectContent>
											</Select>
											<Select
												disabled={isBar}
												onValueChange={(v: ChartStepType) =>
													updateLocationPreferences(location, {
														chartStepType: v,
													})
												}
												value={prefs.chartStepType}
											>
												<SelectTrigger
													className={cn("h-6 w-20", isBar ? "opacity-50" : "")}
													onClick={(e) => e.stopPropagation()}
													size="sm"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{STEP_TYPE_OPTIONS.map(({ id, name }) => (
														<SelectItem key={id} value={id}>
															{name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function QuickActions() {
	const handleCopyUrl = () => {
		navigator.clipboard.writeText(window.location.href);
		toast.success("URL copied to clipboard");
	};

	const handleCopyState = () => {
		const state = {
			url: window.location.href,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
			},
		};
		console.table(state);
		navigator.clipboard.writeText(JSON.stringify(state, null, 2));
		toast.success("State copied to clipboard and logged to console");
	};

	const handleClearConsole = () => {
		console.clear();
		toast.success("Console cleared");
	};

	const handleReload = () => {
		window.location.reload();
	};

	return (
		<div className="space-y-2">
			<h3 className="flex items-center gap-2 font-medium text-sm">
				<LightningIcon className="size-4" weight="duotone" />
				Quick Actions
			</h3>
			<div className="flex flex-wrap gap-2">
				<ActionButton
					icon={CopyIcon}
					label="Copy URL"
					onClick={handleCopyUrl}
				/>
				<ActionButton
					icon={ClipboardIcon}
					label="Copy State"
					onClick={handleCopyState}
				/>
				<ActionButton
					icon={DatabaseIcon}
					label="Clear Console"
					onClick={handleClearConsole}
				/>
				<ActionButton
					icon={CheckCircleIcon}
					label="Reload"
					onClick={handleReload}
				/>
			</div>
		</div>
	);
}

export function DevToolsDrawer() {
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const [isLocalhost, setIsLocalhost] = useState(false);

	useEffect(() => {
		setMounted(true);
		const hostname = window.location.hostname;
		setIsLocalhost(hostname === "localhost" || hostname === "127.0.0.1");
	}, []);

	useEffect(() => {
		if (!isLocalhost) {
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === ".") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isLocalhost]);

	if (!(mounted && isLocalhost)) {
		return null;
	}

	return (
		<>
			<Button
				aria-label="Open dev tools"
				className="fixed right-4 bottom-4 z-50 size-10 rounded-full shadow-lg"
				onClick={() => setOpen(true)}
				size="icon"
				variant="outline"
			>
				<BugIcon className="size-5" weight="duotone" />
			</Button>

			<Drawer onOpenChange={setOpen} open={open}>
				<DrawerContent className="max-h-[90vh]">
					<DrawerHeader className="border-b">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<GearIcon className="size-5" weight="duotone" />
								<DrawerTitle>Dev Tools</DrawerTitle>
							</div>
							<DrawerClose asChild>
								<Button size="icon" variant="ghost">
									<XIcon className="size-4" />
								</Button>
							</DrawerClose>
						</div>
						<DrawerDescription>
							Development tools and debugging utilities
						</DrawerDescription>
					</DrawerHeader>

					<div className="overflow-y-auto p-4 pb-8">
						<div className="space-y-6">
							{/* Appearance Settings */}
							<AppearanceSettings />
							<Separator />

							{/* Debug Tools */}
							<EnvironmentInfo />
							<Separator />
							<ReactQueryCache />
							<Separator />
							<StorageManagement />
							<Separator />
							<PerformanceInfo />
							<Separator />
							<QuickActions />

							<div className="rounded bg-muted/50 p-3">
								<p className="text-muted-foreground text-xs">
									<span className="font-medium">Tip:</span> Press{" "}
									<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
										⌘
									</kbd>{" "}
									<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
										.
									</kbd>{" "}
									to toggle this drawer
								</p>
							</div>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
