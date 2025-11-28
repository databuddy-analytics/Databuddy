import { chQuery } from "@databuddy/db";
import { record, setAttributes } from "../lib/tracing";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { QueryRequest, SimpleQueryConfig } from "./types";
import { applyPlugins } from "./utils";

type BatchRequest = QueryRequest & { type: string };
type BatchResult = { type: string; data: Record<string, unknown>[]; error?: string };
type BatchOptions = { websiteDomain?: string | null; timezone?: string };

function getSchemaSignature(config: SimpleQueryConfig): string | null {
    const fields = config.meta?.output_fields;
    return fields?.length ? fields.map((f) => `${f.name}:${f.type}`).join(",") : null;
}

function runSingle(req: BatchRequest, opts?: BatchOptions): Promise<BatchResult> {
    const config = QueryBuilders[req.type];
    if (!config) {
        return Promise.resolve({ type: req.type, data: [], error: `Unknown query type: ${req.type}` });
    }

    return record(`query.single.${req.type}`, async () => {
        const startTime = performance.now();
        try {
            const builder = new SimpleQueryBuilder(
                config,
                { ...req, timezone: opts?.timezone ?? req.timezone },
                opts?.websiteDomain
            );
            const data = await builder.execute();

            setAttributes({
                "query.type": req.type,
                "query.from": req.from,
                "query.to": req.to,
                "query.rows": data.length,
                "query.duration_ms": Math.round(performance.now() - startTime),
            });

            return { type: req.type, data };
        } catch (e) {
            const error = e instanceof Error ? e.message : "Query failed";
            setAttributes({ "query.error": error });
            return { type: req.type, data: [], error };
        }
    });
}

function groupBySchema(requests: BatchRequest[]): Map<string, { index: number; req: BatchRequest }[]> {
    const groups = new Map<string, { index: number; req: BatchRequest }[]>();

    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        if (!req) {
            continue;
        }

        const config = QueryBuilders[req.type];
        if (!config) {
            continue;
        }

        const sig = getSchemaSignature(config) || `__solo_${req.type}`;
        const list = groups.get(sig) || [];
        list.push({ index: i, req });
        groups.set(sig, list);
    }

    return groups;
}

function buildUnionQuery(items: { index: number; req: BatchRequest }[], opts?: BatchOptions) {
    const queries: string[] = [];
    const params: Record<string, unknown> = {};
    const indices: number[] = [];

    for (const { index, req } of items) {
        const config = QueryBuilders[req.type];
        if (!config) {
            continue;
        }

        const builder = new SimpleQueryBuilder(
            config,
            { ...req, timezone: opts?.timezone ?? req.timezone },
            opts?.websiteDomain
        );

        let { sql, params: queryParams } = builder.compile();

        for (const [key, value] of Object.entries(queryParams)) {
            const prefixedKey = `q${index}_${key}`;
            params[prefixedKey] = value;
            sql = sql.replaceAll(`{${key}:`, `{${prefixedKey}:`);
        }

        indices.push(index);
        queries.push(`SELECT ${index} as __query_idx, * FROM (${sql})`);
    }

    return { sql: queries.join("\nUNION ALL\n"), params, indices };
}

function splitResults(
    rows: Array<Record<string, unknown> & { __query_idx: number }>,
    indices: number[]
): Map<number, Record<string, unknown>[]> {
    const byIndex = new Map<number, Record<string, unknown>[]>(indices.map((i) => [i, []]));

    for (const { __query_idx, ...rest } of rows) {
        byIndex.get(__query_idx)?.push(rest);
    }

    return byIndex;
}

export function executeBatch(requests: BatchRequest[], opts?: BatchOptions): Promise<BatchResult[]> {
    if (requests.length === 0) {
        return Promise.resolve([]);
    }

    return record("query.batch", async () => {
        const startTime = performance.now();

        setAttributes({
            "batch.size": requests.length,
            "batch.types": requests.map((r) => r.type).join(","),
        });

        if (requests.length === 1 && requests[0]) {
            return [await runSingle(requests[0], opts)];
        }

        const groups = groupBySchema(requests);
        const results: BatchResult[] = Array.from({ length: requests.length });
        let unionCount = 0;
        let singleCount = 0;

        for (const groupItems of groups.values()) {
            if (groupItems.length === 0) {
                continue;
            }

            if (groupItems.length === 1 && groupItems[0]) {
                const { index, req } = groupItems[0];
                results[index] = await runSingle(req, opts);
                singleCount += 1;
                continue;
            }

            try {
                const { sql, params, indices } = buildUnionQuery(groupItems, opts);
                const queryStart = performance.now();
                const rawRows = await chQuery(sql, params);
                const queryDuration = Math.round(performance.now() - queryStart);

                setAttributes({
                    "batch.union.query_count": indices.length,
                    "batch.union.rows": rawRows.length,
                    "batch.union.duration_ms": queryDuration,
                });

                const split = splitResults(rawRows as Array<Record<string, unknown> & { __query_idx: number }>, indices);

                for (const { index, req } of groupItems) {
                    const config = QueryBuilders[req.type];
                    const raw = split.get(index) || [];
                    results[index] = {
                        type: req.type,
                        data: config ? applyPlugins(raw, config, opts?.websiteDomain) : raw,
                    };
                }
                unionCount += 1;
            } catch {
                for (const { index, req } of groupItems) {
                    results[index] = await runSingle(req, opts);
                    singleCount += 1;
                }
            }
        }

        setAttributes({
            "batch.union_groups": unionCount,
            "batch.single_queries": singleCount,
            "batch.duration_ms": Math.round(performance.now() - startTime),
        });

        return results.map((r, i) => r || { type: requests[i]?.type || "unknown", data: [] });
    });
}

export function areQueriesCompatible(type1: string, type2: string): boolean {
    const [c1, c2] = [QueryBuilders[type1], QueryBuilders[type2]];
    if (!(c1 && c2)) {
        return false;
    }
    const [s1, s2] = [getSchemaSignature(c1), getSchemaSignature(c2)];
    return Boolean(s1 && s2 && s1 === s2);
}

export function getCompatibleQueries(type: string): string[] {
    const config = QueryBuilders[type];
    const sig = config ? getSchemaSignature(config) : null;
    if (!sig) {
        return [];
    }

    return Object.entries(QueryBuilders)
        .filter(([t, c]) => t !== type && getSchemaSignature(c) === sig)
        .map(([t]) => t);
}

export function getSchemaGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const [type, config] of Object.entries(QueryBuilders)) {
        const sig = getSchemaSignature(config);
        if (!sig) {
            continue;
        }
        const list = groups.get(sig) || [];
        list.push(type);
        groups.set(sig, list);
    }

    return groups;
}
