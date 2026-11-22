// SPDX-License-Identifier: GPL-3.0-only
import nextEslintPluginNext from '@next/eslint-plugin-next';
import nx from '@nx/eslint-plugin';
import baseConfig, { designSystemGuardrail } from '../../eslint.config.mjs';

export default [
  nextEslintPluginNext.configs['core-web-vitals'],
  ...nx.configs['flat/react-typescript'],
  ...baseConfig,
  {
    ignores: ['.next/**/*'],
  },
  designSystemGuardrail(['**/*.ts', '**/*.tsx']),
];
