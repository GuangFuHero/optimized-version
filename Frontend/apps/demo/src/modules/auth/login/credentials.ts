'use client';

import { getUserSaltAsync } from '../api/client';

function toHexString(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function hashPasswordWithFrontendSalt(
  password: string,
  saltFrontend: string,
) {
  const subtleCrypto = globalThis.crypto?.subtle;

  if (!subtleCrypto) {
    throw new Error('瀏覽器不支援密碼加密流程');
  }

  const encoder = new TextEncoder();
  const passwordKey = await subtleCrypto.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await subtleCrypto.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 100000,
      salt: encoder.encode(saltFrontend),
    },
    passwordKey,
    256,
  );

  return toHexString(new Uint8Array(derivedBits));
}

export function createFrontendSalt() {
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16));

  if (!bytes) {
    throw new Error('瀏覽器不支援密碼加密流程');
  }

  return toHexString(bytes);
}

export async function createHashedCredentialAsync(password: string) {
  const saltFrontend = createFrontendSalt();
  const hashedPassword = await hashPasswordWithFrontendSalt(
    password,
    saltFrontend,
  );

  return {
    saltFrontend,
    hashedPassword,
  };
}

export async function resolveHashedCredentialAsync(
  identity: string,
  password: string,
) {
  const saltFrontend = await getUserSaltAsync(identity);
  const hashedPassword = await hashPasswordWithFrontendSalt(
    password,
    saltFrontend,
  );

  return {
    saltFrontend,
    hashedPassword,
  };
}
