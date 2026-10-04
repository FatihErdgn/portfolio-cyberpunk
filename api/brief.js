/* Verifies a shared Contract Match brief: was it generated here, and is it unedited? */
import { verifyBrief } from './_lib/sign.js';
import { readJson } from './_lib/guard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let body;
  try { body = await readJson(req, 40000); } catch { return res.status(413).json({ error: 'too large' }); }
  return res.status(200).json({ valid: verifyBrief(body.brief, body.at, body.sig) });
}
