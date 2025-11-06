import { auth, type User } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
	getRateLimitIdentifier,
	type RateLimiter,
	rateLimiters,
} from "./utils/rate-limit";

export const createTRPCContext = async (opts: { headers: Headers }) => {
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

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

export const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape }) {
		return shape;
	},
});

export const createCallerFactory = t.createCallerFactory;

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;

const createRateLimitMiddleware = (rateLimiter: RateLimiter) =>
	t.middleware(async ({ ctx, next }) => {
		const identifier = getRateLimitIdentifier(ctx.user?.id, ctx.headers);

		const { success } = await rateLimiter.checkLimit(identifier);

		if (!success) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Rate limit exceeded. Please try again later.",
			});
		}

		return next({ ctx });
	});

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!(ctx.user && ctx.session)) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}

	return next({
		ctx: {
			...ctx,
			session: ctx.session,
			user: ctx.user,
		},
	});
});

export const rateLimitedProtectedProcedure = protectedProcedure.use(
	createRateLimitMiddleware(rateLimiters.api)
);

export const rateLimitedAdminProcedure = protectedProcedure
	.use(({ ctx, next }) => {
		if (ctx.user.role !== "ADMIN") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You do not have permission to access this resource",
			});
		}

		return next({
			ctx: {
				...ctx,
				session: ctx.session,
				user: ctx.user,
			},
		});
	})
	.use(createRateLimitMiddleware(rateLimiters.admin));
