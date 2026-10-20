import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
  schema: 'libs/data-access/src/admin/graphql/schema.graphql',
  documents: 'libs/data-access/src/admin/graphql/operations.graphql',
  generates: {
    'libs/data-access/src/admin/graphql/__generated__/': {
      preset: 'client',
      presetConfig: { fragmentMasking: false },
      config: {
        scalars: {
          UUID: 'string',
          DateTime: 'string',
          GeoJSON: 'geojson#Geometry',
          // An audit change's before/after: a string, a list of strings, or null.
          JSON: 'unknown',
        },
        strictScalars: true,
        enumsAsConst: true,
        useTypeImports: true,
      },
    },
  },
  hooks: { afterAllFileWrite: ['eslint --fix'] },
} satisfies CodegenConfig;
