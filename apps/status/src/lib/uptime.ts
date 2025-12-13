export type UptimeStatus = "up" | "down" | "unknown";

export type UptimeSeriesPoint = {
    date: string;
    uptime_percentage: number;
};

export type LatestUptimeCheck = {
    timestamp: string;
    status: number;
    http_code: number;
    ttfb_ms: number;
    total_ms: number;
    url: string;
    error: string;
    ssl_valid: number;
    ssl_expiry: string | null;
};

export function statusFromCheck(status: number | null | undefined): UptimeStatus {
    if (status === 1) {
        return "up";
    }
    if (status === 0) {
        return "down";
    }
    return "unknown";
}

export function hostnameFromUrl(url: string | null | undefined): string | null {
    if (!url) {
        return null;
    }
    try {
        return new URL(url).hostname || null;
    } catch {
        return null;
    }
}

export function labelForStatus(status: UptimeStatus): string {
    if (status === "up") {
        return "Operational";
    }
    if (status === "down") {
        return "Outage";
    }
    return "Unknown";
}

export function classForStatus(status: UptimeStatus): {
    badge: string;
    dot: string;
} {
    if (status === "up") {
        return {
            badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
            dot: "bg-emerald-500",
        };
    }
    if (status === "down") {
        return {
            badge: "border-rose-500/25 bg-rose-500/10 text-rose-700",
            dot: "bg-rose-500",
        };
    }
    return {
        badge: "border-border bg-muted text-foreground",
        dot: "bg-muted-foreground",
    };
}

export function barClassForUptime(uptimePercent: number | null): string {
    if (uptimePercent === null) {
        return "bg-muted";
    }
    if (uptimePercent >= 99.99) {
        return "bg-emerald-500/60";
    }
    if (uptimePercent >= 99.0) {
        return "bg-lime-500/60";
    }
    if (uptimePercent >= 95.0) {
        return "bg-amber-500/60";
    }
    return "bg-rose-500/60";
}

export function formatPercent(value: number | null): string {
    if (value === null) {
        return "—";
    }
    return `${value.toFixed(2)}%`;
}

export function formatMs(value: number | null): string {
    if (value === null) {
        return "—";
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}s`;
    }
    return `${Math.round(value)}ms`;
}


