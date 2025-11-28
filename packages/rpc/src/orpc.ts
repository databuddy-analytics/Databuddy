import { auth, type User } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { os as createOS, ORPCError } from "@orpc/server";
import {
	enrichSpanWithContext,
	recordORPCError,
	setProcedureAttributes,
} from "./lib/otel";

export const createRPCContext = async (opts: { headers: Headers }) => {
	const session = await auth.api.getSession({
		headers: opts.headers,
	});

	return {
		db,
		auth,
		session: session?.session,
		user: session?.user as User | undefined,
		...opts,
	};
};

export type Context = Awaited<ReturnType<typeof createRPCContext>>;

const os = createOS.$context<Context>();

export const publicProcedure = os.use(({ context, next }) => {
	setProcedureAttributes("public");
	enrichSpanWithContext(context);
	return next();
});

export const protectedProcedure = os.use(({ context, next }) => {
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

	if (!(context.user && context.session)) {
		console.log("UNAUTHORIZED", context.user, context.session);
		recordORPCError({ code: "UNAUTHORIZED" });
		throw new ORPCError("UNAUTHORIZED");
	}

	return next({
		context: {
			...context,
			session: context.session,
			user: context.user,
		},
	});
});

export const adminProcedure = protectedProcedure.use(({ context, next }) => {
	setProcedureAttributes("admin");
	enrichSpanWithContext(context);

	if (context.user.role !== "ADMIN") {
		recordORPCError({
			code: "FORBIDDEN",
			message: "You do not have permission to access this resource",
		});
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to access this resource",
		});
	}

	return next({
		context: {
			...context,
			session: context.session,
			user: context.user,
		},
	});
});

export { os };
