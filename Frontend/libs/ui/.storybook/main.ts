import type { StorybookConfig } from '@storybook/react-vite';

const config = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
} satisfies StorybookConfig;

export default config;
