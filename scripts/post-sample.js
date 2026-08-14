const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const filePath = path.join(__dirname, 'sample.pdf');
    if (!fs.existsSync(filePath)) {
      console.error('sample.pdf not found at', filePath);
      process.exitCode = 2;
      return;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await fetch('http://localhost:3002/api/extract-pdf', {
      method: 'POST',
      body: form,
    });

    const body = await res.text();
    console.log('STATUS:' + res.status);
    console.log(body);
  } catch (err) {
    console.error('Request failed:', err);
    process.exitCode = 3;
  }
})();
