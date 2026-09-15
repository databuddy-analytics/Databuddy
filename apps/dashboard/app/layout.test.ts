import { expect, test } from "bun:test";

test("self-hosted and E2E dashboards omit first-party tracking", async () => {
	const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
		cwd: import.meta.dir,
		env: { NODE_ENV: "production" },
		stdin: new Blob([`
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { Children, isValidElement } from "react";
import { Databuddy } from "@databuddy/sdk/react";
mock.module("next/font/local", () => ({ default: () => ({ className: "font", variable: "font" }) }));
const { OpenAiAdsPixel } = await import("../components/openai-ads-pixel");
const { default: RootLayout } = await import("./layout");
for (const [selfhost, e2e, tracked] of [["", "", true], ["true", "", false], ["", "true", false]]) {
  process.env.SELFHOST = selfhost;
  process.env.DATABUDDY_E2E_MODE = e2e;
  const layout = RootLayout({ children: null });
  const children = Children.toArray(layout.props.children.props.children);
  for (const component of [Databuddy, OpenAiAdsPixel]) {
    assert.equal(children.some(child => isValidElement(child) && child.type === component), tracked);
  }
}
`]),
		stdout: "ignore",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stderr).toBe(0);
});
