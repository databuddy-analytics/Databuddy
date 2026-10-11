import {
	runWithAuthAuditContext,
	runWithAuthTransaction,
	toAuditRequest,
} from "@databuddy/auth";
import { oauthAuth } from "@databuddy/auth/oauth";
import { toNextJsHandler } from "better-auth/next-js";
import { withEvlog } from "@/lib/evlog";

const handlers = toNextJsHandler(oauthAuth.handler);

const auditedOrganizationPaths = new Set([
	"/organization/create",
	"/organization/update",
	"/organization/delete",
	"/organization/add-member",
	"/organization/remove-member",
	"/organization/update-member-role",
	"/organization/invite-member",
	"/organization/accept-invitation",
	"/organization/reject-invitation",
	"/organization/cancel-invitation",
]);
const authRoutePrefix = /^\/api\/auth/;
const dubClickIdCookie = /(?:^|;\s*)dub_id=([^;]+)/;

async function withAuditContext<T>(
	request: Parameters<typeof handlers.GET>[0],
	handler: () => Promise<T>
): Promise<T> {
	const pathname = new URL(request.url).pathname.replace(authRoutePrefix, "");
	const dubClickId = request.headers
		.get("cookie")
		?.match(dubClickIdCookie)?.[1];
	if (!auditedOrganizationPaths.has(pathname)) {
		return dubClickId
			? runWithAuthAuditContext({ dubClickId }, handler)
			: handler();
	}

	const session = await oauthAuth.api.getSession({
		headers: request.headers,
	});
	return runWithAuthAuditContext(
		{
			dubClickId,
			actor: session?.user
				? {
						type: "user",
						id: session.user.id,
						displayName: session.user.name || undefined,
					}
				: undefined,
			operation: `auth${pathname}`,
			request: toAuditRequest(request),
		},
		() => runWithAuthTransaction(handler)
	);
}

// evlog-map-disable-next-line audit -- the auth-audit plugin in @databuddy/auth audits every auth request
export const GET = withEvlog((request: Parameters<typeof handlers.GET>[0]) =>
	withAuditContext(request, () => handlers.GET(request))
);

// evlog-map-disable-next-line audit -- the auth-audit plugin in @databuddy/auth audits every auth request
export const POST = withEvlog((request: Parameters<typeof handlers.POST>[0]) =>
	withAuditContext(request, () => handlers.POST(request))
);
