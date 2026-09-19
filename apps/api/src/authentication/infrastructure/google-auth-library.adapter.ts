import { OAuth2Client } from "google-auth-library";

import {
  GoogleCredentialVerificationError,
  type GoogleCredentialVerifier,
  type VerifiedGoogleIdentity,
} from "./google-credential-verifier.port.js";

interface GoogleIdTokenPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
}

interface GoogleLoginTicket {
  getPayload(): GoogleIdTokenPayload | undefined;
}

export interface GoogleIdTokenClient {
  verifyIdToken(input: {
    audience: string;
    idToken: string;
  }): Promise<GoogleLoginTicket>;
}

export class GoogleAuthLibraryAdapter implements GoogleCredentialVerifier {
  constructor(
    private readonly audience: string,
    private readonly client: GoogleIdTokenClient =
      new OAuth2Client() as unknown as GoogleIdTokenClient,
  ) {}

  async verify(credential: string): Promise<VerifiedGoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        audience: this.audience,
        idToken: credential,
      });
      const payload = ticket.getPayload();
      const email = payload?.email?.trim().toLowerCase();

      if (
        email === undefined ||
        email.length === 0 ||
        payload?.email_verified !== true
      ) {
        throw new GoogleCredentialVerificationError();
      }

      return { email, name: payload.name };
    } catch (error: unknown) {
      if (error instanceof GoogleCredentialVerificationError) {
        throw error;
      }

      throw new GoogleCredentialVerificationError();
    }
  }
}
