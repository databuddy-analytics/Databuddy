import assert from "node:assert/strict";
import { test } from "bun:test";
import { groupActions } from "./src/actions";

// Behavioral extraction regressions from the reviewed action audit, not model-accuracy tests.
// Source fixtures contain executable code only; review labels and rationales stay in test names.
function groups(
	source: string,
	extra: Record<string, string> = {},
	path = "app/page.tsx"
) {
	const result = groupActions(
		path,
		source,
		new Map([[path, source], ...Object.entries(extra)])
	);
	assert.ok(result, "Valid TypeScript/TSX should have an extraction result");
	return result;
}

function line(source: string, text: string) {
	const index = source.indexOf(text);
	assert.notEqual(index, -1, `Fixture is missing ${text}`);
	return source.slice(0, index).split("\n").length;
}

function at(
	actions: ReturnType<typeof groups>,
	source: string,
	text: string,
	path = "app/page.tsx"
) {
	const location = line(source, text);
	return actions.filter((action) =>
		action.sites.some(
			(site) =>
				site.path === path && site.start <= location && site.end >= location
		)
	);
}

test("a user callback and its mutation form one candidate with response guards", () => {
	const source = `export function InvestigationSettings() {
  const request = useMutation({
    mutationFn: api.requestInvestigation,
    onSuccess(result) {
      if (result.status === "queued") showQueued();
      else if (result.status === "skipped") showSkipped();
    }
  });
  function handleRequest() {
    if (request.isPending) return;
    request.mutate({ websiteId });
  }
  return <button onClick={handleRequest}>Request investigation</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, "onClick={handleRequest}").length, 1);
	assert.equal(at(actions, source, "request.mutate(").length, 1);
	assert.match(actions[0]!.source, /request\.isPending/);
	assert.match(actions[0]!.source, /result\.status === "skipped"/);
});

test("separate uses of the same callback remain separate surface actions", () => {
	const source = `export function TrackingSettings() {
  function handleCopy(value) {
    navigator.clipboard.writeText(value);
    toast.success("Copied");
  }
  return <section>
    <CodeBlock onCopy={() => handleCopy(script)} />
    <CodeBlock onCopy={() => handleCopy(clientId)} />
  </section>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 2);
	assert.equal(at(actions, source, "handleCopy(script)").length, 1);
	assert.equal(at(actions, source, "handleCopy(clientId)").length, 1);
	for (const action of actions) {
		assert.match(action.source, /navigator\.clipboard\.writeText\(value\)/);
		assert.doesNotMatch(action.source, /await navigator\.clipboard/);
	}
});

test("docs copy retains delegated clipboard fulfillment and rejection through a barrel", () => {
	const source = `import { CopyButton } from "../ui";
export function DocsCode({ code }) {
  return <CopyButton value={code} />;
}`;
	const copy = `export function CopyButton({ value, onCopy }) {
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      onCopy?.();
    }).catch(() => showError());
  }
  return <button onClick={copy}>Copy</button>;
}`;
	const actions = groups(source, {
		"ui/index.ts": 'export { CopyButton } from "./copy-button";',
		"ui/copy-button.tsx": copy,
	});
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, "<CopyButton").length, 1);
	assert.match(actions[0]!.source, /writeText\(value\)\.then/);
	assert.match(actions[0]!.source, /onCopy\?\.\(\)/);
	assert.match(actions[0]!.source, /catch\(\(\) => showError\(\)\)/);
	assert.ok(
		actions[0]!.sites.some((site) => site.path === "ui/copy-button.tsx")
	);
});

