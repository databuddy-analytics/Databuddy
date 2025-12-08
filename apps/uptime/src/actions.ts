import { createHash } from "node:crypto";
import { connect } from "node:tls";
import { chQuery } from "@databuddy/db";
import { getWebsiteById } from "@databuddy/services/websites";
import type { ActionResult, UptimeData } from "./types";
import { MonitorStatus } from "./types";

const CONFIG = {
    userAgent: "databuddy-pulse/1.0",
    timeout: 30_000,
    maxRedirects: 10,
    maxRetries: 3,
    region: process.env.PROBE_REGION || process.env.RAILWAY_REPLICA_REGION || "default",
    env: process.env.NODE_ENV || "prod",
} as const;

type FetchSuccess = {
    ok: true;
    statusCode: number;
    ttfb: number;
    total: number;
    redirects: number;
    bytes: number;
    content: string;
};

type FetchFailure = {
    ok: false;
    statusCode: number;
    ttfb: number;
    total: number;
    error: string;
};

type Heartbeat = {
    status: number;
    retries: number;
    streak: number;
};

export async function lookupWebsite(
    id: string
): Promise<ActionResult<{ id: string; domain: string }>> {
    try {
        const site = await getWebsiteById(id);

        if (!site) {
            return { success: false, error: `Website ${id} not found` };
        }

        return { success: true, data: { id: site.id, domain: site.domain } };
    } catch (error) {
        console.error("Database lookup failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Database error",
        };
    }
}

function normalizeUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }
    return `https://${url}`;
}

async function pingWebsite(originalUrl: string): Promise<FetchSuccess | FetchFailure> {
    const url = normalizeUrl(originalUrl);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), CONFIG.timeout);
    const start = performance.now();

    try {
        let redirects = 0;
        let current = url;

        // follow redirects manually so we can count them accurately
        while (redirects < CONFIG.maxRedirects) {
            const res = await fetch(current, {
                signal: abort.signal,
                redirect: "manual",
                headers: { "User-Agent": CONFIG.userAgent },
            });

            const ttfb = performance.now() - start;

            // check if we got a redirect
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get("location");
                if (!location) {
                    break;
                }

                redirects += 1;
                current = new URL(location, current).toString();
                continue;
            }

            // got a final response, read the body
            const content = await res.text();
            const total = performance.now() - start;

            clearTimeout(timeout);

            if (!res.ok) {
                return {
                    ok: false,
                    statusCode: res.status,
                    ttfb: Math.round(ttfb),
                    total: Math.round(total),
                    error: `HTTP ${res.status}: ${res.statusText}`,
                };
            }

            return {
                ok: true,
                statusCode: res.status,
                ttfb: Math.round(ttfb),
                total: Math.round(total),
                redirects,
                bytes: new Blob([content]).size,
                content,
            };
        }

        throw new Error(`Too many redirects (max ${CONFIG.maxRedirects})`);
    } catch (error) {
        clearTimeout(timeout);
        const total = performance.now() - start;

        let message = "Unknown error";
        if (error instanceof Error) {
            message =
                error.name === "AbortError"
                    ? `Timeout after ${CONFIG.timeout}ms`
                    : error.message;
        }

        console.error("Ping failed:", JSON.stringify({ url: originalUrl, error: message }));

        return {
            ok: false,
            statusCode: 0,
            ttfb: 0,
            total: Math.round(total),
            error: message,
        };
    }
}

function checkCertificate(url: string): Promise<{
    valid: boolean;
    expiry: number;
}> {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(url);

            if (parsed.protocol !== "https:") {
                resolve({ valid: false, expiry: 0 });
                return;
            }

            const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;
            const socket = connect(
                {
                    host: parsed.hostname,
                    port,
                    servername: parsed.hostname,
                    timeout: 5000,
                },
                () => {
                    const cert = socket.getPeerCertificate();
                    socket.destroy();

                    if (!cert?.valid_to) {
                        resolve({ valid: false, expiry: 0 });
                        return;
                    }

                    const expiry = new Date(cert.valid_to);
                    resolve({
                        valid: expiry > new Date(),
                        expiry: expiry.getTime(),
                    });
                }
            );

            socket.on("error", () => {
                socket.destroy();
                resolve({ valid: false, expiry: 0 });
            });

            socket.on("timeout", () => {
                socket.destroy();
                resolve({ valid: false, expiry: 0 });
            });
        } catch {
            resolve({ valid: false, expiry: 0 });
        }
    });
}

