import { createGraphqlRequest } from '../graphql/request';
import { createRestClient } from '../rest/openapi-client';

export const adminRestClient = createRestClient();

export const adminGraphql = createGraphqlRequest();
