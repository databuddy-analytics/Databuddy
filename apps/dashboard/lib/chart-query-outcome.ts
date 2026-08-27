import type { UseQueryResult } from "@tanstack/react-query";
export type ChartQueryOutcome<T> =
	| { status: "empty" }
	| { status: "error" }
	| { status: "loading" }
	| { status: "ready"; data: T };

function defaultIsEmpty<T>(data: T): boolean {
	if (data == null) {
		return true;
	}
	if (Array.isArray(data)) {
		return data.length === 0;
	}
	return false;
}

export function chartQueryOutcome<T>(params: {
	data: T | undefined;
	gatePending?: boolean;
	isEmpty?: (data: T) => boolean;
	isError: boolean;
	isPending: boolean;
	isSuccess: boolean;
}): ChartQueryOutcome<T> {
	const isEmptyFn = params.isEmpty ?? defaultIsEmpty;
	if (params.gatePending) {
		return { status: "loading" };
	}
	if (params.isPending) {
		return { status: "loading" };
	}
	if (params.isError) {
		return { status: "error" };
	}
	if (params.data !== undefined && !isEmptyFn(params.data)) {
		return { status: "ready", data: params.data };
	}
	if (params.isSuccess) {
		return { status: "empty" };
	}
	return { status: "loading" };
}

export type ChartQuerySlice<T> = Pick<
	UseQueryResult<T, Error>,
	"data" | "isPending" | "isError" | "isSuccess"
>;
export function chartQueryOutcomeFromQuery<T>(
	query: ChartQuerySlice<T>,
	options?: { gatePending?: boolean; isEmpty?: (data: T) => boolean }
): ChartQueryOutcome<T> {
	return chartQueryOutcome<T>({
		data: query.data,
		gatePending: options?.gatePending,
		isEmpty: options?.isEmpty,
		isError: query.isError,
		isPending: query.isPending,
		isSuccess: query.isSuccess,
	});
}
