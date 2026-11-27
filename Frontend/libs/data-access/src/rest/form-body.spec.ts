// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import { formBody } from './form-body';

describe('formBody', () => {
  it('reads back as the same fields, whatever characters they hold', () => {
    const fields = {
      username: 'a+b@example.com',
      password: 'p&s=w%rd 密碼+/?#',
      grant_type: 'password',
    };

    const read = new URLSearchParams(formBody(fields));

    expect(Object.fromEntries(read)).toEqual(fields);
  });

  it('keeps the fields in the order given', () => {
    expect(formBody({ b: '2', a: '1' })).toBe('b=2&a=1');
  });
});
