import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	db,
	eq,
	isAiDigestUnsubscribeToken,
	mergeEmailNotificationSettings,
	organization,
} from "@databuddy/db";
import { config } from "@databuddy/env/app";
import { escapeHTML } from "bun";
import { Elysia, t } from "elysia";

const unsubscribeQuery = t.Object({
	organization: t.String({ maxLength: 128, minLength: 1 }),
	token: t.String({ maxLength: 128, minLength: 1 }),
});

function isValidToken(organizationId: string, token: string): boolean {
	const secret = process.env.DATABUDDY_ENCRYPTION_KEY;
	return !!secret && isAiDigestUnsubscribeToken(organizationId, token, secret);
}

function emailSettingsLink(organizationId: string): string {
	const url = new URL("/settings/notifications", config.urls.dashboard);
	url.searchParams.set("organization", organizationId);
	return `<a href="${escapeHTML(url.toString())}">Email settings</a>`;
}

function htmlPage(status: number, title: string, content: string): Response {
	return new Response(
		`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex">
  <title>${escapeHTML(title)}</title>
  <style>
    body { margin: 0; background: #fff; color: #111; font: 15px/1.5 system-ui, sans-serif; }
    main { max-width: 28rem; margin: 15vh auto 0; padding: 0 1.5rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 600; }
    p { margin: 0 0 1rem; color: #555; }
    a { color: inherit; }
    button { padding: 0.5rem 1rem; border: 0; border-radius: 0.375rem; background: #111; color: #fff; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHTML(title)}</h1>
    ${content}
  </main>
</body>
</html>`,
		{
			status,
			headers: {
				"Cache-Control": "private, no-store",
				"Content-Type": "text/html; charset=utf-8",
				"Referrer-Policy": "no-referrer",
			},
		}
	);
}

function invalidLinkPage(organizationId: string): Response {
	return htmlPage(
		403,
		"This link is not valid",
		`<p>Turn off the weekly AI digest in ${emailSettingsLink(organizationId)} instead.</p>`
	);
}

export const emailUnsubscribeRoute = new Elysia({
	prefix: "/v1/email-unsubscribe",
})
	.get(
		"/ai-digest",
		function confirmAiDigestUnsubscribe({ query }) {
			mergeWideEvent({
				email_unsubscribe_page: "ai_digest",
				email_unsubscribe_organization: query.organization,
			});

			if (!isValidToken(query.organization, query.token)) {
				mergeWideEvent({ email_unsubscribe_rejected: "invalid_token" });
				return invalidLinkPage(query.organization);
			}

			return htmlPage(
				200,
				"Unsubscribe from the weekly AI digest?",
				`<p>The weekly AI digest stops for every site in this organization.</p>
    <form method="post">
      <input type="hidden" name="List-Unsubscribe" value="One-Click">
      <button type="submit">Unsubscribe</button>
    </form>
    <p>Manage your other emails in ${emailSettingsLink(query.organization)}.</p>`
			);
		},
		{ query: unsubscribeQuery }
	)
	.post(
		"/ai-digest",
		async function unsubscribeFromAiDigest({ query, request, set }) {
			mergeWideEvent({
				email_unsubscribe: "ai_digest",
				email_unsubscribe_organization: query.organization,
			});
			const wantsHtml = request.headers.get("accept")?.includes("text/html");

			if (!isValidToken(query.organization, query.token)) {
				mergeWideEvent({ email_unsubscribe_rejected: "invalid_token" });
				if (wantsHtml) {
					return invalidLinkPage(query.organization);
				}
				set.status = 403;
				return { success: false };
			}

			await db
				.update(organization)
				.set({
					emailNotifications: mergeEmailNotificationSettings({
						aiAgents: { weeklyDigest: false },
					}),
				})
				.where(eq(organization.id, query.organization));
			return wantsHtml
				? htmlPage(
						200,
						"You are unsubscribed",
						`<p>The weekly AI digest is off for every site in this organization. Turn it back on any time in ${emailSettingsLink(query.organization)}.</p>`
					)
				: { success: true };
		},
		{
			body: t.Object({ "List-Unsubscribe": t.Literal("One-Click") }),
			query: unsubscribeQuery,
		}
	);
