import type { StorybookConfig } from '@storybook/react-vite';

const config = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  features: {
    sidebarOnboardingChecklist: false,
    menuOnboardingChecklist: false,
  },
} satisfies StorybookConfig;

export default config;
