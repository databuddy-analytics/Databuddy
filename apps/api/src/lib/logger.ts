import { Logtail } from '@logtail/edge';

const token = process.env.LOGTAIL_SOURCE_TOKEN as string;
const endpoint = process.env.LOGTAIL_ENDPOINT as string;

if (!(token && endpoint)) {
	console.log('LOGTAIL_SOURCE_TOKEN and LOGTAIL_ENDPOINT must be set');
}

export const logger = new Logtail(token, {
	endpoint,
	batchSize: 10,
	batchInterval: 1000,
});
