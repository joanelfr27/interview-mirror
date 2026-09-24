const fs = require('fs');
const path = require('path');

const pdfText = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1>>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44>>stream
BT /F1 24 Tf 72 120 Td (Hello World) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000110 00000 n 
0000000200 00000 n 
0000000300 00000 n 
trailer<< /Root 1 0 R /Size 6 >>
startxref
400
%%EOF`;

const out = path.join(__dirname, 'sample.pdf');
fs.writeFileSync(out, pdfText, 'binary');
console.log('Wrote sample PDF to', out);
