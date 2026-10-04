/* Signs Contract Match briefs so a shared link can prove it came from this site unedited.
   The key is derived from the server's API key, so no extra secret has to be configured;
   rotating that key simply makes older links show as unverified. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => createHash('sha256').update(`brief-v1:${process.env.PORTFOLIO_ANTHROPIC_KEY ?? ''}`).digest();

export function signBrief(brief, at) {
  return createHmac('sha256', secret()).update(`${at}\n${JSON.stringify(brief)}`).digest('base64url');
}

export function verifyBrief(brief, at, sig) {
  if (!process.env.PORTFOLIO_ANTHROPIC_KEY || typeof sig !== 'string' || typeof at !== 'string') return false;
  const a = Buffer.from(signBrief(brief, at)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
