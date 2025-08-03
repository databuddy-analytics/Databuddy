import { Logtail } from '@logtail/edge';

const token = process.env.LOGTAIL_SOURCE_TOKEN as string;
const endpoint = process.env.LOGTAIL_ENDPOINT as string;
export const logger = new Logtail(token || '', {
	endpoint: endpoint || '',
	batchSize: 10,
	batchInterval: 1000,
});
