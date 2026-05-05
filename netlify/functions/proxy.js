const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname !== '/api/police') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const { lat, lon } = parsedUrl.query;

  if (!lat || !lon) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing lat/lon' }));
  }

  const policeUrl = `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`;

  https.get(policeUrl, (apiRes) => {
    let data = '';

    apiRes.on('data', chunk => {
      data += chunk;
    });

    apiRes.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });

      res.end(data);
    });
  }).on('error', () => {
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });

    res.end(JSON.stringify({ error: 'Police API request failed' }));
  });
});

server.listen(PORT, () => {
  console.log(`Police proxy running at http://localhost:${PORT}`);
});