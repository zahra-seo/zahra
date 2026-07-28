import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Google service-account auth — pure node:crypto, no googleapis dependency.
 * Signs an RS256 JWT and exchanges it for an OAuth2 access token, cached
 * until shortly before expiry.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline) as ServiceAccount;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
  return null;
}

export class GoogleAuth {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly scopes: string[],
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: this.scopes.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(this.account.private_key).toString('base64url');
    const assertion = `${header}.${claims}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}
