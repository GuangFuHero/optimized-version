export type AuthIdentityType = 'email' | 'phone';

export interface ITokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
}

export interface IUserSaltResponse {
  salt_frontend: string;
}

export interface IAuthIdentifierPayload {
  type?: AuthIdentityType;
  value: string;
}

export interface IRegisterPayload extends IAuthIdentifierPayload {
  name: string;
  password: string;
  salt_frontend: string;
}

export interface IVerifyPayload extends IAuthIdentifierPayload {
  code: string;
}

export interface IRefreshPayload {
  refresh_token: string;
}

export interface IPasswordResetPayload extends IAuthIdentifierPayload {
  code: string;
  new_password: string;
  salt_frontend: string;
}

export interface IChangePasswordPayload {
  old_password: string;
  new_password: string;
  salt_frontend: string;
}

/**
 * Extra proof the backend demands before an account gains a new way in.
 *
 * Which field is required is decided by the backend, never here: an account holding a
 * password sends `password`, an SSO-only one sends `old_channel_code` — the code the backend
 * delivers to a contact the account already holds. The first call is expected to arrive
 * WITHOUT this, and answers 422; that call is what sends the code.
 */
export interface IStepUp {
  password?: string;
  old_channel_code?: string;
}

export interface ISetPasswordPayload {
  password: string;
  salt_frontend: string;
  step_up?: IStepUp;
}

export interface IIdTokenPayload {
  id_token: string;
}

/** `POST /auth/link/{provider}` — the id_token proves the provider account, `step_up` the local one. */
export interface ILinkIdTokenPayload extends IIdTokenPayload {
  step_up?: IStepUp;
}

/** `POST /auth/contacts` — adding, not only replacing, is gated once the account has anything to prove with. */
export interface IAddContactPayload extends IAuthIdentifierPayload {
  step_up?: IStepUp;
}

export interface IUser {
  uuid: string;
  name: string;
  created_at: string;
  credibility_score: number;
}

export interface IUserUpdatePayload {
  name?: string | null;
}
