const fs = require('fs');
const path = require('path');
const http = require('http');

const filePath = path.join(__dirname, 'sample.pdf');
if (!fs.existsSync(filePath)) {
  console.error('sample.pdf not found:', filePath);
  process.exitCode = 2;
  return;
}

const fileBuffer = fs.readFileSync(filePath);
const boundary = '----NodeBoundary' + Date.now();
const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([header, fileBuffer, footer]);

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/extract-pdf',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
};

const req = http.request(options, (res) => {
  console.log('STATUS:' + res.statusCode);
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(body);
req.end();
