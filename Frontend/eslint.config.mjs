// SPDX-License-Identifier: GPL-3.0-only
import nx from '@nx/eslint-plugin';
import query from '@tanstack/eslint-plugin-query';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { builtinRules } from 'eslint/use-at-your-own-risk';

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

// The page's own location, as `window.location` or bare `location` — not a field named `location`.
const LOCATION = `:matches(Identifier[name='location'], MemberExpression[object.name=/^(window|document|self|top|parent|globalThis)$/][property.name='location'])`;
// The window's own `open`: a bare `open` is too often a function of the code's own to report.
const WINDOW = `Identifier[name=/^(window|self|top|parent|globalThis)$/]`;
// The parts of a location whose setters load another page; `hash` only moves within this one.
const PAGE_LOADING_PARTS =
  '/^(href|protocol|host|hostname|port|pathname|search)$/';
// A destination written out: a string, a template, or strings joined with `+`.
const WRITTEN_OUT = `:matches(Literal, TemplateLiteral, BinaryExpression[operator='+'])`;
const LEAVE_TO_CALLER =
  'Navigation: this library cannot depend on @rescue-frontend/modules; leave the navigation to the caller, for example through a callback.';
const navigationMessage = {
  // The apps and libs/modules, which can import @rescue-frontend/modules.
  app: {
    leave:
      'Navigation: leave the page with loadPage from @rescue-frontend/modules (libs/modules/src/route/navigate.ts), which keeps the destination on this site.',
    destination:
      'Navigation: build the destination from SITE_PATHS or ADMIN_PATHS in @rescue-frontend/modules (libs/modules/src/route/paths.ts), or a helper that does.',
    newWindow:
      'Navigation: open a share page with openPointShareLink or openShareTab from @rescue-frontend/modules (libs/modules/src/point-share/share-links.ts), which open only the share pages built there.',
  },
  // ui, data-access and leaflet, which cannot depend on @rescue-frontend/modules.
  library: {
    leave: LEAVE_TO_CALLER,
    destination: LEAVE_TO_CALLER,
    newWindow: LEAVE_TO_CALLER,
  },
};
// One object for every block: ESLint refuses a plugin name bound to two different objects.
const navigationPlugin = {
  rules: { 'no-restricted-syntax': builtinRules.get('no-restricted-syntax') },
};

/**
 * Navigation lint: a whole-page navigation goes through `loadPage`, the one place that sets the
 * page's location, and a destination is built from the path constants rather than written out. A
 * new window (`window.open`) opens only in `point-share/share-links.ts`, on the share pages built
 * there. `no-restricted-syntax` under its own name, so the design-system guardrail's options for
 * that rule, set later for the same files, do not replace these.
 *
 * `audience` picks the advice: `'app'` for code that can import `@rescue-frontend/modules`,
 * `'library'` for the libraries below it, which hand navigation back to their caller.
 */
export function navigationGuardrail(files, audience) {
  const message = navigationMessage[audience];

  return {
    files,
    // The two files that do what the rule reports, each in one checked place.
    ignores: [
      '**/*.spec.*',
      '**/*.test.*',
      '**/*.stories.*',
      '**/route/navigate.ts',
      '**/point-share/share-links.ts',
    ],
    plugins: { navigation: navigationPlugin },
    rules: {
      'navigation/no-restricted-syntax': [
        'error',
        {
          selector: `CallExpression > MemberExpression.callee[property.name=/^(assign|replace)$/] > ${LOCATION}.object`,
          message: message.leave,
        },
        {
          selector: `AssignmentExpression > ${LOCATION}.left`,
          message: message.leave,
        },
        {
          selector: `AssignmentExpression > MemberExpression.left[property.name=${PAGE_LOADING_PARTS}] > ${LOCATION}.object`,
          message: message.leave,
        },
        {
          selector: `CallExpression > MemberExpression.callee[property.name='open'] > ${WINDOW}.object`,
          message: message.newWindow,
        },
        {
          selector: `CallExpression[callee.object.name='router'][callee.property.name=/^(push|replace)$/] > ${WRITTEN_OUT}.arguments:first-child`,
          message: message.destination,
        },
        {
          selector: `CallExpression[callee.name=/^(redirect|permanentRedirect|loadPage|continueSignedIn|continueSignedOut)$/] > ${WRITTEN_OUT}.arguments:first-child`,
          message: message.destination,
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
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:data-access',
                'type:leaflet',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:data-access'],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [],
            },
            {
              sourceTag: 'type:leaflet',
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
  navigationGuardrail(['**/*.ts', '**/*.tsx'], 'library'),
  // libs/modules has no config of its own and lints with this file; apps add their own copy.
  navigationGuardrail(['libs/modules/**/*.ts', 'libs/modules/**/*.tsx'], 'app'),
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
