const encoder = new TextEncoder();
const ZIP_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_DATA_DESCRIPTOR = 0x08074b50;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
const ZIP_STORE_METHOD = 0;
const UINT32_LIMIT = 0xffffffff;

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[i] = value >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function createBytes(length, writer) {
  const bytes = new Uint8Array(length);
  writer(new DataView(bytes.buffer), bytes);
  return bytes;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function updateCrc(crc, bytes) {
  let nextCrc = crc;
  for (let index = 0; index < bytes.length; index += 1) {
    nextCrc = crcTable[(nextCrc ^ bytes[index]) & 0xff] ^ (nextCrc >>> 8);
  }
  return nextCrc >>> 0;
}

function getChunkBytes(chunk) {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  return encoder.encode(String(chunk ?? ''));
}

function createLocalHeader(nameBytes, timestamp) {
  return createBytes(30 + nameBytes.length, (view, bytes) => {
    writeUint32(view, 0, ZIP_LOCAL_FILE_HEADER);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, ZIP_FLAG_UTF8 | ZIP_FLAG_DATA_DESCRIPTOR);
    writeUint16(view, 8, ZIP_STORE_METHOD);
    writeUint16(view, 10, timestamp.dosTime);
    writeUint16(view, 12, timestamp.dosDate);
    writeUint16(view, 26, nameBytes.length);
    bytes.set(nameBytes, 30);
  });
}

function createDataDescriptor(crc, size) {
  return createBytes(16, view => {
    writeUint32(view, 0, ZIP_DATA_DESCRIPTOR);
    writeUint32(view, 4, crc);
    writeUint32(view, 8, size);
    writeUint32(view, 12, size);
  });
}

function createCentralDirectoryHeader(entry) {
  return createBytes(46 + entry.nameBytes.length, (view, bytes) => {
    writeUint32(view, 0, ZIP_CENTRAL_FILE_HEADER);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, ZIP_FLAG_UTF8 | ZIP_FLAG_DATA_DESCRIPTOR);
    writeUint16(view, 10, ZIP_STORE_METHOD);
    writeUint16(view, 12, entry.timestamp.dosTime);
    writeUint16(view, 14, entry.timestamp.dosDate);
    writeUint32(view, 16, entry.crc);
    writeUint32(view, 20, entry.size);
    writeUint32(view, 24, entry.size);
    writeUint16(view, 28, entry.nameBytes.length);
    writeUint32(view, 42, entry.offset);
    bytes.set(entry.nameBytes, 46);
  });
}

function createEndOfCentralDirectory(entryCount, directorySize, directoryOffset) {
  return createBytes(22, view => {
    writeUint32(view, 0, ZIP_END_OF_CENTRAL_DIRECTORY);
    writeUint16(view, 8, entryCount);
    writeUint16(view, 10, entryCount);
    writeUint32(view, 12, directorySize);
    writeUint32(view, 16, directoryOffset);
  });
}

function assertZipSize(value, label) {
  if (value > UINT32_LIMIT) {
    throw new Error(`${label} exceeds the browser XLSX writer size limit`);
  }
}

async function createZipBlob(entries, options = {}) {
  const parts = [];
  const centralDirectory = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const timestamp = getDosDateTime(entry.modifiedAt);
    const entryOffset = offset;
    const localHeader = createLocalHeader(nameBytes, timestamp);
    parts.push(localHeader);
    offset += localHeader.length;

    let crc = 0xffffffff;
    let size = 0;
    const chunks = typeof entry.chunks === 'function' ? entry.chunks() : entry.chunks;
    for await (const chunk of chunks) {
      const bytes = getChunkBytes(chunk);
      if (!bytes.length) {
        continue;
      }
      crc = updateCrc(crc, bytes);
      size += bytes.length;
      offset += bytes.length;
      assertZipSize(size, entry.path);
      parts.push(bytes);
    }

    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = createDataDescriptor(crc, size);
    parts.push(descriptor);
    offset += descriptor.length;
    assertZipSize(offset, 'Workbook');
    centralDirectory.push({ crc, nameBytes, offset: entryOffset, size, timestamp });
    await options.yieldToBrowser?.();
  }

  const directoryOffset = offset;
  centralDirectory.forEach(entry => {
    const header = createCentralDirectoryHeader(entry);
    parts.push(header);
    offset += header.length;
  });

  const directorySize = offset - directoryOffset;
  assertZipSize(directorySize, 'Workbook directory');
  assertZipSize(directoryOffset, 'Workbook offset');
  parts.push(createEndOfCentralDirectory(centralDirectory.length, directorySize, directoryOffset));

  return new Blob(parts, { type: options.mimeType || ZIP_MIME_TYPE });
}

export { ZIP_MIME_TYPE, createZipBlob };
