import "@databuddy/test/env";
import { expect, it } from "bun:test";
import type { InvestigationOutcome, InvestigationSignal } from "@databuddy/shared/insights";
import { MockLanguageModelV3 } from "ai/test";
import { clarifyInsight, InsightAgentExecutionError } from "./agent";
import { createEvidenceSnapshot } from "./evidence-snapshot";

const signal: InvestigationSignal = {signalKey: "funnel:signup", entity: {type: "funnel", id: "signup", label: "Signup"}, metric: {label: "Completed visitors", current: 0, previous: 100, format: "number"}, changePercent: -100, severity: "warning", sentiment: "negative", period: {current: {from: "2026-09-05", to: "2026-09-11"}, previous: {from: "2026-08-29", to: "2026-09-04"}}};
const outcome: InvestigationOutcome = {title: "Signup changed", summary: "Cause is not established.", rootCause: null, impact: null, evidence: ["Earlier detection: zero completions."], publish: false, next: {type: "resolve", reason: "No repair is established."}};
const snapshot = createEvidenceSnapshot({organizationId: "example-org", websiteId: "example-site", capturedAt: "2026-09-12T00:00:00.000Z", signal, evidence: [], descriptions: {get_funnel_analytics: "Stored step conditions are not evaluated; counts are entrants, not attempted tasks."}, reads: [{toolName: "get_funnel_analytics", toolCallId: "actual-read", input: {funnelId: "signup", startDate: "2026-09-05", endDate: "2026-09-11"}, output: {total_users_entered: 200, total_users_completed: 20}}]});
const input = {organizationId: "example-org", websiteId: "example-site", signalKey: signal.signalKey, snapshot, signal, outcome, question: "How many entrants did not complete?", history: [{body: "Did you change it?", assistantText: "No change was made."}]};
function mockResponse(text: string, length = false) {return {content: [{type: "text" as const, text}], finishReason: {unified: length ? "length" as const : "stop" as const, raw: length ? "length" : "stop"}, warnings: [], usage: {inputTokens: {total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0}, outputTokens: {total: 5, text: 5, reasoning: 0}}};}

it("uses exact saved reads, typed arithmetic and actual prior answers with no tools", async () => {
 const model = new MockLanguageModelV3({doGenerate: async (params) => {
  expect(params.tools?.length ?? 0).toBe(0);
  const prompt = JSON.stringify(params.prompt);
  expect(prompt).toContain("actual-read"); expect(prompt).toContain("notCompleted\\\":180");
  expect(prompt).toContain("Stored step conditions are not evaluated"); expect(prompt).toContain("No change was made.");
  return mockResponse("180 entrants did not complete: 200 minus 20. This does not establish failed attempts.");
 }});
 expect((await clarifyInsight(input, {model})).text).toContain("180 entrants");
 expect(outcome.next.type).toBe("resolve");
});
it("rejects a snapshot from another scope before calling a model", async () => {
 const model = new MockLanguageModelV3({doGenerate: async () => {throw new Error("must not run");}});
 await expect(clarifyInsight({...input, organizationId: "foreign"}, {model})).rejects.toThrow("does not match");
 expect(model.doGenerateCalls).toHaveLength(0);
});
it("marks missing legacy raw evidence explicitly without refreshing it", async () => {
 const model = new MockLanguageModelV3({doGenerate: async (params) => {expect(JSON.stringify(params.prompt)).toContain("underlying reads were not retained"); return mockResponse("The saved summary has no retained raw reads; a fresh analysis is needed for that detail.");}});
 expect((await clarifyInsight({...input, snapshot: null}, {model})).text).toContain("no retained");
});
it("fails empty or truncated text and retains usage on the native error", async () => {
 for (const response of [mockResponse(""), mockResponse("Partial answer", true)]) {
  try {await clarifyInsight(input, {model: new MockLanguageModelV3({doGenerate: async () => response})}); throw new Error("unexpected completion");}
  catch (error) {expect(error).toBeInstanceOf(InsightAgentExecutionError); expect((error as InsightAgentExecutionError).usage.totalTokens).toBe(15);}
 }
});
