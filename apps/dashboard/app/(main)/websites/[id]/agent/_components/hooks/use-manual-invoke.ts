"use client";

import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type InvokeParams = {
	from: string;
	to: string;
	timeUnit?: "minute" | "hour" | "day" | "week" | "month";
	filters?: Array<{
		field: string;
		op: "eq" | "ne" | "contains" | "not_contains" | "starts_with" | "in" | "not_in";
		value: string | number | (string | number)[];
		target?: string;
		having?: boolean;
	}>;
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
};

export type InvokeRequest = {
	tool: string;
	params: InvokeParams;
};

export type InvokeResponse = {
	success: boolean;
	tool?: string;
	data?: unknown[];
	meta?: {
		rowCount: number;
		executionTime: number;
		timezone: string;
		from: string;
		to: string;
	};
	error?: string;
	availableTools?: string[];
};

/**
 * Hook for manually invoking analytics tools/queries directly.
 * Bypasses the AI agent for faster, direct query execution.
 */
export function useManualInvoke() {
	const params = useParams();
	const websiteId = params.id as string;

	const mutation = useMutation({
		mutationFn: async (request: InvokeRequest): Promise<InvokeResponse> => {
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

			const response = await fetch(`${API_URL}/v1/agent/invoke`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({
					websiteId,
					tool: request.tool,
					params: request.params,
					timezone,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error ?? `HTTP ${response.status}`);
			}

			return response.json();
		},
	});

	/**
	 * Invoke a tool with default date range (last 7 days)
	 */
	const invokeWithDefaults = (tool: string, overrides?: Partial<InvokeParams>) => {
		const defaultParams: InvokeParams = {
			from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
			to: dayjs().format("YYYY-MM-DD"),
			timeUnit: "day",
			limit: 100,
			...overrides,
		};

		return mutation.mutateAsync({ tool, params: defaultParams });
	};

	return {
		invoke: mutation.mutateAsync,
		invokeWithDefaults,
		isLoading: mutation.isPending,
		error: mutation.error,
		data: mutation.data,
		reset: mutation.reset,
	};
}
