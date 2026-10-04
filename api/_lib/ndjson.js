/* Newline-delimited JSON streaming for the agent endpoints. Each event is one line, so the
   page can show text and tool calls the moment they happen. Where the platform buffers the
   response instead, the page still gets every event, just at the end. */
export function ndjson(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  return ev => { res.write(`${JSON.stringify(ev)}\n`); };
}
