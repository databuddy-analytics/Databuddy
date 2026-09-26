import assert from "node:assert/strict";
import { test } from "bun:test";
import { groupActions } from "./src/actions";
import { collectCoverage } from "./src/catalog";

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
		groupActions("App/Service.swift", "func save() {}\n", new Map()),
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

test("exported write route handlers are actions while reads and internal helpers are not", () => {
	const source = `export async function POST(request) {
  await database.leads.insert(await request.json());
  return Response.json({ ok: true });
}
export async function GET() {
  return new Response("User-agent: *");
}
async function PUT() {
  await database.leads.update({});
}`;
	const actions = groups(source, {}, "app/api/contact/route.ts");
	assert.equal(actions.length, 1);
	assert.equal(actions[0]!.label, "POST");
	assert.match(actions[0]!.source, /database\.leads\.insert/);
	assert.equal(
		groups(
			"export const POST = async (request) => { await database.leads.insert(await request.json()); };",
			{},
			"app/api/lead/route.ts"
		).length,
		1
	);
});

test("astro pages yield script listeners and inline handlers while JSON-LD is ignored", () => {
	const source = `---
import Layout from "../layouts/Layout.astro";
const title = "Contact";
---
<Layout title={title}>
  <script type="application/ld+json">{"@context": "https://schema.org"}</script>
  <form id="contact"><button type="submit">Send</button></form>
  <button data-track="demo_requested" onclick="requestDemo()">Book a demo</button>
</Layout>
<script>
  document.getElementById("contact").addEventListener("submit", async (event) => {
    event.preventDefault();
    await fetch("/api/contact", { method: "POST", body: new FormData(event.target) });
  });
</script>`;
	const actions = groups(source, {}, "src/pages/contact.astro");
	const submit = actions.find((action) => action.label.endsWith(".submit"));
	assert.ok(submit);
	assert.match(submit.source, /method: "POST"/);
	const demo = actions.find((action) => action.label.includes("Book a demo"));
	assert.ok(demo);
	assert.equal(demo.tracked, 'data-track="demo_requested"');
});

test("labels name the idle branch and the element's own text, not hrefs or nested controls", () => {
	const source = `export function Panel({ affordable, busy, cost, onClose, redeem, start, signUp, upgrade }) {
  return <section>
    <button onClick={() => start.mutate()}>{busy ? "Opening" : "Start the run"}</button>
    <a href="#" onClick={() => signUp.mutate()}>Sign up</a>
    <button onClick={() => redeem.mutate()}>{affordable ? "Redeem" : cost.toLocaleString()}</button>
    <div className="overlay" onClick={() => onClose.mutate()}>
      <h2>Upgrade your plan</h2>
      <button onClick={() => upgrade.mutate()}>Upgrade</button>
    </div>
  </section>;
}`;
	const labels = groups(source).map((action) => action.label);
	assert.ok(labels.includes('button.onClick "Start the run"'));
	assert.ok(labels.includes('a.onClick "Sign up"'));
	assert.ok(labels.includes('button.onClick "Redeem"'));
	assert.ok(labels.includes("div.onClick"));
	assert.ok(labels.includes('button.onClick "Upgrade"'));
	const form = `export function Rename({ save, close }) {
  return <form onSubmit={(event) => save.mutate(event)}>
    <Button onClick={close}>Cancel</Button>
    <Button type="submit">Rename</Button>
  </form>;
}`;
	assert.equal(groups(form)[0]!.label, 'form.onSubmit "Rename"');
});

test("a data-track attribute on a click target or its ancestor marks the action tracked", () => {
	const source = `export function SignIn({ social, open, submit }) {
  return <section data-track="signin_opened">
    <button data-track="signin_google" onClick={() => social("google")}>Google</button>
    <button onClick={() => open()}>Email</button>
    <form onSubmit={submit}><button data-track="signin_submitted" type="submit">Sign in</button></form>
  </section>;
}`;
	const actions = groups(source);
	assert.equal(
		at(actions, source, 'social("google")')[0]?.tracked,
		'data-track="signin_google"'
	);
	assert.equal(
		at(actions, source, "open()")[0]?.tracked,
		'data-track="signin_opened"'
	);
	assert.equal(at(actions, source, "onSubmit={submit}")[0]?.tracked, undefined);
});

