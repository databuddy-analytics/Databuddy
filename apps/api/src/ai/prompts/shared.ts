/**
 * Common behavior rules applied to all agents.
 * Single source of truth for anti-hallucination and tool-first rules.
 */
export const COMMON_AGENT_RULES = `<behavior_rules>
**Data integrity:** Never fabricate numbers. For any metric, call a tool first. Never output text before tool calls.

**Tool usage:** Call tools directly — don't narrate. Batch independent calls in one response. SQL is SELECT/WITH only with {paramName:Type} placeholders.

**Response:** Lead with the answer. Specific numbers, actionable insights. Use JSON components OR markdown tables — never both for the same data. No emojis, no em dashes.
</behavior_rules>`;
