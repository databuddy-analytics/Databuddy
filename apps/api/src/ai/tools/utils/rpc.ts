import { ORPCError } from "@orpc/server";
import { getServerRPCClient } from "../../../lib/orpc-server";
import type { AppContext } from "../../config/context";
import { createToolLogger } from "./logger";

const logger = createToolLogger("RPC");

/**
 * Generic RPC procedure caller for AI tools.
 * Handles error mapping and logging consistently across all tools.
 */
export async function callRPCProcedure(
	routerName: string,
	method: string,
	input: unknown,
	context: AppContext
) {
	try {
		const headers = context.requestHeaders ?? new Headers();
		const client = await getServerRPCClient(headers);

		const router = client[routerName as keyof typeof client] as
			| Record<string, (input: unknown) => Promise<unknown>>
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

		return await clientFn(input);
	} catch (error) {
		if (error instanceof ORPCError) {
			logger.error("ORPC error", {
				procedure: `${routerName}.${method}`,
				code: error.code,
				message: error.message,
			});

			const userMessage =
				error.code === "UNAUTHORIZED"
					? "You don't have permission to perform this action."
					: error.code === "NOT_FOUND"
						? "The requested resource was not found."
						: error.code === "BAD_REQUEST"
							? `Invalid request: ${error.message}`
							: error.code === "FORBIDDEN"
								? "You don't have permission to access this resource."
								: error.code === "CONFLICT"
									? "This resource already exists or conflicts with an existing one."
									: error.message ||
									"An error occurred while processing your request.";

			throw new Error(userMessage);
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