test("python write routes are extracted alone and other functions are not sent", () => {
	const source = `from fastapi import APIRouter
router = APIRouter()

def helper():
    return 1

@router.get("/plans")
def plans():
    return []

@router.post(
    "/checkout",
)
async def checkout(
    body: Checkout,
) -> Session:
    session = await stripe.create(body)
    return session

@app.route("/invite", methods=["GET", "POST"])
def invite():
    save()
`;
	const actions = groups(source, {}, "api/billing.py");
	assert.deepEqual(
		actions.map((action) => action.label),
		["POST /checkout", "POST /invite"]
	);
	assert.match(actions[0]!.source, /stripe\.create/);
	assert.doesNotMatch(actions[0]!.source, /def plans|def helper|def invite/);
	assert.deepEqual(
		groups("def helper():\n    return 1\n", {}, "sdk/client.py"),
		[]
	);
});

test("data-track listeners are found in every documented install form", () => {
	const listeners = (source: string, path = "app/layout.tsx") =>
		collectCoverage(new Map([[path, source]])).attributeListeners.length;
	assert.equal(
		listeners('<Databuddy clientId="x" trackAttributes trackErrors />'),
		1
	);
	assert.equal(listeners("init({ clientId, trackAttributes: true });"), 1);
	assert.equal(
		listeners(
			'<script src="https://cdn.databuddy.cc/databuddy.js" data-track-attributes></script>',
			"index.html"
		),
		1
	);
	assert.equal(
		listeners(
			'document.addEventListener("click", (e) => e.target.closest("[data-track]"));'
		),
		1
	);
	assert.equal(listeners("<Databuddy trackAttributes={false} />"), 0);
	assert.equal(listeners("trackAttributes?: boolean;"), 0);
	assert.equal(
		listeners(
			'const el = e.target.closest("[data-track]");',
			"packages/tracker/src/index.ts"
		),
		0
	);
});

test("callbacks passed as props are followed to the parent and dropped when every parent only sets state", () => {
	const row = `export function Row({ onDelete, onEdit }) {
  return <div>
    <button onClick={() => onDelete()}>Delete</button>
    <button onClick={onEdit}>Edit</button>
  </div>;
}`;
	const list = `import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Row } from "./row";
export function List() {
  const [editing, setEditing] = useState(false);
  const remove = useMutation({ ...orpc.goals.delete.mutationOptions() });
  return <section>
    <Row onDelete={() => remove.mutate({ id })} onEdit={setEditing} />
    <Row
      onDelete={onRemove ?? (() => remove.mutate({ id }))}
      onEdit={setEditing ?? (() => {})}
    />
  </section>;
}`;
	const actions = groups(row, { "app/list.tsx": list }, "app/row.tsx");
	assert.deepEqual(
		actions.map((action) => action.label),
		['button.onClick "Delete"']
	);
	assert.match(actions[0]!.source, /orpc\.goals\.delete\.mutationOptions/);
	assert.ok(actions[0]!.commits);
});

test("values returned from custom hooks and mutations passed directly are followed", () => {
	const source = `import { useMutation } from "@tanstack/react-query";
function useFunnels() {
  const update = useMutation({ ...orpc.funnels.update.mutationOptions() });
  const updateAction = (input) => update.mutateAsync(input);
  return { updateAction };
}
export function Editor() {
  const { updateAction } = useFunnels();
  const archive = useMutation({ ...orpc.funnels.archive.mutationOptions() });
  return <section>
    <button onClick={() => updateAction({ name })}>Save funnel</button>
    <button onClick={archive.mutate}>Archive</button>
  </section>;
}`;
	const actions = groups(source);
	assert.match(
		at(actions, source, "updateAction({ name })")[0]!.source,
		/orpc\.funnels\.update/
	);
	assert.match(
		at(actions, source, "onClick={archive.mutate}")[0]!.source,
		/orpc\.funnels\.archive/
	);
});

test("atom setters, refetches and form resets are UI state rather than actions", () => {
	const source = `import { useAtom, useSetAtom } from "jotai";
export function Toolbar({ query, form }) {
  const [open, setOpen] = useAtom(sheetAtom);
  const setFilter = useSetAtom(filterAtom);
  return <section>
    <button onClick={() => setOpen(true)}>New monitor</button>
    <button onClick={() => setFilter("errors")}>Errors</button>
    <button onClick={() => query.refetch()}>Refresh</button>
    <button onClick={() => form.reset()}>Clear</button>
  </section>;
}`;
	assert.deepEqual(groups(source), []);
});

