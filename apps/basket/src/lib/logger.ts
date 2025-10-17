import { Logtail } from '@logtail/edge';

const token = process.env.LOGTAIL_SOURCE_TOKEN as string;
const endpoint = process.env.LOGTAIL_ENDPOINT as string;

// Create a no-op logger for testing or when token is missing
const createNoopLogger = () => ({
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
	log: () => {},
});

// Only initialize Logtail if we have a valid token
export const logger = token && token.trim() !== '' 
	? new Logtail(token, {
		endpoint: endpoint || '',
		batchSize: 10,
		batchInterval: 1000,
	})
	: createNoopLogger();

// Log levels to ensure we only log important events
// export enum LogLevel {
//     ERROR = 'error',
//     WARN = 'warn',
//     INFO = 'info',
//     DEBUG = 'debug'
// }

// const log = (level: LogLevel, message: string, data?: any) => {
//     logger.log(level, message, data);
// };

// const pinoLogger = pino({
//     level: 'info',
//     transport: {
//         target: 'pino-pretty',
//     },
// });

// export { pinoLogger as logger };
