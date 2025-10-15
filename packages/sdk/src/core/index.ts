export { detectClientId } from '../utils';
export * from './flags';
export * from './script';
export * from './tracker';
export * from './types';

import { Databuddy as DatabuddyReact } from '../react/Databuddy';

/**
 * @deprecated Use Databuddy from `@databuddy/sdk/react` instead
 */
export const Databuddy = DatabuddyReact;
