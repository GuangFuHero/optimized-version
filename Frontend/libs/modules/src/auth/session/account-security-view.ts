/** A contact on the account, as `/users/me` lists it. */
export interface AccountContact {
  type: string;
  value: string;
  verified: boolean;
}

/**
 * The account to look the password's salt up by, before checking the current password. The salt
 * belongs to the account (backend login design §4), so any contact it has verified will do; which
 * one the person typed to sign in is no longer known since the login moved to the backend.
 */
export function saltLookupIdentity(
  contacts: readonly AccountContact[],
): string | null {
  return contacts.find((contact) => contact.verified)?.value ?? null;
}

/** The backend's login providers (`users.py`), in the order the page names them. */
const LOGIN_METHOD_LABELS: ReadonlyArray<[provider: string, label: string]> = [
  ['password', '密碼'],
  ['google', 'Google'],
  ['line', 'LINE'],
];

/**
 * How the account signs in, for 「登入方式：…」: whether it has a password at all tells the
 * person which of 變更密碼 and 建立密碼 is theirs.
 */
export function loginMethodsText(
  methods: readonly { provider: string }[],
): string {
  const providers = new Set(methods.map((method) => method.provider));

  return LOGIN_METHOD_LABELS.filter(([provider]) => providers.has(provider))
    .map(([, label]) => label)
    .join('、');
}