test("upgrade intent survives while ordinary members navigation is suppressed", () => {
	const source = `export function FeatureGate({ canUpgrade, currentPlan, requiredPlan }) {
  return <section>
    {canUpgrade && <a href="/billing/upgrade">Upgrade to {requiredPlan}</a>}
    <a href="/organization/members">View members</a>
  </section>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, 'href="/billing/upgrade"').length, 1);
	assert.equal(at(actions, source, 'href="/organization/members"').length, 0);
	assert.match(actions[0]!.source, /canUpgrade/);
});

test("conditional link text preserves its intent and both rendering branches", () => {
	const source = `export function PlanLink({ canUpgrade }) {
  return <a href="/billing">{canUpgrade ? "Upgrade plan" : "View plans"}</a>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.match(
		actions[0]!.source,
		/canUpgrade \? "Upgrade plan" : "View plans"/
	);
});

test("presentation toggles, cancel resets and plain navigation do not seed actions", () => {
	const source = `import { useState } from "react";
export function Settings() {
  const [expanded, setExpanded] = useState(false);
  const [manualId, setManualId] = useState(null);
  return <section>
    <button onClick={() => setExpanded(value => !value)}>Troubleshooting</button>
    <button onClick={() => setManualId(null)}>Cancel</button>
    <button onClick={() => router.push("/overview")}>Overview</button>
    <a href="/overview">Dashboard</a>
  </section>;
}`;
	assert.deepEqual(groups(source), []);
});

test("a business function named like a state setter retains its persistence action", () => {
	const source = `async function setSelectedPlan(plan) {
  await database.plans.update({ plan });
}
export function PlanSelector() {
  return <button onClick={() => setSelectedPlan("team")}>Select plan</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, 'setSelectedPlan("team")').length, 1);
	assert.match(actions[0]!.source, /await database\.plans\.update/);
});

test("manual save retains storage failure while automatic cleanup and ID helpers do not seed", () => {
	const source = `function createSavedFilterId() { return crypto.randomUUID(); }
function writeFilters(filters) {
  try { localStorage.setItem("filters", JSON.stringify(filters)); return true; }
  catch { return false; }
}
export function SavedFilters() {
  useEffect(() => { writeFilters(removeExpired(filters)); }, []);
  function saveFilter() {
    const next = [...filters, { id: createSavedFilterId(), conditions }];
    const stored = writeFilters(next);
    return { success: stored };
  }
  return <button onClick={saveFilter}>Save filter</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, "onClick={saveFilter}").length, 1);
	assert.equal(at(actions, source, "useEffect(").length, 0);
	assert.match(actions[0]!.source, /return \{ success: stored \}/);
	assert.match(actions[0]!.source, /catch \{ return false; \}/);
	assert.deepEqual(
		groups(
			"export function createSavedFilterId() { return crypto.randomUUID(); }",
			{},
			"lib/id.ts"
		),
		[]
	);
});

