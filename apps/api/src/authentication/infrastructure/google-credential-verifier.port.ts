export const AUTHENTICATION_DENIAL_MESSAGE = "Authentication was not accepted.";

export interface VerifiedGoogleIdentity {
  email: string;
  name: string | undefined;
}

export interface GoogleCredentialVerifier {
  verify(credential: string): Promise<VerifiedGoogleIdentity>;
}

export class GoogleCredentialVerificationError extends Error {
  constructor() {
    super(AUTHENTICATION_DENIAL_MESSAGE);
    this.name = "GoogleCredentialVerificationError";
  }
}
