import { describe, expect, it } from 'vitest';

import { areaErrorMessage } from './area-errors';

describe('areaErrorMessage', () => {
  it('tells a known refusal in Chinese, whatever wraps it', () => {
    expect(
      areaErrorMessage(
        new Error(
          '[GraphQL] A team zone needs a team, and only a team zone takes one',
        ),
      ),
    ).toBe('責任區至少要有一個團隊');
    expect(areaErrorMessage(new Error('A hazardous zone needs a status'))).toBe(
      '危險區需要狀態',
    );
  });

  it('shows an unknown message as the backend gave it, less the GraphQL prefix', () => {
    expect(areaErrorMessage(new Error('[GraphQL] Something else'))).toBe(
      'Something else',
    );
  });
});
