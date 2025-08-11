'use server';

interface QueryConfig {
	allowedFilters: string[];
	customizable: boolean;
	defaultLimit: number;
}

interface QueryTypesResponse {
	success: boolean;
	types: string[];
	configs: Record<string, QueryConfig>;
}

const API_BASE_URL = 'https://api.databuddy.cc'; // process.env.NEXT_PUBLIC_API_URL || 'https://api.databuddy.cc';

export async function getQueryTypes(): Promise<QueryTypesResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/v1/query/types`, {
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

		const data = await response.json();

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
