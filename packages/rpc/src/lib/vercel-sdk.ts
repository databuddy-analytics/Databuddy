import type {
	CreateEnvVarRequest,
	CreateEnvVarResponse,
	EditEnvVarRequest,
	SetEnvVarRequest,
	VercelDomainsResponse,
	VercelEnvVar,
	VercelEnvVarsResponse,
	VercelProject,
	VercelProjectsResponse,
	VercelProjectWithDomain,
} from '@databuddy/shared';

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

		const response = await this.request<{
			projects: VercelProject[];
			pagination: { count: number; next: number | null; prev: number | null };
		}>(endpoint);

		// Process projects to extract primary domain information
		const projectsWithDomains: VercelProjectWithDomain[] =
			response.projects.map((project) => {
				let primaryDomain: string | undefined;
				let productionUrl: string | undefined;

				// Find production deployment and extract primary domain
				if (project.latestDeployments?.length) {
					const productionDeployment = project.latestDeployments.find(
						(deployment) =>
							deployment.target === 'production' || deployment.target === null
					);

					if (productionDeployment) {
						// Prefer custom domains (alias) over automatic aliases
						if (productionDeployment.alias?.length) {
							// Find the first non-vercel.app domain, or fallback to first alias
							primaryDomain =
								productionDeployment.alias.find(
									(domain) => !domain.endsWith('.vercel.app')
								) || productionDeployment.alias[0];
						} else if (productionDeployment.automaticAliases?.length) {
							primaryDomain = productionDeployment.automaticAliases[0];
						} else if (productionDeployment.url) {
							primaryDomain = productionDeployment.url;
						}

						productionUrl = productionDeployment.url;
					}

					// Fallback: if no production deployment, use any deployment
					if (!primaryDomain && project.latestDeployments[0]) {
						const firstDeployment = project.latestDeployments[0];
						if (firstDeployment.alias?.length) {
							primaryDomain =
								firstDeployment.alias.find(
									(domain) => !domain.endsWith('.vercel.app')
								) || firstDeployment.alias[0];
						} else if (firstDeployment.automaticAliases?.length) {
							primaryDomain = firstDeployment.automaticAliases[0];
						} else if (firstDeployment.url) {
							primaryDomain = firstDeployment.url;
						}
					}
				}

				return {
					...project,
					primaryDomain,
					productionUrl,
				};
			});

		return {
			projects: projectsWithDomains,
			pagination: response.pagination,
		};
	}

	async getProjectEnvs(projectId: string): Promise<VercelEnvVarsResponse> {
		return await this.request<VercelEnvVarsResponse>(
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

		return await this.request<CreateEnvVarResponse>(endpoint, {
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

		return await this.request<CreateEnvVarResponse>(endpoint, {
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

		return await this.request<VercelDomainsResponse>(endpoint);
	}

	async editProjectEnv(
		projectId: string,
		envVarId: string,
		envVar: EditEnvVarRequest,
		options: {
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<VercelEnvVar> {
		const searchParams = new URLSearchParams();
		if (options.teamId) {
			searchParams.set('teamId', options.teamId);
		}
		if (options.slug) {
			searchParams.set('slug', options.slug);
		}

		const query = searchParams.toString();
		const endpoint = `/v9/projects/${projectId}/env/${envVarId}${query ? `?${query}` : ''}`;

		return await this.request<VercelEnvVar>(endpoint, {
			method: 'PATCH',
			body: JSON.stringify(envVar),
		});
	}

	async removeProjectEnv(
		projectId: string,
		envVarId: string,
		options: {
			customEnvironmentId?: string;
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<VercelEnvVar[]> {
		const searchParams = new URLSearchParams();
		if (options.customEnvironmentId) {
			searchParams.set('customEnvironmentId', options.customEnvironmentId);
		}
		if (options.teamId) {
			searchParams.set('teamId', options.teamId);
		}
		if (options.slug) {
			searchParams.set('slug', options.slug);
		}

		const query = searchParams.toString();
		const endpoint = `/v9/projects/${projectId}/env/${envVarId}${query ? `?${query}` : ''}`;

		return await this.request<VercelEnvVar[]>(endpoint, {
			method: 'DELETE',
		});
	}

	async getProjectEnvByKey(
		projectId: string,
		key: string,
		_options: {
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<VercelEnvVar | null> {
		const envs = await this.getProjectEnvs(projectId);
		return envs.envs.find((env) => env.key === key) || null;
	}

	async getProjectEnvsByKey(
		projectId: string,
		key: string,
		_options: {
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<VercelEnvVar[]> {
		const envs = await this.getProjectEnvs(projectId);

		return envs.envs.filter((env) => env.key === key);
	}

	async setProjectEnv(
		projectId: string,
		key: string,
		envVar: SetEnvVarRequest,
		options: {
			upsert?: boolean;
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<VercelEnvVar> {
		// Check if env var exists
		const existing = await this.getProjectEnvByKey(projectId, key, options);

		if (existing) {
			// Update existing
			return this.editProjectEnv(
				projectId,
				existing.id,
				{
					value: envVar.value,
					type: envVar.type,
					target: envVar.target,
					gitBranch: envVar.gitBranch,
					comment: envVar.comment,
				},
				options
			);
		}

		// Create new
		const createRequest: CreateEnvVarRequest = {
			key,
			value: envVar.value,
			type: envVar.type || 'plain',
			target: envVar.target || ['production'],
			gitBranch: envVar.gitBranch,
			comment: envVar.comment,
		};

		const result = await this.createProjectEnv(projectId, createRequest, {
			upsert: options.upsert,
			teamId: options.teamId,
			slug: options.slug,
		});

		// Return the created env var (handle both single and array responses)
		if (Array.isArray(result.created)) {
			return result.created[0];
		}
		return result.created;
	}

	async deleteProjectEnvByKey(
		projectId: string,
		key: string,
		options: {
			teamId?: string;
			slug?: string;
		} = {}
	): Promise<boolean> {
		const existing = await this.getProjectEnvByKey(projectId, key, options);

		if (!existing) {
			return false; // Env var doesn't exist
		}

		await this.removeProjectEnv(projectId, existing.id, options);
		return true;
	}

	async getUser(): Promise<{
		user: { id: string; username: string; email: string };
	}> {
		return await this.request<{
			user: { id: string; username: string; email: string };
		}>('/v2/user');
	}
}
