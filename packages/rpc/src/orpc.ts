import { getApiKeyFromHeader } from "@databuddy/api-keys/resolve";
import { auth, type User } from "@databuddy/auth";
import { and, db, eq, member } from "@databuddy/db";
import { os as createOS, ORPCError } from "@orpc/server";
import { Autumn as autumn } from "autumn-js";
import { baseErrors } from "./errors";
import {
	enrichSpanWithContext,
	recordORPCError,
	setProcedureAttributes,
} from "./lib/otel";

/**
 * Gets the billing owner ID for the current context.
 * If in an organization, returns the org owner's ID.
 * Otherwise, returns the current user's ID.
 */
async function getBillingOwnerId(
	userId: string,
	activeOrganizationId: string | null | undefined
): Promise<{
	customerId: string;
	isOrganization: boolean;
	canUserUpgrade: boolean;
	planId: string;
}> {
	let customerId = userId;
	let isOrganization = false;
	let canUserUpgrade = true;

	// If user has an active organization, get the org owner's billing
	if (activeOrganizationId) {
		const [orgOwnerResult, currentUserMember] = await Promise.all([
			db
				.select({ ownerId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.organizationId, activeOrganizationId),
						eq(member.role, "owner")
					)
				)
				.limit(1),
			db
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, activeOrganizationId),
						eq(member.userId, userId)
					)
				)
				.limit(1),
		]);

		const orgOwner = orgOwnerResult.at(0);
		if (orgOwner) {
			customerId = orgOwner.ownerId;
			isOrganization = true;
			const role = currentUserMember.at(0)?.role;
			canUserUpgrade =
				orgOwner.ownerId === userId || role === "admin" || role === "owner";
		}
	}

	// Get the plan from Autumn
	let planId = "free";
	try {
		const customerResult = await autumn.customers.get(customerId);
		const customer = customerResult.data;

		if (customer) {
			const activeProduct = customer.products?.find(
				(p) => p.status === "active"
			);
			if (activeProduct?.id) {
				planId = String(activeProduct.id).toLowerCase();
			}
		}
	} catch {
		// Fallback to free plan on error
		planId = "free";
	}

	return { customerId, isOrganization, canUserUpgrade, planId };
}

export const createRPCContext = async (opts: { headers: Headers }) => {
	const [session, apiKey] = await Promise.all([
		auth.api.getSession({ headers: opts.headers }),
		getApiKeyFromHeader(opts.headers),
	]);

	let billingContext:
		| {
				customerId: string;
				isOrganization: boolean;
				canUserUpgrade: boolean;
				planId: string;
		  }
		| undefined;

	if (session?.user) {
		try {
			const activeOrgId = (
				session.session as { activeOrganizationId?: string | null }
			)?.activeOrganizationId;
			billingContext = await getBillingOwnerId(session.user.id, activeOrgId);
		} catch {
			billingContext = undefined;
		}
	} else if (apiKey?.organizationId) {
		try {
			const [orgOwner] = await db
				.select({ ownerId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.organizationId, apiKey.organizationId),
						eq(member.role, "owner")
					)
				)
				.limit(1);
			if (orgOwner) {
				billingContext = await getBillingOwnerId(
					orgOwner.ownerId,
					apiKey.organizationId
				);
			}
		} catch {
			billingContext = undefined;
		}
	}

	return {
		db,
		auth,
		session: session?.session,
		user: session?.user as User | undefined,
		apiKey: apiKey ?? undefined,
		billing: billingContext,
		...opts,
	};
};

export type Context = Awaited<ReturnType<typeof createRPCContext>>;

/**
 * Throws UNAUTHORIZED if context.user is undefined.
 * Use at the start of handlers that require session auth (not API key).
 */
export function requireUserId(context: Context): string {
	const id = context.user?.id;
	if (!id) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Session required for this operation",
		});
	}
	return id;
}

/**
 * Base oRPC instance with context and type-safe errors.
 * All procedures inherit these error definitions for client-side type inference.
 */
const os = createOS.$context<Context>().errors(baseErrors);

export const publicProcedure = os.use(({ context, next }) => {
	setProcedureAttributes("public");
	enrichSpanWithContext(context);
	return next();
});

export const protectedProcedure = os.use(({ context, next, errors }) => {
	setProcedureAttributes("protected");
	enrichSpanWithContext(context);

	if (context.user?.role === "ADMIN") {
		return next({
			context: {
				...context,
				session: context.session,
				user: context.user,
			},
		});
	}

	if (context.user && context.session) {
		return next({
			context: {
				...context,
				session: context.session,
				user: context.user,
			},
		});
	}

	// API key auth — scope/permission checks happen downstream (e.g. withLinksAccess)
	if (context.apiKey) {
		return next({
			context: {
				...context,
				session: context.session,
				user: context.user,
			},
		});
	}

	recordORPCError({ code: "UNAUTHORIZED" });
	throw errors.UNAUTHORIZED();
});

export const adminProcedure = protectedProcedure.use(
	({ context, next, errors }) => {
		setProcedureAttributes("admin");
		enrichSpanWithContext(context);

		if (!context.user || context.user.role !== "ADMIN") {
			recordORPCError({
				code: "FORBIDDEN",
				message: "Admin access required",
			});
			throw errors.FORBIDDEN({ message: "Admin access required" });
		}

		return next({
			context: {
				...context,
				session: context.session,
				user: context.user,
			},
		});
	}
);

export { os };
