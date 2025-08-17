'use server';

import type { QueryBuilderMeta } from '@databuddy/shared';

interface QueryConfig {
	allowedFilters: string[];
	customizable: boolean;
	defaultLimit: number;
}

export interface QueryConfigWithMeta extends QueryConfig {
	meta?: QueryBuilderMeta;
}

interface QueryTypesResponse {
	success: boolean;
	types: string[];
	configs: Record<string, QueryConfigWithMeta>;
}

const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL || 'https://api.databuddy.cc';

export async function getQueryTypes(
	includeMeta = false
): Promise<QueryTypesResponse> {
	try {
		const url = new URL(`${API_BASE_URL}/v1/query/types`);
		if (includeMeta) {
			url.searchParams.set('include_meta', 'true');
		}

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'X-Api-Key': process.env.DATABUDDY_API_KEY as string,
			},
			cache: 'force-cache',
		});

		if (!response.ok) {
			throw new Error(`API responded with status: ${response.status}`);
		}

		const data = (await response.json()) as QueryTypesResponse;
		return data;
	} catch (error) {
		console.error('Failed to fetch query types:', error);
		return {
			success: false,
			types: [],
			configs: {},
		};
	}
}
