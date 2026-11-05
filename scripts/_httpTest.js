const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const url = new URL(path, 'http://localhost:5000');
    const options = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : undefined
      }
    };
    const r = http.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', e => resolve({ status: -1, body: e.message }));
    r.setTimeout(5000, () => { r.destroy(); resolve({ status: -1, body: 'TIMEOUT' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // 1. Check if backend is alive
  const r0 = await req('GET', '/api/bookings', null, 'test');
  console.log('GET /api/bookings status:', r0.status, '|', r0.body.substring(0, 120));

  // 2. Try a fake delete
  const r1 = await req('DELETE', '/api/bookings/000000000000000000000000', null, 'test');
  console.log('DELETE status:', r1.status, '|', r1.body.substring(0, 120));
})();
