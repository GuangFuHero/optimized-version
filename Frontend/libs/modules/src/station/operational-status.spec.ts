import { describe, expect, it } from 'vitest';

import {
  getOperationalStatusMeta,
  OPERATIONAL_STATUS_OPTIONS,
} from './operational-status';

describe('getOperationalStatusMeta', () => {
  it('labels every backend value', () => {
    expect(OPERATIONAL_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'active',
      'temporarily_closed',
      'permanently_closed',
    ]);
    expect(getOperationalStatusMeta('active')).toMatchObject({
      label: '開設中',
      tone: 'success',
    });
  });

  it('falls back to the raw value for an unknown status', () => {
    expect(getOperationalStatusMeta('weird')).toEqual({
      value: 'weird',
      label: 'weird',
      tone: 'neutral',
    });
    expect(getOperationalStatusMeta(null)).toEqual({
      value: '',
      label: '—',
      tone: 'neutral',
    });
  });
});
