import { getApiKeyFromHeader } from "@databuddy/api-keys/resolve";
import { auth, type User } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { os as createOS } from "@orpc/server";
import { baseErrors } from "./errors";
import {
	enrichRpcWideEventContext,
	recordORPCError,
	setRpcProcedureType,
} from "./lib/rpc-log-context";
import {
	type BillingOwner,
	getBillingOwner,
	getOrganizationOwnerId,
} from "./utils/billing";

export const createRPCContext = async (opts: { headers: Headers }) => {
	const [session, apiKey] = await Promise.all([
		auth.api.getSession({ headers: opts.headers }),
		getApiKeyFromHeader(opts.headers),
	]);

	const user = session?.user as User | undefined;

	const organizationId =
		apiKey?.organizationId ??
		(session?.session as { activeOrganizationId?: string | null })
			?.activeOrganizationId ??
		null;

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
		...opts,
	};
};

export type Context = Awaited<ReturnType<typeof createRPCContext>>;

const os = createOS.$context<Context>().errors(baseErrors);

export const publicProcedure = os.use(({ context, next }) => {
	setRpcProcedureType("public");
	enrichRpcWideEventContext(context);
	return next();
});

export const protectedProcedure = os.use(({ context, next, errors }) => {
	setRpcProcedureType("protected");
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

export const adminProcedure = protectedProcedure.use(
	({ context, next, errors }) => {
		setRpcProcedureType("admin");
		enrichRpcWideEventContext(context);

		if (!context.user || context.user.role !== "ADMIN") {
			recordORPCError({
				code: "FORBIDDEN",
				message: "Admin access required",
			});
			throw errors.FORBIDDEN({ message: "Admin access required" });
		}

		return next({ context });
	}
);

export { os };
