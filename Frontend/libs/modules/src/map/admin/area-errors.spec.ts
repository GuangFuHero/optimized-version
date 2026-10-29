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

  it('tells the refusals about promoting and removing a team in Chinese', () => {
    expect(areaErrorMessage(new Error('Area not found'))).toBe(
      '找不到這個區域，可能已經被刪除',
    );
    expect(
      areaErrorMessage(
        new Error('Only a mark zone can be promoted to a hazardous zone'),
      ),
    ).toBe('只有標示區可以升為危險區');
    expect(
      areaErrorMessage(
        new Error('This team is not assigned to this team zone'),
      ),
    ).toBe('這個團隊沒有被指派到這個責任區');
    expect(
      areaErrorMessage(
        new Error(
          'A team zone needs at least one team; delete the zone instead',
        ),
      ),
    ).toBe('責任區至少要有一個團隊，要移除最後一個請直接刪除這個責任區');
  });

  it('shows an unknown message as the backend gave it, less the GraphQL prefix', () => {
    expect(areaErrorMessage(new Error('[GraphQL] Something else'))).toBe(
      'Something else',
    );
  });
});
