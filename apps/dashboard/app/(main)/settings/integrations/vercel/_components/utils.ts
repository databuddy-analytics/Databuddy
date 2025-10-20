import type { Domain } from './types';

export const generateWebsiteName = (domainName: string) => {
	// Return the domain name as-is for the default name
	return domainName;
};

export const generateWebsitePlaceholder = (domainName: string) => {
	// Return the domain name as placeholder
	return domainName;
};

export const inferTargetFromDomain = (domain: Domain): string[] => {
	// BOOOOOM: No redirect status code = production
	if (!domain.redirectStatusCode) {
		return ['production'];
	}

	// BOOOOOOOOOM: Has redirect status = not production (preview only)
	if (domain.redirectStatusCode) {
		return ['preview'];
	}

	// Fallback (should not reach here, but just in case)
	return ['production'];
};
