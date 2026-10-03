import { createBackendGraphqlHandler } from '@rescue-frontend/modules/server';

const handler = createBackendGraphqlHandler('admin');

export { handler as GET, handler as POST };
