import {
	auth,
	runWithAuthAuditContext,
	runWithAuthTransaction,
} from "@databuddy/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { getTrustedClientIp } from "@/lib/trusted-client-ip";

const handlers = toNextJsHandler(auth.handler);

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

async function withAuditContext<T>(
	request: Parameters<typeof handlers.GET>[0],
	handler: () => Promise<T>
): Promise<T> {
	const pathname = new URL(request.url).pathname.replace(authRoutePrefix, "");
	if (!auditedOrganizationPaths.has(pathname)) {
		return handler();
	}

	const session = await auth.api.getSession({ headers: request.headers });
	return runWithAuthAuditContext(
		{
			actor: session?.user
				? {
						type: "user",
						id: session.user.id,
						displayName: session.user.name || undefined,
					}
				: undefined,
			operation: `auth${pathname}`,
			request: {
				requestId: request.headers.get("x-request-id") ?? undefined,
				ip: getTrustedClientIp(request.headers),
				userAgent: request.headers.get("user-agent") ?? undefined,
			},
		},
		() => runWithAuthTransaction(handler)
	);
}

export function GET(request: Parameters<typeof handlers.GET>[0]) {
	return withAuditContext(request, () => handlers.GET(request));
}

export function POST(request: Parameters<typeof handlers.POST>[0]) {
	return withAuditContext(request, () => handlers.POST(request));
}
