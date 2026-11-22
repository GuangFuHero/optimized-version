// SPDX-License-Identifier: GPL-3.0-only
import { createBackendGraphqlHandler } from '@rescue-frontend/modules/server';

const handler = createBackendGraphqlHandler('site');

export { handler as GET, handler as POST };
