import type { INestApplication } from "@nestjs/common";

// Hosts like Render terminate TLS at a reverse proxy and forward plain http to
// the app. Trusting exactly one proxy hop makes Express read X-Forwarded-Proto,
// so request.protocol reports the public scheme (https) used to build the
// Google OAuth redirect_uri. Without a proxy (localhost) no such header is
// sent and the real connection scheme is used, so local runs are unchanged.
export function trustReverseProxy(app: INestApplication): void {
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
