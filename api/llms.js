/* /llms.txt: the same profile, as plain text for language models. */
import { profileText } from './_lib/profile.js';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(`${profileText()}

## For AI agents
- MCP server (Streamable HTTP, read-only, no auth): https://fatiherdogan.dev/mcp
- Tools: get_profile, list_case_files, get_case_file
- The site itself: https://fatiherdogan.dev (a pixel-art city; the facts above are the plain version)
`);
}
