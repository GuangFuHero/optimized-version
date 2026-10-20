import { writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

void openapiTS(new URL('../src/rest/openapi.json', import.meta.url), {
  transform(schema) {
    if (schema.format === 'binary')
      return ts.factory.createTypeReferenceNode('Blob');
  },
}).then((ast) =>
  writeFile(
    new URL('../src/rest/openapi.d.ts', import.meta.url),
    astToString(ast),
  ),
);
