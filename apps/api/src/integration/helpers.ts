import type { Context } from "@databuddy/rpc";
import { type AnyProcedure, createProcedureClient } from "@orpc/server";

export function call<T extends AnyProcedure>(procedure: T, context: Context) {
	return createProcedureClient(procedure, { context });
}
