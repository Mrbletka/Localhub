const http = require('http');

const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>Localhub</title><h1>Localhub</h1><p>Coming soon</p>');
}).listen(port, () => console.log(`Localhub running at http://localhost:${port}`));
