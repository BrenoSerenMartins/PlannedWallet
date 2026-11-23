import { parentPort, workerData } from 'node:worker_threads';
import { crc32 } from 'node:zlib';
import officeCrypto from 'officecrypto-tool';
import { Open } from 'unzipper-esm';
import { readTabularFile } from '../files/read-tabular-file.mjs';

const limit = 10 * 1024 * 1024;
const { format, passwords } = workerData;
let buffer = Buffer.from(workerData.buffer);
let protectedFile = false;

async function unzip() {
  const { files } = await Open.buffer(buffer);
  if (files.length !== 1) throw new Error('Expected one file.');
  const [entry] = files;
  const suffix = entry.path.match(/^[^/\\]+\.(csv|ofx)$/i)?.[1]?.toLowerCase();
  if (!suffix || !entry.uncompressedSize || entry.uncompressedSize > limit)
    throw new Error('Unexpected archive entry.');
  protectedFile = Boolean(entry.flags & 1);
  for (const password of protectedFile ? passwords : [undefined]) {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of entry.stream(password)) {
        size += chunk.length;
        if (size > entry.uncompressedSize || size > limit)
          throw new Error('Archive exceeds limits.');
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);
      if (content.length === entry.uncompressedSize && crc32(content) === entry.crc32) {
        protectedFile = false;
        return { buffer: content, format: suffix };
      }
    } catch {
      if (!protectedFile) throw new Error('Invalid archive.');
    }
  }
  throw new Error('Invalid password or archive.');
}

try {
  let innerFormat = format;
  if (format === 'zip') ({ buffer, format: innerFormat } = await unzip());
  if (innerFormat === 'xlsx' && buffer.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') {
    protectedFile = true;
    for (const password of passwords) {
      try {
        buffer = await officeCrypto.decrypt(buffer, { password });
        protectedFile = false;
        break;
      } catch {
        // The user can supply another password if none of these opens the workbook.
      }
    }
    if (protectedFile) throw new Error('Invalid password.');
  }
  if (buffer.length > limit) throw new Error('File exceeds limits.');
  if (innerFormat === 'ofx') {
    const text = new TextDecoder('windows-1252').decode(buffer);
    parentPort.postMessage({ format: innerFormat, text });
  } else {
    parentPort.postMessage({
      format: innerFormat,
      rows: await readTabularFile(buffer, innerFormat),
    });
  }
} catch {
  parentPort.postMessage({
    error: protectedFile
      ? 'Arquivo protegido. Informe a senha. Para extratos C6, use os 6 primeiros dígitos do CPF.'
      : 'Não foi possível ler o arquivo CSV, XLSX ou ZIP do C6.',
  });
}
