const json = (data: unknown) => Response.json(data);

Deno.serve({ port: 4400 }, (req) => {
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname === '/register') {
    return json({ ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/users') {
    return json([]);
  }
  if (req.method === 'POST' && url.pathname === '/call') {
    return json({ ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/incoming') {
    return json(null);
  }
  if (req.method === 'POST' && url.pathname === '/cancel') {
    return json({ ok: true });
  }

  return new Response('Not found', { status: 404 });
});
