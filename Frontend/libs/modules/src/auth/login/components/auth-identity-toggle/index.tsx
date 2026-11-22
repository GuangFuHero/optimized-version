'use client';

import {
  SegmentedControl,
  type SegmentedControlProps,
} from '@rescue-frontend/ui';

import type { AuthIdentityType } from '../../utils/identity-validation';

const OPTIONS: SegmentedControlProps<AuthIdentityType>['options'] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: '手機號碼' },
];

export function AuthIdentityToggle(
  props: Omit<SegmentedControlProps<AuthIdentityType>, 'options'>,
) {
  return <SegmentedControl {...props} options={OPTIONS} />;
}
