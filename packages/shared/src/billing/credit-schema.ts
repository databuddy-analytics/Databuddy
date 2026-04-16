/**
 * Single source of truth for agent credit rates.
 *
 * Derives per-token credit costs from tokenlens' Vercel AI Gateway catalog
 * plus a business markup, so the Autumn creditSchema in autumn.config.ts
 * and the agent-cost-probe script stay in sync with provider prices
 * automatically. The raw USD rates come from tokenlens; the markup and
 * credit-to-USD ratio are the pricing knobs we tune per plan tier.
 *
 * Credit formula: credits_per_token = usd_per_token × MARKUP × CREDITS_PER_USD
 */

import { vercelModels } from "tokenlens/providers/vercel";

/**
 * How many credits the user spends per USD of underlying provider cost.
 * Tunes plan-tier runway (free 500 / hobby 2500 / pro 25000). Raising
 * this makes the same dollar of provider usage burn more credits.
 */
export const CREDITS_PER_USD = 200;

/** Business markup on top of provider cost. 1.20 = 20% margin. */
export const MARKUP = 1.2;

/**
 * Model whose provider rates back the credit schema. If the agent uses
 * multiple models with materially different prices, pick the most
 * expensive as the ceiling — we'd rather slightly over-charge than
 * lose margin on the pricier model.
 */
export const BASELINE_MODEL_ID = "anthropic/claude-4-sonnet" as const;

/**
 * Anthropic's 1-hour prompt cache write rate (USD per 1M tokens).
 *
 * The Vercel AI Gateway catalog in tokenlens exposes Anthropic's
 * 5-minute cache rate ($3.75/M), but our agent is configured with
 * `ttl: "1h"` in apps/api/src/ai/config/prompt-cache.ts so Anthropic
 * bills the 1-hour rate ($6/M). We override cacheWrite here to match
 * production billing. If the agent switches back to 5-minute TTL,
 * delete this constant and let tokenlens drive the rate directly.
 */
const CACHE_WRITE_1H_USD_PER_M_TOKENS = 6;

/**
 * Flat credit cost per agent_web_search_calls. 5 credits ≈ $0.025 at
 * CREDITS_PER_USD=200 — priced separately from token burn because the
 * Perplexity call is a fixed-cost API hit regardless of tokens returned.
 */
export const WEB_SEARCH_CREDIT_COST = 5;

const TOKENS_PER_MILLION = 1_000_000;

interface ModelCostsPerMillion {
	cache_read: number;
	cache_write: number;
	input: number;
	output: number;
}

function getBaselineUsdPerMillion(): ModelCostsPerMillion {
	const model = vercelModels.models[BASELINE_MODEL_ID];
	if (!model?.cost) {
		throw new Error(
			`tokenlens vercelModels is missing cost for ${BASELINE_MODEL_ID}`
		);
	}
	return {
		input: model.cost.input,
		output: model.cost.output,
		cache_read: model.cost.cache_read,
		// Override with the 1-hour rate — see CACHE_WRITE_1H_USD_PER_M_TOKENS.
		cache_write: CACHE_WRITE_1H_USD_PER_M_TOKENS,
	};
}

/**
 * Converts a per-million-tokens USD rate into a per-token credit rate.
 * Rounds to 12 significant digits to avoid floating-point noise like
 * `0.0007199999999999999` leaking into the Autumn creditSchema payload.
 */
function toCredits(usdPerMillion: number): number {
	const raw = (usdPerMillion / TOKENS_PER_MILLION) * MARKUP * CREDITS_PER_USD;
	return Number.parseFloat(raw.toPrecision(12));
}

export interface AgentCreditSchema {
	/** Credits per cache-read input token. */
	cacheRead: number;
	/** Credits per cache-write input token. */
	cacheWrite: number;
	/** Credits per fresh (non-cached) input token. */
	input: number;
	/** Credits per output token. */
	output: number;
	/** Flat credits per web search call. */
	webSearch: number;
}

const baselineUsd = getBaselineUsdPerMillion();

/**
 * Canonical agent credit schema. Import this from autumn.config.ts and
 * from any cost probe so both stay in lockstep.
 */
export const AGENT_CREDIT_SCHEMA: AgentCreditSchema = {
	input: toCredits(baselineUsd.input),
	output: toCredits(baselineUsd.output),
	cacheRead: toCredits(baselineUsd.cache_read),
	cacheWrite: toCredits(baselineUsd.cache_write),
	webSearch: WEB_SEARCH_CREDIT_COST,
};