test("the catalog lists forwarding helpers and callers of warehouse writers, not components", () => {
	const catalog = collectCoverage(
		new Map([
			[
				"lib/app-events.ts",
				"export function trackAppEvent(name, properties) {\n  track(name, properties);\n}",
			],
			[
				"app/page.tsx",
				"export function Page() {\n  trackAppEvent(appEvents.opened);\n  return null;\n}",
			],
			[
				"services/lifecycle.ts",
				'async function insertLifecycleEvent(row) {\n  await clickhouse.insert({ table: "analytics.custom_events", values: [row] });\n}\nexport async function recordSelfAnalyticsEvent(name) {\n  await insertLifecycleEvent({ name });\n}',
			],
		])
	);
	assert.deepEqual(
		catalog.trackingHelpers.map((helper) => helper.split(" (")[0]),
		["trackAppEvent", "recordSelfAnalyticsEvent"]
	);
});

test("an action prop holding rendered JSX is not a form action", () => {
	const source = `export function GitHubRow({ connected, installUrl }) {
  let action;
  if (connected) {
    action = <span>Connected</span>;
  } else {
    action = <a href={installUrl}>Connect</a>;
  }
  return <IntegrationListRow action={action} />;
}`;
	assert.deepEqual(
		groups(source).map((action) => action.label),
		['a.intent "Connect"']
	);
});

test("framework server actions and handlers are actions with their routes", () => {
	const kit = `export const actions = {
  default: async ({ request }) => {
    await api.post("users", await request.formData());
  },
  logout: async ({ cookies }) => {
    cookies.delete("jwt", { path: "/" });
  }
};`;
	assert.deepEqual(
		groups(kit, {}, "src/routes/(app)/settings/+page.server.js").map(
			(action) => action.label
		),
		["POST /settings", "POST /settings?/logout"]
	);
	const remix = `export async function loader() { return null; }
export const action = async ({ request }) => {
  await createNote(await request.formData());
  return redirect("/notes");
};`;
	assert.deepEqual(
		groups(remix, {}, "app/routes/notes.new.tsx").map((action) => action.label),
		["action notes.new"]
	);
	const nitro = `export default defineEventHandler(async (event) => {
  await db.customers.insert(await readBody(event));
});`;
	assert.deepEqual(
		groups(nitro, {}, "server/api/customers/index.post.ts").map(
			(action) => action.label
		),
		["POST /api/customers"]
	);
});

test("vue components keep their case, label prop and the form's submit button", () => {
	const source = `<template>
  <UForm :state="state" @submit="onSubmit">
    <UFormField label="Name"><UInput v-model="state.name" /></UFormField>
    <UButton label="Cancel" @click="close" />
    <UButton label="Create" type="submit" />
  </UForm>
  <u-button label="Delete" @click="remove()" />
</template>
<script setup lang="ts">
async function onSubmit() { await $fetch("/api/customers", { method: "POST" }); }
async function remove() { await $fetch("/api/customers/1", { method: "DELETE" }); }
</script>`;
	const labels = groups(source, {}, "app/components/AddModal.vue").map(
		(action) => action.label
	);
	assert.ok(labels.includes('UForm.onSubmit "Create"'));
	assert.ok(labels.includes('UButton.onClick "Delete"'));
});

test("callbacks forwarded through several components and fallbacks reach the page's mutation", () => {
	const item = `export function GroupItem({ group, onDelete }) {
  return <GroupActions group={group} onDelete={onDelete} />;
}
function GroupActions({ group, onDelete }) {
  return <button onClick={() => onDelete(group.id)}>Delete</button>;
}`;
	const list = `import { GroupItem } from "./group-item";
export function GroupsList({ groups, onDeleteGroup }) {
  return groups.map((group) => (
    <GroupItem group={group} key={group.id} onDelete={onDeleteGroup ?? (() => {})} />
  ));
}`;
	const page = `import { useMutation } from "@tanstack/react-query";
import { GroupsList } from "./groups-list";
export default function Page() {
  const remove = useMutation({ ...orpc.targetGroups.delete.mutationOptions() });
  const handleDeleteGroup = async (id) => {
    await remove.mutateAsync({ id });
  };
  return <GroupsList groups={[]} onDeleteGroup={handleDeleteGroup} />;
}`;
	const actions = groups(
		item,
		{ "app/groups-list.tsx": list, "app/page.tsx": page },
		"app/group-item.tsx"
	);
	assert.equal(actions.length, 1);
	assert.match(actions[0]!.source, /orpc\.targetGroups\.delete/);
});

test("a clipboard copy carries the value it copies so the model can tell a snippet from an ID", () => {
	const source = `export function Terminal() {
  const steps = ["git clone https://github.com/acme/app", "pnpm install", "pnpm dev"];
  const copy = () => {
    navigator.clipboard.writeText(steps.join("\\n"));
  };
  return <button onClick={copy}>Copy</button>;
}`;
	const [action] = groups(source);
	assert.match(action!.source, /pnpm install/);
});

