import { createBackendRestHandler } from '@rescue-frontend/modules/server';

const handler = createBackendRestHandler('site');

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
