// Vercel API Types
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
	latestDeployments?: Array<{
		id: string;
		alias?: string[];
		automaticAliases?: string[];
		url?: string;
		target?: string | null;
	}>;
}

export interface VercelProjectWithDomain extends VercelProject {
	primaryDomain?: string;
	productionUrl?: string;
}

export interface VercelProjectsResponse {
	projects: VercelProjectWithDomain[];
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

export interface EditEnvVarRequest {
	key?: string;
	value?: string;
	type?: 'system' | 'secret' | 'encrypted' | 'plain' | 'sensitive';
	target?: ('production' | 'preview' | 'development')[];
	gitBranch?: string | null;
	comment?: string;
	customEnvironmentIds?: string[];
}

export interface SetEnvVarRequest {
	value: string;
	type?: 'system' | 'secret' | 'encrypted' | 'plain' | 'sensitive';
	target?: ('production' | 'preview' | 'development')[];
	gitBranch?: string | null;
	comment?: string;
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

// Frontend Component Types
export interface Project {
	id: string;
	name: string;
	accountId: string;
	createdAt?: number;
	updatedAt?: number;
	framework?: string | null;
	live?: boolean;
	primaryDomain?: string;
	productionUrl?: string;
	directoryListing?: boolean;
	nodeVersion?: string;
	link?: {
		type: string;
		repo?: string;
		org?: string;
		productionBranch?: string;
	};
}

export interface Domain {
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

// Integration Status Types
export interface DomainIntegrationStatus {
	domain: string;
	isIntegrated: boolean;
	websiteId: string | null;
	websiteName: string | null;
	environments: string[];
	envVarId: string | null;
	status: 'integrated' | 'not_integrated' | 'orphaned' | 'invalid';
	issues: string[];
}

export interface IntegrationSummary {
	totalDomains: number;
	integratedCount: number;
	notIntegratedCount: number;
	orphanedCount: number;
	invalidCount: number;
	issuesCount: number;
}

// Triage Action Types
export type TriageAction =
	| 'remove_orphaned'
	| 'remove_duplicates'
	| 'unintegrate';

export interface TriageActionConfig {
	label: string;
	icon: any; // React component
	action: TriageAction;
}

// Website Configuration Types
export interface WebsiteConfig {
	domain: Domain;
	name: string;
	target: string[];
}
