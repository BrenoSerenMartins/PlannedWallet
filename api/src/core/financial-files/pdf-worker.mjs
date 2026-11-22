import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
let protectedPdf = false;
let task;
try {
  // Open readable/owner-protected PDFs normally before requesting user credentials.
  const passwords = [...new Set(['', ...(workerData.passwords ?? [workerData.password ?? ''])])];
  let pdf;
  for (const password of passwords) {
    task = getDocument({
      data: new Uint8Array(ArrayBuffer.isView(workerData) ? workerData : workerData.buffer),
      password,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    try {
      pdf = await task.promise;
      protectedPdf = false;
      break;
    } catch (error) {
      await task.destroy().catch(() => {});
      if (error?.name !== 'PasswordException') throw error;
      protectedPdf = true;
    }
  }
  if (!pdf) throw new Error('PDF password required');
  if (pdf.numPages > 100) throw new Error('O PDF deve ter no máximo 100 páginas.');
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((i) => 'str' in i && i.str.trim())
        .map((i) => ({
          text: i.str,
          x: Math.round(i.transform[4]),
          y: Math.round(i.transform[5]),
        })),
    );
  }
  await task.destroy();
  parentPort.postMessage({ pages });
} catch {
  await task?.destroy().catch(() => {});
  parentPort.postMessage({
    error: protectedPdf
      ? 'PDF protegido. Informe o CPF do titular ou a senha específica para abrir o arquivo.'
      : 'Não foi possível ler este PDF. Verifique se está corrompido ou digitalizado.',
  });
}
