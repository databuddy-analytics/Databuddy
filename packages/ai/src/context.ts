import { type BaseContext, createTypedContext } from '@ai-sdk-tools/artifacts';
import type { User } from '@databuddy/auth';

interface ChatContext extends BaseContext {
	websiteId: string;
	websiteHostname: string;
	user: User;
}

const { setContext, getContext } = createTypedContext<ChatContext>();

export function getCurrentUser() {
	const context = getContext();
	return {
		user: context.user,
		websiteId: context.websiteId,
		websiteHostname: context.websiteHostname,
	};
}

export { setContext, getContext };
