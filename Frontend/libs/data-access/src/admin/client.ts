import { fetchExchange, type AnyVariables, type OperationResult } from 'urql';

import { createUrqlClient } from '../graphql/client';
import { createRestClient, responseData } from '../rest/openapi-client';

export const adminRestClient = createRestClient();

export const adminGraphqlClient = createUrqlClient({
  runtime: 'client',
  url: '/api/graphql',
  exchanges: [fetchExchange],
  requestPolicy: 'network-only',
  fetchOptions: { credentials: 'include' },
});

export function graphqlResponseData<T, Variables extends AnyVariables>(
  response: OperationResult<T, Variables>,
): T {
  if (response.error) throw response.error;
  return responseData(response);
}