test("a mutation whose function is a prop, and props destructured in the body, reach the parent's route", () => {
	const control = `import { useMutation } from "@tanstack/react-query";
export function Control({ onSave }) {
  const mutation = useMutation({ mutationFn: onSave });
  const handleSave = () => mutation.mutate({ enabled: true });
  return <button onClick={handleSave}>Save</button>;
}`;
	const modal = `export function Modal(props) {
  const handleSubmit = async () => {
    const { onCreate } = props;
    await onCreate({ text });
  };
  return <button onClick={handleSubmit}>Create</button>;
}`;
	const page = `import { Control } from "./control";
import { Modal } from "./modal";
export default function Page() {
  return <section>
    <Control onSave={(input) => orpc.billing.setUsageAlert.call(input)} />
    <Modal onCreate={(input) => orpc.annotations.create.call(input)} />
  </section>;
}`;
	const extra = {
		"app/control.tsx": control,
		"app/modal.tsx": modal,
		"app/page.tsx": page,
	};
	assert.match(
		groups(control, extra, "app/control.tsx")[0]!.source,
		/orpc\.billing\.setUsageAlert/
	);
	assert.match(
		groups(modal, extra, "app/modal.tsx")[0]!.source,
		/orpc\.annotations\.create/
	);
});

test("every handler on a markup tag is read and i18n keys become labels", () => {
	const source = `<template>
  <form @click.stop="stopPropagation" @submit.prevent="vote">
    <button type="submit">{{ $t('polls.vote') }}</button>
  </form>
  <StatusActionButton :title="$t('action.boost')" @click="toggleReblog()" />
</template>
<script setup lang="ts">
function noop() {}
async function vote() {
  await client.polls.$select(id).votes.create({ choices });
}
async function toggleReblog() {
  await client.statuses.$select(id).reblog();
}
</script>`;
	const labels = groups(source, {}, "components/StatusPoll.vue").map(
		(action) => action.label
	);
	assert.ok(labels.includes("form.onSubmit vote"));
	assert.ok(labels.includes('StatusActionButton.onClick "action.boost"'));
});

test("a link's route is matched as a GET while that route's own requests keep their method", () => {
	const page = `${"const checkoutUrl = `${API}/v1/billing/checkout`;"}
function portalUrl() { return new URL("/v1/billing/portal", API).toString(); }
export function Upgrade() { return <a href={checkoutUrl}>Upgrade to Pro</a>; }
export function Manage() { return <a href={portalUrl()}>Upgrade billing</a>; }`;
	const server = `export const billing = new Elysia({ prefix: "/v1/billing" })
  .get("/checkout", async () => { await fetch("/v1/billing/audit", { method: "POST" }); })
  .post("/checkout", async () => { await db.insert(orders).values({}); })
  .get("/portal", async () => redirect(await stripe.billingPortal.sessions.create({})))
  .post("/portal", async () => { await db.update(customers).set({}); });`;
	const audit = `export const audit = new Elysia({ prefix: "/v1/billing/audit" })
  .get("/", async () => db.select().from(audits))
  .post("/", async () => { await db.insert(audits).values({}); });`;
	const actions = groups(
		page,
		{ "api/billing.ts": server, "api/audit.ts": audit },
		"web/pricing.tsx"
	);
	const sites = (text: string) =>
		(at(actions, page, text, "web/pricing.tsx")[0]?.sites ?? [])
			.filter((site) => site.path.startsWith("api/"))
			.map((site) => `${site.path}:${site.start}`);
	assert.deepEqual(sites("href={checkoutUrl}"), [
		"api/billing.ts:2",
		"api/audit.ts:3",
	]);
	assert.deepEqual(sites("href={portalUrl()}"), ["api/billing.ts:4"]);
});

test("a bound or applied action reaches its write only when it is invoked", () => {
	const actions = (body: string) => {
		const source = `import { save } from "./save";
export function Page() {
	return <button onClick={() => { ${body} }}>Save</button>;
}`;
		return groups(source, {
			"app/save.ts":
				"export async function save(id: string) { await db.insert(items).values({ id }); }",
		});
	};
	assert.equal(actions("const run = save.bind(null, id); run();").length, 1);
	assert.equal(actions("save.apply(null, [id]);").length, 1);
	assert.equal(actions("const later = save.bind(null, id);").length, 0);
});
