import type { AuthIdentityType } from './identity-validation';

/** The tab and the address the login form held when 註冊帳號 was pressed, as typed. */
export interface HandedOffIdentity {
  identityType: AuthIdentityType;
  identity: string;
}

// Kept in this page's memory, not in storage or the address: the register page is a client-side
// navigation away, so it is still here, and an email or phone is never written down for the next
// person on a shared computer. A reload drops it, and the register page opens empty, as before.
let handedOff: HandedOffIdentity | null = null;

/** Left by the login page for the register page it goes to; a later one replaces it. */
export function handOffIdentity(identity: HandedOffIdentity) {
  handedOff = identity;
}

/**
 * Read by the register page as it renders, and left in place: a render React throws away and
 * starts again reads it again.
 */
export function peekHandedOffIdentity(): HandedOffIdentity | null {
  return handedOff;
}

/** Cleared by the register page once it is up: another visit later opens empty. */
export function clearHandedOffIdentity() {
  handedOff = null;
}
