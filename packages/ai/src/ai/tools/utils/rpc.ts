import { createRouterClient, ORPCError } from "@orpc/server";
import type { AppContext } from "../../config/context";
import { createToolLogger } from "./logger";

const logger = createToolLogger("RPC");
const MUTATION_METHOD_RE =
	/^(add|archive|bulk|create|delete|detect|pause|publish|remove|reply|reset|restore|resume|revoke|rotate|send|set|trigger|unarchive|update|upsert)/i;

function issuePath(path: unknown): string {
	const segments = (Array.isArray(path) ? path : []).map((segment) =>
		typeof segment === "object" && segment !== null && "key" in segment
			? String((segment as { key: unknown }).key)
			: String(segment)
	);
	return segments.length > 0 ? segments.join(".") : "input";
}

function validationIssueSummary(cause: unknown): string | null {
	if (
		!(
			cause &&
			typeof cause === "object" &&
			"issues" in cause &&
			Array.isArray(cause.issues)
		) ||
		cause.issues.length === 0
	) {
		return null;
	}
	const issues: unknown[] = cause.issues;
	return issues
		.map((issue) => {
			if (!(issue && typeof issue === "object")) {
				return "input: invalid value";
			}
			const path = "path" in issue ? issue.path : undefined;
			const message =
				"message" in issue && typeof issue.message === "string"
					? issue.message
					: "invalid value";
			return `${issuePath(path)}: ${message}`;
		})
		.join("; ");
}

export async function callRPCProcedure(
	routerName: string,
	method: string,
	input: unknown,
	context: AppContext,
	abortSignal?: AbortSignal
) {
	try {
		if (context.mutationMode === "dry-run" && MUTATION_METHOD_RE.test(method)) {
			return {
				dryRun: true,
				message: `Dry-run mode blocked ${routerName}.${method}; no data was changed.`,
				mutationBlocked: true,
				success: false,
			};
		}

		const headers = context.requestHeaders ?? new Headers();
		const { appRouter, createRPCContext } = await import("@databuddy/rpc");
		const client = createRouterClient(appRouter, {
			context: await createRPCContext({ headers }, context.serviceAuth),
		});

		const router = client[routerName as keyof typeof client] as
			| Record<
					string,
					(
						input: unknown,
						options?: { signal?: AbortSignal }
					) => Promise<unknown>
			  >
			| undefined;
		if (!router || typeof router !== "object") {
			throw new Error(`Router ${routerName} not found`);
		}

		const clientFn = router[method];
		if (typeof clientFn !== "function") {
			throw new Error(
				`Procedure ${routerName}.${method} not found or not callable.`
			);
		}

		return await (abortSignal
			? clientFn(input, { signal: abortSignal })
			: clientFn(input));
	} catch (error) {
		if (error instanceof ORPCError) {
			logger.error("ORPC error", {
				procedure: `${routerName}.${method}`,
				code: error.code,
				message: error.message,
			});

			const fallbackMessage =
				error.code === "UNAUTHORIZED"
					? "You don't have permission to perform this action."
					: error.code === "NOT_FOUND"
						? "The requested resource was not found."
						: error.code === "FORBIDDEN"
							? "You don't have permission to access this resource."
							: error.code === "CONFLICT"
								? "This resource already exists or conflicts with an existing one."
								: "An error occurred while processing your request.";
			const hasSpecificMessage =
				error.message !== "" &&
				error.message !== new ORPCError(error.code).message;
			const issues = validationIssueSummary(error.cause);
			const userMessage =
				error.code === "BAD_REQUEST"
					? `Invalid request: ${issues ?? error.message}`
					: hasSpecificMessage
						? error.message
						: fallbackMessage;

			throw new ORPCError(error.code, {
				message: userMessage,
				data: error.data,
				status: error.status,
				cause: error.cause,
			});
		}

		if (error instanceof Error) {
			logger.error("RPC call error", {
				procedure: `${routerName}.${method}`,
				error: error.message,
				stack: error.stack,
				input,
			});
			throw error;
		}

		logger.error("Unknown error in RPC call", {
			procedure: `${routerName}.${method}`,
			error,
			input,
		});
		throw new Error("An unexpected error occurred. Please try again.");
	}
}
