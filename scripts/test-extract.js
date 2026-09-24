const fs = require('fs');

async function run() {
  // Minimal one-page PDF with 'Hello World' text (not lofty, but extractable)
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

  const path = require('path').join(__dirname, '..', 'tmp-sample.pdf');
  fs.writeFileSync(path, pdfText, 'binary');
  console.log('Wrote sample PDF to', path);

  // Import pdfjs-dist legacy
  const mod = require('pdfjs-dist/legacy/build/pdf');
  const pdfjslib = (mod && mod.default) ? mod.default : mod;

  (async () => {
    try {
      if (pdfjslib.GlobalWorkerOptions) {
        pdfjslib.GlobalWorkerOptions.workerSrc = '';
      }
    } catch (_) {}

    const data = fs.readFileSync(path);
    const loadingTask = pdfjslib.getDocument({ data, disableWorker: true });
    const pdf = await loadingTask.promise;
    const content = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const txt = await page.getTextContent();
      const pageText = txt.items.map((it) => it.str || '').join(' ');
      content.push(pageText.trim());
    }
    const outPath = require('path').join(__dirname, 'extract-result.json');
    const result = { text: content.join('\n\n'), pages: pdf.numPages || 0 };
    require('fs').writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log('Wrote extraction result to', outPath);
  } catch (err) {
    console.error('Extraction error:', err);
    process.exitCode = 2;
  }
}

run();
