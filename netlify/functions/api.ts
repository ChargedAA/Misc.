// Leaderboard and accounts API on Netlify Functions, stored in Netlify Blobs. The routes and
// rules are in src/api-core.ts; this file adds Google's signature check and the store.

import { getStore } from '@netlify/blobs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handle, type Store, type Verify } from '../../src/api-core.ts';
import { GOOGLE_CLIENT_ID } from '../../src/google.ts';

export { handle, type Store, type Verify };

/** Google's public keys, fetched and cached by jose. */
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Check a Google ID token: Google's signature, issued for this site's client ID, not expired. */
export const verifyGoogle: Verify = async (credential) => {
  if (!GOOGLE_CLIENT_ID) return null;
  try {
    const { payload } = await jwtVerify(credential, googleKeys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: GOOGLE_CLIENT_ID });
    return typeof payload.sub === 'string' ? { sub: payload.sub, given: typeof payload.given_name === 'string' ? payload.given_name : undefined } : null;
  } catch {
    return null;
  }
};

/** Deploy previews and branch deploys get their own store, so testing never touches real scores. */
export default async (req: Request, context?: { deploy?: { context?: string } }): Promise<Response> => {
  const where = context?.deploy?.context;
  const name = !where || where === 'production' ? 'leaderboard' : 'leaderboard-test';
  return handle(req, { store: getStore({ name, consistency: 'strong' }) as unknown as Store, verify: verifyGoogle });
};

export const config = { path: ['/api/auth', '/api/me', '/api/name', '/api/scores', '/api/boards', '/api/player'] };
