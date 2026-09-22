import type { UseQueryResult } from "@tanstack/react-query";
export type ListQueryOutcome<T> =
	| { status: "empty" }
	| { status: "error" }
	| { status: "loading" }
	| { status: "ready"; items: T[] };

export function listQueryOutcome<T>(params: {
	data: T[] | undefined;
	gatePending?: boolean;
	isError: boolean;
	isPending: boolean;
	isSuccess: boolean;
}): ListQueryOutcome<T> {
	if (params.gatePending) {
		return { status: "loading" };
	}
	if (params.isPending) {
		return { status: "loading" };
	}
	if (params.isError) {
		return { status: "error" };
	}
	const items = params.data ?? [];
	if (items.length > 0) {
		return { status: "ready", items };
	}
	if (params.isSuccess) {
		return { status: "empty" };
	}
	return { status: "loading" };
}

export type ListQuerySlice<T> = Pick<
	UseQueryResult<T[], Error>,
	"data" | "isPending" | "isError" | "isSuccess"
>;
export function listQueryOutcomeFromQuery<T>(
	query: ListQuerySlice<T>,
	options?: { gatePending?: boolean }
): ListQueryOutcome<T> {
	return listQueryOutcome<T>({
		data: query.data ?? [],
		gatePending: options?.gatePending,
		isError: query.isError,
		isPending: query.isPending,
		isSuccess: query.isSuccess,
	});
}
