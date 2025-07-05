import { Elysia } from 'elysia';
import { analyticsHandler } from '../handlers/basket/analytics-handler';

const app = new Elysia()
  .post(
    '/',
    async ({ body, query, request }) => {
      const response = await analyticsHandler.handleSingleEvent({
        body,
        query,
        request
      });
      
      return response;
    }
  )
  .post(
    '/batch',
    async ({ body, query, request }) => {
      const response = await analyticsHandler.handleBatchEvents({
        body,
        query,
        request
      });
      
      return response;
    }
  );

export default app;