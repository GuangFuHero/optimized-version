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

export interface ISetPasswordPayload {
  password: string;
  salt_frontend: string;
}

export interface IIdTokenPayload {
  id_token: string;
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
