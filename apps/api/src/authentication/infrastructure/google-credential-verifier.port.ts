export const AUTHENTICATION_DENIAL_MESSAGE = "Authentication was not accepted.";

export const GOOGLE_CREDENTIAL_VERIFIER = "GOOGLE_CREDENTIAL_VERIFIER";
export const DATASOURCE = Symbol("DATASOURCE");

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
