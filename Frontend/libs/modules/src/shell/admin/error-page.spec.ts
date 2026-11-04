import { describe, expect, it } from 'vitest';

import { forbiddenLead } from './error-page';

const member = { role: 'member', team_uuid: 't-1' };

describe('forbiddenLead', () => {
  it('points a team member nowhere, offering a switch when there is one', () => {
    expect(forbiddenLead(member, true)).toBe(
      '你目前的身份沒有開放這個頁面。可以從右上角的人名切換到其他身份再試一次。也可以從左邊的選單，或從這裡繼續：',
    );
    expect(forbiddenLead(member, false)).toBe(
      '你目前的身份沒有開放這個頁面。可以從左邊的選單，或從這裡繼續：',
    );
  });

  it('reads the same for a super admin', () => {
    expect(forbiddenLead({ role: 'super_admin' }, false)).toBe(
      forbiddenLead(member, false),
    );
  });

  it('sends a team admin or a data auditor to the super admin', () => {
    expect(forbiddenLead({ role: 'admin', team_uuid: 't-1' }, true)).toBe(
      '你目前的身份沒有開放這個頁面。如果工作上需要，請聯絡平台的超級管理員開通；或從右上角的人名切換到其他身份再試一次。也可以從左邊的選單，或從這裡繼續：',
    );
    expect(forbiddenLead({ role: 'data_auditor' }, false)).toBe(
      '你目前的身份沒有開放這個頁面。如果工作上需要，請聯絡平台的超級管理員開通。也可以從左邊的選單，或從這裡繼續：',
    );
  });
});
