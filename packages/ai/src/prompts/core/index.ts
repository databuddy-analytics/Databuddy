import { directivesPrompt } from './directives';
import { personaPrompt } from './persona';

export const corePrompt = (websiteId: string, websiteHostname: string) =>
	[personaPrompt(websiteHostname), directivesPrompt(websiteId, websiteHostname)]
		.filter(Boolean)
		.join('\n\n')
		.trim();
