'use strict';
// Processo descartável: sem tokens/credenciais no ambiente e sem saída de conteúdo.
// Não exporta imagens, texto, nomes ou erros brutos ao processo principal.
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);

let parserWarning = false;
console.log = console.warn = console.error = () => { parserWarning = true; };
const reject = code => { throw Object.assign(new Error(code), { safeCode: code }); };

async function validate({ bytes, format, config }) {
  const data = Buffer.from(bytes);
  try {
    const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isPng = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isPdf = /^%PDF-1\.[0-7][\r\n]/.test(data.subarray(0, 10).toString('ascii')) || /^%PDF-2\.0[\r\n]/.test(data.subarray(0, 10).toString('ascii'));
    const detected = isJpeg ? 'jpeg' : isPng ? 'png' : isPdf ? 'pdf' : undefined;
    if (detected !== format) reject('SIGNATURE_MISMATCH');
    if (format !== 'pdf') {
      if (format === 'jpeg' && (data.at(-2) !== 0xff || data.at(-1) !== 0xd9)) reject('INVALID_IMAGE');
      if (format === 'png' && !data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) reject('INVALID_IMAGE');
      const options = { failOn: 'warning', limitInputPixels: config.maxPixels, sequentialRead: true };
      const metadata = await sharp(data, options).metadata();
      if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > config.maxWidth ||
        metadata.height > config.maxHeight || metadata.width * metadata.height > config.maxPixels || (metadata.pages ?? 1) !== 1) reject('IMAGE_OUTSIDE_POLICY');
      // stats força decodificação dos pixels sem produzir uma cópia raw de saída.
      await sharp(data, options).timeout({ seconds: Math.max(1, Math.floor(config.validationTimeoutMs / 1000)) }).stats();
      if (parserWarning) reject('INVALID_IMAGE');
    } else {
      if (!/%%EOF\s*$/.test(data.subarray(-64).toString('ascii'))) reject('INVALID_PDF');
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = getDocument({
        data: new Uint8Array(data), verbosity: 1, stopAtErrors: true,
        isEvalSupported: false, useSystemFonts: false, disableFontFace: true,
        useWorkerFetch: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false
      });
      try {
        const doc = await task.promise;
        if (await doc.getPermissions() !== null) reject('PROTECTED_PDF');
        if (doc.numPages < 1 || doc.numPages > config.maxPdfPages) reject('PDF_PAGE_LIMIT');
        for (let index = 1; index <= doc.numPages; index++) {
          const page = await doc.getPage(index);
          if (page.view.some(value => !Number.isFinite(value)) || page.view[2] <= page.view[0] || page.view[3] <= page.view[1]) reject('INVALID_PDF');
          page.cleanup();
        }
        // PDF.js pode reparar estruturas. Qualquer aviso torna o resultado inconclusivo.
        if (parserWarning) reject('INVALID_PDF');
      } catch (error) {
        if (error.name === 'PasswordException') reject('PROTECTED_PDF');
        throw error;
      } finally { await task.destroy(); }
    }
  } finally { data.fill(0); bytes.fill(0); }
}

process.once('message', async message => {
  try {
    await validate(message);
    process.send({ ok: true }, () => process.exit(0));
  } catch (error) {
    const allowed = new Set(['SIGNATURE_MISMATCH', 'INVALID_IMAGE', 'IMAGE_OUTSIDE_POLICY', 'INVALID_PDF', 'PROTECTED_PDF', 'PDF_PAGE_LIMIT']);
    process.send({ ok: false, code: allowed.has(error.safeCode) ? error.safeCode : 'INVALID_DOCUMENT' }, () => process.exit(0));
  }
});
