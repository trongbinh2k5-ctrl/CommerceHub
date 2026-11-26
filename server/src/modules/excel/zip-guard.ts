import { inflateRawSync } from 'node:zlib';

const MAX_ARCHIVE = 5 * 1024 * 1024;
const MAX_EXPANDED = 30 * 1024 * 1024;
const invalid = (): never => { throw new Error('Cấu trúc file Excel không hợp lệ hoặc vượt giới hạn giải nén.'); };

/** Validate the complete ZIP layout and bounded actual inflation before ExcelJS/JSZip sees it. */
export function validateXlsxArchive(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_ARCHIVE) return invalid();
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65557); at--) {
    if (buffer.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0 || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) return invalid();
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16), directorySize = buffer.readUInt32LE(end + 12);
  if (!count || count > 200 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0 || buffer.readUInt16LE(end + 8) !== count || offset + directorySize !== end) return invalid();
  let at = offset, declared = 0;
  const names = new Set<string>();
  const entries: { start: number; dataStart: number; end: number; expanded: number; method: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || buffer.readUInt32LE(at) !== 0x02014b50) return invalid();
    const flags = buffer.readUInt16LE(at + 8), method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20), expanded = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28), next = at + 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    if ((flags & 1) || ![0, 8].includes(method) || buffer.readUInt16LE(at + 34) !== 0 || !nameLength || next > end || local + 30 > offset) return invalid();
    const name = buffer.subarray(at + 46, at + 46 + nameLength);
    const nameKey = name.toString('hex');
    if (names.has(nameKey)) return invalid();
    names.add(nameKey);
    declared += expanded;
    if (declared > MAX_EXPANDED || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 8) !== method || buffer.readUInt16LE(local + 6) !== flags) return invalid();
    const localNameLength = buffer.readUInt16LE(local + 26), dataStart = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    if (localNameLength !== nameLength || dataStart + compressed > offset || !buffer.subarray(local + 30, local + 30 + localNameLength).equals(name)) return invalid();
    // Streaming ZIP entries may put sizes in a descriptor; central sizes are still checked by actual inflation below.
    if (!(flags & 8) && (buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== expanded)) return invalid();
    entries.push({ start: local, dataStart, end: dataStart + compressed, expanded, method });
    at = next;
  }
  if (at !== end) return invalid();
  // Reject overlap before spending CPU on inflation, including repeated/nested compressed streams.
  entries.sort((a, b) => a.start - b.start);
  for (let i = 1; i < entries.length; i++) if (entries[i].start < entries[i - 1].end) return invalid();
  for (const entry of entries) {
    const data = buffer.subarray(entry.dataStart, entry.end);
    if (entry.method === 0) { if (data.length !== entry.expanded) return invalid(); continue; }
    try {
      const actual = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.expanded) });
      if (actual.length !== entry.expanded) return invalid();
    } catch { return invalid(); }
  }
}
