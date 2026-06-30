import {
	type ApiKeyRow,
	getApiKeyFromHeader,
} from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { os as createOS } from "@orpc/server";
import { baseErrors } from "./errors";
import {
	enrichRpcWideEventContext,
	recordORPCError,
	setRpcProcedurePath,
	setRpcProcedureType,
} from "./lib/rpc-log-context";
import { runTracked } from "./middleware/track-mutation";
import { type BillingOwner, getBillingOwner } from "./utils/billing";
import { getOrganizationOwnerId } from "./utils/organization";

export interface PreResolvedAuth {
	apiKey: ApiKeyRow | null;
	session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
}

export interface InternalPrincipalInit {
	createdAt?: Date;
	id?: string;
	keyHash?: string;
	metadata?: Record<string, unknown>;
	name?: string;
	organizationId: string;
	prefix?: string;
	rateLimitEnabled?: boolean;
	scopes: string[];
	start?: string;
	updatedAt?: Date;
	userId?: string | null;
}

export function createInternalPrincipal(
	init: InternalPrincipalInit
): PreResolvedAuth {
	const now = new Date();
	const id = init.id ?? `svc:${init.organizationId}`;
	const apiKey: ApiKeyRow = {
		createdAt: init.createdAt ?? now,
		enabled: true,
		expiresAt: null,
		id,
		keyHash: init.keyHash ?? id,
		lastUsedAt: null,
		metadata: init.metadata ?? {},
		name: init.name ?? "Internal Service",
		organizationId: init.organizationId,
		prefix: init.prefix ?? "svc",
		rateLimitEnabled: init.rateLimitEnabled ?? false,
		rateLimitMax: null,
		rateLimitTimeWindow: null,
		revokedAt: null,
		scopes: init.scopes,
		start: init.start ?? "svc_int_",
		type: "automation",
		updatedAt: init.updatedAt ?? now,
		userId: init.userId ?? null,
	};
	return { apiKey, session: null };
}

export function createServiceAuth(
	organizationId: string,
	scopes: string[]
): PreResolvedAuth {
	return createInternalPrincipal({ organizationId, scopes });
}

export const createRPCContext = async (
	opts: { headers: Headers },
	preResolved?: PreResolvedAuth
) => {
	const [session, apiKey] = preResolved
		? [preResolved.session, preResolved.apiKey]
		: await Promise.all([
				auth.api.getSession({ headers: opts.headers }),
				getApiKeyFromHeader(opts.headers),
			]);

	const user = session?.user;

	const organizationId =
		apiKey?.organizationId ?? session?.session.activeOrganizationId ?? null;

	let billingCache: BillingOwner | undefined;
	let billingResolved = false;

	const getBilling = async (): Promise<BillingOwner | undefined> => {
		if (billingResolved) {
			return billingCache;
		}
		billingResolved = true;

		try {
			if (user) {
				billingCache = await getBillingOwner(user.id, organizationId);
			} else if (apiKey?.organizationId) {
				const ownerId = await getOrganizationOwnerId(apiKey.organizationId);
				if (ownerId) {
					billingCache = await getBillingOwner(ownerId, apiKey.organizationId);
				}
			}
		} catch {
			billingCache = undefined;
		}

		return billingCache;
	};

	return {
		db,
		auth,
		session: session?.session,
		user,
		apiKey: apiKey ?? undefined,
		getBilling,
		organizationId,
		anonymousId: opts.headers.get("x-databuddy-anonymous-id"),
		sessionId: opts.headers.get("x-databuddy-session-id"),
		...opts,
	};
};

export type Context = Awaited<ReturnType<typeof createRPCContext>>;

const os = createOS.$context<Context>().errors(baseErrors);

export const publicProcedure = os.use(({ context, next, path }) => {
	setRpcProcedureType("public");
	setRpcProcedurePath(path);
	enrichRpcWideEventContext(context);
	return next();
});

export const protectedProcedure = os.use(({ context, next, errors, path }) => {
	setRpcProcedureType("protected");
	setRpcProcedurePath(path);
	enrichRpcWideEventContext(context);

	if (!(context.user || context.apiKey)) {
		recordORPCError({ code: "UNAUTHORIZED" });
		throw errors.UNAUTHORIZED();
	}

	return next({ context });
});

export const sessionProcedure = protectedProcedure.use(
	({ context, next, errors }) => {
		if (!(context.user && context.session)) {
			recordORPCError({ code: "UNAUTHORIZED" });
			throw errors.UNAUTHORIZED({ message: "Session required" });
		}

		return next({
			context: {
				...context,
				user: context.user,
				session: context.session,
			},
		});
	}
);

export const trackedProcedure = protectedProcedure.use(
	({ context, next, path }) => runTracked(path.join("."), context, next)
);

export const trackedSessionProcedure = sessionProcedure.use(
	({ context, next, path }) => runTracked(path.join("."), context, next)
);

export { os };