async function getProbeMetadata(): Promise<{ ip: string; region: string }> {
    try {
        const res = await fetch("https://api.ipify.org?format=json", {
            signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
            const data = (await res.json()) as { ip: string };
            return { ip: data.ip || "unknown", region: CONFIG.region };
        }
    } catch (error) {
        console.error("Failed to get probe IP:", error);
    }

    return { ip: "unknown", region: CONFIG.region };
}

async function getLastHeartbeat(siteId: string): Promise<Heartbeat | null> {
    try {
        const rows = await chQuery<{
            status: number;
            retries: number;
            failure_streak: number;
        }>(
            `
            SELECT status, retries, failure_streak
            FROM uptime.uptime_monitor
            WHERE site_id = {siteId:String}
            ORDER BY timestamp DESC
            LIMIT 1
            `,
            { siteId }
        );

        if (!rows || rows.length === 0) {
            return null;
        }

        return {
            status: rows[0].status,
            retries: rows[0].retries,
            streak: rows[0].failure_streak,
        };
    } catch (error) {
        console.error("Failed to fetch last heartbeat:", error);
        return null;
    }
}

// the retry logic - this prevents false alarms when a site has a temporary hiccup
function calculateStatus(
    isUp: boolean,
    last: Heartbeat | null,
    maxRetries: number
): { status: number; retries: number; streak: number } {
    const { UP, DOWN, PENDING } = MonitorStatus;

    // first time checking this site
    if (!last) {
        if (!isUp && maxRetries > 0) {
            return { status: PENDING, retries: 1, streak: 0 };
        }
        return { status: isUp ? UP : DOWN, retries: 0, streak: isUp ? 0 : 1 };
    }

    // site was up, now it's down
    if (last.status === UP && !isUp) {
        if (maxRetries > 0 && last.retries < maxRetries) {
            return {
                status: PENDING,
                retries: last.retries + 1,
                streak: last.streak,
            };
        }
        return { status: DOWN, retries: 0, streak: last.streak + 1 };
    }

    // still pending, still down
    if (last.status === PENDING && !isUp && last.retries < maxRetries) {
        return { status: PENDING, retries: last.retries + 1, streak: last.streak };
    }

    // confirmed down or recovered
    if (!isUp) {
        return { status: DOWN, retries: 0, streak: last.streak + 1 };
    }

    return { status: UP, retries: 0, streak: 0 };
}

export async function checkUptime(
    siteId: string,
    url: string,
    attempt = 1,
    maxRetries: number = CONFIG.maxRetries
): Promise<ActionResult<UptimeData>> {
    try {
        const normalizedUrl = normalizeUrl(url);
        const timestamp = Date.now();

        // gather all the data we need in parallel
        const [pingResult, lastBeat, probe] = await Promise.all([
            pingWebsite(normalizedUrl),
            getLastHeartbeat(siteId),
            getProbeMetadata(),
        ]);

        const { status, retries, streak } = calculateStatus(
            pingResult.ok,
            lastBeat,
            maxRetries
        );

        // site is down - minimal data
        if (!pingResult.ok) {
            const cert = await checkCertificate(normalizedUrl);

            return {
                success: true,
                data: {
                    site_id: siteId,
                    url: normalizedUrl,
                    timestamp,
                    status,
                    http_code: pingResult.statusCode,
                    ttfb_ms: pingResult.ttfb,
                    total_ms: pingResult.total,
                    attempt,
                    retries,
                    failure_streak: streak,
                    response_bytes: 0,
                    content_hash: "",
                    redirect_count: 0,
                    probe_region: probe.region,
                    probe_ip: probe.ip,
                    ssl_expiry: cert.expiry,
                    ssl_valid: cert.valid ? 1 : 0,
                    env: CONFIG.env,
                    check_type: "http",
                    user_agent: CONFIG.userAgent,
                    error: pingResult.error,
                },
            };
        }

        // site is up - full enrichment
        const [cert, contentHash] = await Promise.all([
            checkCertificate(normalizedUrl),
            Promise.resolve(
                createHash("sha256").update(pingResult.content).digest("hex")
            ),
        ]);

        // return the full data for debugging, but later it'll be fire & forget, we won't need to.
        return {
            success: true,
            data: {
                site_id: siteId,
                url: normalizedUrl,
                timestamp,
                status,
                http_code: pingResult.statusCode,
                ttfb_ms: pingResult.ttfb,
                total_ms: pingResult.total,
                attempt,
                retries,
                failure_streak: streak,
                response_bytes: pingResult.bytes,
                content_hash: contentHash,
                redirect_count: pingResult.redirects,
                probe_region: probe.region,
                probe_ip: probe.ip,
                ssl_expiry: cert.expiry,
                ssl_valid: cert.valid ? 1 : 0,
                env: CONFIG.env,
                check_type: "http",
                user_agent: CONFIG.userAgent,
                error: "",
            },
        };
    } catch (error) {
        // for now we'll just error, but ideally i wanna add axiom OTEL and error logging here
        console.error(
            "Uptime check failed:",
            JSON.stringify({ siteId, url, error })
        );

        return {
            success: false,
            error: error instanceof Error ? error.message : "Uptime check failed",
        };
    }
}
