export interface VercelProject {
	id: string;
	name: string;
	framework?: string | null;
	createdAt?: number;
	updatedAt?: number;
	accountId: string;
	directoryListing: boolean;
	nodeVersion: string;
	live?: boolean;
	link?: {
		type: string;
		repo?: string;
		org?: string;
		productionBranch?: string;
	};
}

export interface VercelProjectsResponse {
	projects: VercelProject[];
	pagination: {
		count: number;
		next: number | null;
		prev: number | null;
	};
}

export interface VercelEnvVar {
	id: string;
	key: string;
	value: string;
	type: string;
	target: string[];
	createdAt: number;
	updatedAt: number;
	gitBranch?: string;
	comment?: string;
	customEnvironmentIds?: string[];
	system?: boolean;
}

export interface VercelEnvVarsResponse {
	envs: VercelEnvVar[];
}

export interface CreateEnvVarRequest {
	key: string;
	value: string;
	type: 'system' | 'secret' | 'encrypted' | 'plain' | 'sensitive';
	target?: ('production' | 'preview' | 'development')[];
	gitBranch?: string | null;
	comment?: string;
	customEnvironmentIds?: string[];
}

export interface CreateEnvVarResponse {
	created: VercelEnvVar | VercelEnvVar[];
	failed: Array<{
		error: {
			code: string;
			message: string;
			key?: string;
			envVarId?: string;
			envVarKey?: string;
			action?: string;
			link?: string;
			value?: string | string[];
			gitBranch?: string;
			target?: string | string[];
			project?: string;
		};
	}>;
}

export interface VercelDomain {
	name: string;
	apexName: string;
	projectId: string;
	redirect?: string | null;
	redirectStatusCode?: number | null;
	gitBranch?: string | null;
	customEnvironmentId?: string | null;
	updatedAt: number;
	createdAt: number;
	verified: boolean;
	verification?: Array<{
		type: string;
		domain: string;
		value: string;
		reason: string;
	}>;
}

export interface VercelDomainsResponse {
	domains: VercelDomain[];
	pagination: {
		count: number;
		next: number | null;
		prev: number | null;
	};
}

export class VercelSDK {
	private baseUrl = 'https://api.vercel.com';
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json',
				...options.headers,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Vercel API error: ${response.status} ${response.statusText}`
			);
		}

		return response.json();
	}

	async getProjects(
		params: { limit?: string; since?: number; until?: number } = {}
	): Promise<VercelProjectsResponse> {
		const searchParams = new URLSearchParams();
		if (params.limit) {
			searchParams.set('limit', params.limit);
		}
		if (params.since) {
			searchParams.set('since', params.since.toString());
		}
		if (params.until) {
			searchParams.set('until', params.until.toString());
		}

		const query = searchParams.toString();
		const endpoint = `/v10/projects${query ? `?${query}` : ''}`;

		return this.request<VercelProjectsResponse>(endpoint);
	}

	async getProjectEnvs(projectId: string): Promise<VercelEnvVarsResponse> {
		return this.request<VercelEnvVarsResponse>(
			`/v10/projects/${projectId}/env`
		);
	}

	async createProjectEnv(
		projectId: string,
		envVar: CreateEnvVarRequest,
		options: {
			upsert?: boolean;
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<CreateEnvVarResponse> {
		const searchParams = new URLSearchParams();
		if (options.upsert) {
			searchParams.set('upsert', 'true');
		}
		if (options.teamId) {
			searchParams.set('teamId', options.teamId);
		}
		if (options.slug) {
			searchParams.set('slug', options.slug);
		}

		const query = searchParams.toString();
		const endpoint = `/v10/projects/${projectId}/env${query ? `?${query}` : ''}`;

		// Prepare the request body - ensure required fields are present
		const requestBody: CreateEnvVarRequest = {
			key: envVar.key,
			value: envVar.value,
			type: envVar.type,
			...(envVar.target && { target: envVar.target }),
			...(envVar.customEnvironmentIds && {
				customEnvironmentIds: envVar.customEnvironmentIds,
			}),
			...(envVar.gitBranch !== undefined && { gitBranch: envVar.gitBranch }),
			...(envVar.comment && { comment: envVar.comment }),
		};

		// Validate that either target or customEnvironmentIds is provided
		if (!(requestBody.target || requestBody.customEnvironmentIds)) {
			requestBody.target = ['production']; // Default to production if neither is specified
		}

		return this.request<CreateEnvVarResponse>(endpoint, {
			method: 'POST',
			body: JSON.stringify(requestBody),
		});
	}

	async createProjectEnvBatch(
		projectId: string,
		envVars: CreateEnvVarRequest[],
		options: {
			upsert?: boolean;
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<CreateEnvVarResponse> {
		const searchParams = new URLSearchParams();
		if (options.upsert) {
			searchParams.set('upsert', 'true');
		}
		if (options.teamId) {
			searchParams.set('teamId', options.teamId);
		}
		if (options.slug) {
			searchParams.set('slug', options.slug);
		}

		const query = searchParams.toString();
		const endpoint = `/v10/projects/${projectId}/env${query ? `?${query}` : ''}`;

		// Prepare the request body array
		const requestBody = envVars.map((envVar) => {
			const body: CreateEnvVarRequest = {
				key: envVar.key,
				value: envVar.value,
				type: envVar.type,
				...(envVar.target && { target: envVar.target }),
				...(envVar.customEnvironmentIds && {
					customEnvironmentIds: envVar.customEnvironmentIds,
				}),
				...(envVar.gitBranch !== undefined && { gitBranch: envVar.gitBranch }),
				...(envVar.comment && { comment: envVar.comment }),
			};

			// Validate that either target or customEnvironmentIds is provided
			if (!(body.target || body.customEnvironmentIds)) {
				body.target = ['production']; // Default to production if neither is specified
			}

			return body;
		});

		return this.request<CreateEnvVarResponse>(endpoint, {
			method: 'POST',
			body: JSON.stringify(requestBody),
		});
	}

	async getProjectDomains(
		projectId: string,
		params: {
			production?: string;
			target?: string;
			customEnvironmentId?: string;
			gitBranch?: string;
			redirects?: string;
			redirect?: string;
			verified?: string;
			limit?: number;
			since?: number;
			until?: number;
			order?: string;
		} = {}
	): Promise<VercelDomainsResponse> {
		const searchParams = new URLSearchParams();
		if (params.production) {
			searchParams.set('production', params.production);
		}
		if (params.target) {
			searchParams.set('target', params.target);
		}
		if (params.customEnvironmentId) {
			searchParams.set('customEnvironmentId', params.customEnvironmentId);
		}
		if (params.gitBranch) {
			searchParams.set('gitBranch', params.gitBranch);
		}
		if (params.redirects) {
			searchParams.set('redirects', params.redirects);
		}
		if (params.redirect) {
			searchParams.set('redirect', params.redirect);
		}
		if (params.verified) {
			searchParams.set('verified', params.verified);
		}
		if (params.limit) {
			searchParams.set('limit', params.limit.toString());
		}
		if (params.since) {
			searchParams.set('since', params.since.toString());
		}
		if (params.until) {
			searchParams.set('until', params.until.toString());
		}
		if (params.order) {
			searchParams.set('order', params.order);
		}

		const query = searchParams.toString();
		const endpoint = `/v9/projects/${projectId}/domains${query ? `?${query}` : ''}`;

		return this.request<VercelDomainsResponse>(endpoint);
	}

	async getUser(): Promise<{
		user: { id: string; username: string; email: string };
	}> {
		return this.request<{
			user: { id: string; username: string; email: string };
		}>('/v2/user');
	}
}
