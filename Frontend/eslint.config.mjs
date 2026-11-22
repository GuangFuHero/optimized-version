import nx from '@nx/eslint-plugin';
import query from '@tanstack/eslint-plugin-query';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// A hex, rgb() or rgba() colour anywhere in a string.
const COLOUR = String.raw`/(^|[^\w&])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\(/`;
// A non-zero length written as a bare number or a px/rem/em string; `0` and percentages pass.
const LENGTH = String.raw`/^['"]?([1-9]\d*|0?\.\d+)(\.\d+)?(px|rem|em)?['"]?$/`;
const message = {
  colour:
    'Design system: take colours from designTokens (Frontend/docs/design-system.md).',
  radius:
    'Design system: use designTokens.radius, or a libs/ui component that sets it.',
  fontSize:
    'Design system: use designTokens.typography / textSize for text, iconSize for icons.',
};

export function designSystemGuardrail(files) {
  return {
    files,
    // `brand/` draws the logo and mascot, whose colours are the artwork's own.
    ignores: ['**/*.spec.*', '**/*.test.*', '**/*.stories.*', '**/brand/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mui/material',
              importNames: ['Button'],
              message: 'use Button from libs/ui',
            },
            {
              name: '@mui/material/Button',
              message: 'use Button from libs/ui',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${COLOUR}]`, message: message.colour },
        {
          selector: `TemplateElement[value.raw=${COLOUR}]`,
          message: message.colour,
        },
        {
          selector: `Property[key.name='borderRadius'] > Literal[raw=${LENGTH}]`,
          message: message.radius,
        },
        {
          selector: `Property[key.name='fontSize'] > Literal[raw=${LENGTH}]`,
          message: message.fontSize,
        },
      ],
    },
  };
}

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  reactHooks.configs.flat['recommended-latest'],
  ...query.configs['flat/recommended'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:module',
                'type:ui',
                'type:data-access',
              ],
            },
            {
              sourceTag: 'type:module',
              onlyDependOnLibsWithTags: ['type:ui', 'type:data-access'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:data-access'],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    plugins: { react },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      'no-new': 'error',
      'no-unneeded-ternary': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
    },
  },
  // libs/modules has no config of its own and lints with this file; apps add their own copy.
  designSystemGuardrail(['libs/modules/**/*.ts', 'libs/modules/**/*.tsx']),
  {
    files: ['libs/modules/src/map/admin/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/session/site-clients', '**/site/**'],
              message:
                'Use shared map helpers and admin query options in the admin map.',
            },
          ],
        },
      ],
    },
  },
];
