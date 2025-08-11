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

export async function getQueryTypes(): Promise<QueryTypesResponse> {
	try {
		const response = await fetch('https://api.databuddy.cc/v1/query/types', {
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
