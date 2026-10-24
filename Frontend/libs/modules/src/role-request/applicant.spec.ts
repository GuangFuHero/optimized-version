import { describe, expect, it } from 'vitest';

import type { components } from '@rescue-frontend/data-access/openapi';

import {
  applicantNameProblem,
  displayPhone,
  mobileProblem,
  normalizeMobile,
  readApplicantAccount,
  toE164Mobile,
} from './applicant';

type CurrentUser = components['schemas']['UserResponse'];

const user = (overrides: Partial<CurrentUser>): CurrentUser => ({
  name: '小明',
  credibility_score: 0,
  uuid: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
  capabilities: [],
  ...overrides,
});

const contact = (type: string, value: string, verified = true) => ({
  type,
  value,
  verified,
  created_at: '2026-10-01T00:00:00Z',
});

describe('readApplicantAccount', () => {
  it('reads a password account with an email and a verified phone', () => {
    expect(
      readApplicantAccount(
        user({
          contacts: [
            contact('email', 'ming@example.tw'),
            contact('phone', '+886912345678'),
          ],
          login_methods: [{ provider: 'password' }],
        }),
      ),
    ).toEqual({
      nickname: '小明',
      verifiedPhone: '+886912345678',
      hasPassword: true,
      saltIdentifier: 'ming@example.tw',
    });
  });

  it('reads a LINE-only account as having nothing to prove with', () => {
    expect(
      readApplicantAccount(
        user({ name: 'LINE-1a2b3c4d', login_methods: [{ provider: 'line' }] }),
      ),
    ).toEqual({
      nickname: 'LINE-1a2b3c4d',
      verifiedPhone: null,
      hasPassword: false,
      saltIdentifier: null,
    });
  });

  it('does not take a phone that is not verified', () => {
    expect(
      readApplicantAccount(
        user({ contacts: [contact('phone', '+886912345678', false)] }),
      ).verifiedPhone,
    ).toBeNull();
  });
});

describe('applicantNameProblem', () => {
  it('needs a name, and no more than the backend keeps', () => {
    expect(applicantNameProblem('王志豪')).toBeNull();
    expect(applicantNameProblem('   ')).toBe('必填');
    expect(applicantNameProblem('王'.repeat(100))).toBeNull();
    expect(applicantNameProblem('王'.repeat(101))).toBe('名字最多 100 字');
  });
});

describe('mobile numbers', () => {
  it('reads a mobile however it is spaced, and +886 as the leading 0', () => {
    expect(normalizeMobile('0912-345 678')).toBe('0912345678');
    expect(normalizeMobile('+886 912 345 678')).toBe('0912345678');
    expect(mobileProblem('+886912345678')).toBeNull();
  });

  it('takes only a mobile', () => {
    expect(mobileProblem('')).toBe('必填');
    expect(mobileProblem('03-8701234')).toBe(
      '手機號碼格式不正確（09 開頭十碼）',
    );
    expect(mobileProblem('091234567')).toBe(
      '手機號碼格式不正確（09 開頭十碼）',
    );
  });

  it('sends one spelling and shows it back as people write it', () => {
    expect(toE164Mobile('0912-345-678')).toBe('+886912345678');
    expect(toE164Mobile('+886912345678')).toBe('+886912345678');
    expect(displayPhone('+886912345678')).toBe('0912345678');
    expect(displayPhone('+819012345678')).toBe('+819012345678');
  });
});