test("connect callback and mutation are one intent rather than duplicate candidates", () => {
	const source = `export function SearchIntegration() {
  const connect = useMutation({ mutationFn: () => authClient.linkSocial({ provider: "search" }) });
  return <button onClick={() => connect.mutate()}>Connect Search</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.equal(at(actions, source, "connect.mutate()").length, 1);
	assert.match(actions[0]!.source, /authClient\.linkSocial/);
});

test("connection intent and authoritative persistence remain separate candidates", () => {
	const source = `export function Integration({ installed }) {
  return installed ? <a href="/settings/access">Manage access</a> : <a href="/oauth/install">Connect GitHub</a>;
}
router.get("/oauth/callback", async context => {
  const installation = await verifyInstallation(context);
  if (!installation) return context.redirect("/settings?error=invalid");
  await database.integrations.upsert({ installation });
  return context.redirect("/settings?connected=true");
});`;
	const actions = groups(source);
	assert.equal(actions.length, 2);
	assert.equal(at(actions, source, 'href="/oauth/install"').length, 1);
	assert.equal(
		at(actions, source, "await database.integrations.upsert").length,
		1
	);
	const persisted = at(
		actions,
		source,
		"await database.integrations.upsert"
	)[0]!;
	assert.match(persisted.source, /if \(!installation\)/);
	assert.ok(
		persisted.source.indexOf("await database.integrations.upsert") <
			persisted.source.indexOf('"/settings?connected=true"')
	);
});

test("static payment confirmation and generated analytics text do not create executable actions", () => {
	assert.deepEqual(
		groups(`export function PaymentSuccess() {
  return <main><h1>Payment complete</h1><a href="/dashboard">Dashboard</a></main>;
}`),
		[]
	);
	assert.deepEqual(
		groups(
			'export function generateSnippet() { return `analytics.track("purchase", { amount: 42 });`; }',
			{},
			"app/snippets.ts"
		),
		[]
	);
});

test("generic callback forwarding and transport are not product-owned action seeds", () => {
	assert.deepEqual(
		groups(
			`export function Button({ disabled, onKeyDown, children }) {
  return <button disabled={disabled} onKeyDown={event => onKeyDown?.(event)}>{children}</button>;
}`,
			{},
			"packages/ui/button.tsx"
		),
		[]
	);
	assert.deepEqual(
		groups(
			`export function track(name, properties) {
  return transport.send({ name, properties });
}`,
			{},
			"packages/sdk/tracker.ts"
		),
		[]
	);
});

test("a reusable copy primitive delegates its callback without seeding a product event", () => {
	const source = `export function CopyButton({ value, onCopy }) {
  function copy() {
    navigator.clipboard.writeText(value).then(() => onCopy?.());
  }
  return <button onClick={copy}>Copy</button>;
}`;
	assert.deepEqual(groups(source, {}, "ui/copy-button.tsx"), []);
});

test("an already-instrumented copy keeps the success guard and event evidence", () => {
	const source = `export function Onboarding() {
  async function handleCopy() {
    const copied = await copyTextToClipboard(script);
    if (!copied) return;
    trackAppEvent("onboarding_tracking_copied", { method: "script" });
  }
  return <button onClick={handleCopy}>Copy installation</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.match(actions[0]!.source, /if \(!copied\) return/);
	assert.match(
		actions[0]!.source,
		/trackAppEvent\("onboarding_tracking_copied"/
	);
});

test("a tracked procedure preserves its shared producer evidence without inventing coverage", () => {
	const source = `import { trackedProcedure } from "../lib/procedure";
export const createGoal = trackedProcedure.handler(async ({ input }) => {
  return await database.goals.insert(input);
});`;
	const shared = `export const trackedProcedure = procedure.use(async ({ next }) => {
  const result = await next();
  analytics.track("goal_created", { type: "conversion" });
  return result;
});`;
	const actions = groups(
		source,
		{ "lib/procedure.ts": shared },
		"app/goals.ts"
	);
	assert.equal(actions.length, 1);
	assert.match(actions[0]!.source, /database\.goals\.insert/);
	assert.match(actions[0]!.source, /analytics\.track\("goal_created"/);
});

test("direct lifecycle inserts retain configuration guards and their custom-event table", () => {
	const source = `router.post("/billing/webhook", async event => {
  if (!process.env.ANALYTICS_DESTINATION) return;
  await warehouse.insert({ table: "custom_events", values: [{ name: "plan_changed", plan: event.plan }] });
});`;
	const actions = groups(source, {}, "api/billing.ts");
	assert.equal(actions.length, 1);
	assert.match(
		actions[0]!.source,
		/if \(!process\.env\.ANALYTICS_DESTINATION\) return/
	);
	assert.match(actions[0]!.source, /table: "custom_events"/);
	assert.match(actions[0]!.source, /name: "plan_changed"/);
});

test("an invitation lifecycle hook retains audit evidence without replacing it with analytics", () => {
	const source = `export const authOptions = { organizationHooks: {
  afterAcceptInvitation: async ({ invitation }) => {
    await recordAuthAudit({ action: "invitation_accepted", organizationId: invitation.organizationId });
  }
}};`;
	const actions = groups(source, {}, "server/auth.ts");
	assert.equal(actions.length, 1);
	assert.match(actions[0]!.source, /recordAuthAudit/);
	assert.doesNotMatch(actions[0]!.source, /analytics\.track|trackAppEvent/);
});

test("server persistence and export keep their awaited outcome boundaries", () => {
	const source = `export const saveRevenue = protectedProcedure.handler(async ({ input }) => {
  if (!input.currency) throw new Error("Currency required");
  await database.revenue.update({ currency: input.currency });
  return { configured: true };
});
export const exportReport = protectedProcedure.handler(async ({ input }) => {
  await assertExportPermission(input.websiteId);
  const file = await generateExport({ format: input.format });
  return file;
});`;
	const actions = groups(source, {}, "server/report.ts");
	assert.equal(actions.length, 2);
	const saved = at(
		actions,
		source,
		"await database.revenue.update",
		"server/report.ts"
	);
	const exported = at(
		actions,
		source,
		"await generateExport",
		"server/report.ts"
	);
	assert.equal(saved.length, 1);
	assert.equal(exported.length, 1);
	assert.notEqual(saved[0], exported[0]);
	assert.match(saved[0]!.source, /if \(!input\.currency\)/);
	assert.match(exported[0]!.source, /await assertExportPermission/);
});

test("chained server routes keep distinct labels and do not inherit neighboring effects", () => {
	const source = `router
  .post("/plans", async context => {
    await database.plans.update(context.body);
    return { saved: true };
  })
  .get("/plans", async () => {
    return database.plans.list();
  });`;
	const actions = groups(source, {}, "server/routes.ts");
	assert.equal(actions.length, 2);
	const saved = at(
		actions,
		source,
		"database.plans.update",
		"server/routes.ts"
	);
	const listed = at(actions, source, "database.plans.list", "server/routes.ts");
	assert.equal(saved.length, 1);
	assert.equal(listed.length, 1);
	assert.notEqual(saved[0]!.label, listed[0]!.label);
	assert.doesNotMatch(listed[0]!.source, /database\.plans\.update/);
	assert.doesNotMatch(saved[0]!.source, /database\.plans\.list/);
});

test("reply mutation success keeps its explicit failed-processing branch", () => {
	const source = `export function Reply() {
  const reply = useMutation({ mutationFn: api.sendReply,
    onSuccess(result) {
      if (result.status === "failed") showError();
      else showSubmitted();
    }
  });
  return <button onClick={() => { if (!reply.isPending) reply.mutate({ text }); }}>Send reply</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.match(actions[0]!.source, /result\.status === "failed"/);
	assert.match(actions[0]!.source, /!reply\.isPending/);
});

test("ambiguous dynamic handlers remain visible with missing-context issues", () => {
	const source = `export function Connect({ handlers, selected }) {
  return <button onClick={handlers[selected]}>Connect</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.ok(actions[0]!.issues.length > 0);
	assert.equal(at(actions, source, "onClick={handlers[selected]}").length, 1);
	assert.ok(actions[0]!.sites.every((site) => site.path === "app/page.tsx"));
});

test("an unresolved imported callback is not treated as resolved source evidence", () => {
	const source = `import { createExport } from "../missing/export";
export function Export() {
  return <button onClick={createExport}>Export report</button>;
}`;
	const actions = groups(source);
	assert.equal(actions.length, 1);
	assert.ok(actions[0]!.issues.length > 0);
	assert.ok(actions[0]!.sites.every((site) => site.path === "app/page.tsx"));
	assert.doesNotMatch(actions[0]!.source, /function createExport/);
});

test("unsupported or malformed source requests source fallback rather than empty success", () => {
	assert.equal(
		groupActions("app/service.py", "def save():\n  pass\n", new Map()),
		null
	);
	assert.equal(
		groupActions(
			"app/broken.tsx",
			"export function Broken( { return <button",
			new Map()
		),
		null
	);
});
