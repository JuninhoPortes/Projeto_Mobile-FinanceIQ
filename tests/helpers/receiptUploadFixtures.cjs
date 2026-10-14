const sharp = require('../../financeiq-api/node_modules/sharp');

async function image(format = 'png', width = 16, height = 16) {
  return sharp({ create: { width, height, channels: 3, background: '#eeeeee' } }).toFormat(format).toBuffer();
}

// PDF sintético com páginas vazias e tabela xref explícita. Nenhum dado pessoal.
function pdf(pages = 1, encrypted = false) {
  const pageIds = Array.from({ length: pages }, (_, index) => index + 3);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages} >>`,
    ...pageIds.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>')
  ];
  if (encrypted) objects.push(`<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${'00'.repeat(32)}> /U <${'00'.repeat(32)}> >>`);
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encrypted ? ` /Encrypt ${objects.length} 0 R /ID [<${'00'.repeat(16)}> <${'00'.repeat(16)}>]` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

const boundary = 'FinanceIQSyntheticBoundary';
function multipart(files = [], fields = [], extraHeaders = '') {
  const chunks = [];
  for (const file of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'document'}"; filename="${file.name ?? 'synthetic.png'}"\r\nContent-Type: ${file.mime ?? 'image/png'}\r\n${extraHeaders}\r\n`), file.bytes, Buffer.from('\r\n'));
  for (const [name, value] of fields) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { bytes: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports = { image, pdf, multipart };
