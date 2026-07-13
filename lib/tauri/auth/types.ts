export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresIn: number;
  /** Unix ms when the access token expires. */
  expiresAt: number;
}

export interface AuthUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
}

export interface SignInOptions {
  loginHint?: string;
  idpHint?: string;
}
