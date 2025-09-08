import type { Website } from '@databuddy/shared';

type DatabaseStatus = 'ACTIVE' | 'HEALTHY' | 'UNHEALTHY' | 'INACTIVE' | 'PENDING';
type UIStatus = 'live' | 'deprecated' | 'offline';

export function mapWebsiteStatusToUIStatus(status: DatabaseStatus): UIStatus {
	switch (status) {
		case 'ACTIVE':
		case 'HEALTHY':
			return 'live';
		case 'UNHEALTHY':
		case 'PENDING':
			return 'deprecated';
		case 'INACTIVE':
			return 'offline';
		default:
			return 'live';
	}
}


//gets ui status from a website object
export function getWebsiteUIStatus(website: Website): UIStatus {
	return mapWebsiteStatusToUIStatus(website.status as DatabaseStatus);
}
