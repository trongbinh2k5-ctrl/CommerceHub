import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { readImport } from '../src/modules/excel/workbook';

function archiveWithLyingSizes() {
  const name = Buffer.from('xl/worksheets/sheet1.xml');
  // Small local fixture only: 128 KB output, while ZIP metadata falsely declares 0.
  const compressed = deflateRawSync(Buffer.alloc(128 * 1024, 65));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt16LE(name.length, 28);
  const directory = Buffer.concat([central, name]), data = Buffer.concat([local, name, compressed]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(data.length, 16);
  return Buffer.concat([data, directory, end]);
}
test('XLSX forged uncompressed size is rejected before the workbook parser runs', async t => {
  const probe = new ExcelJS.Workbook();
  let parserCalled = false;
  const mock = t.mock.method(Object.getPrototypeOf(probe.xlsx), 'load', async () => { parserCalled = true; throw new Error('Parser should not run'); });
  try {
    await assert.rejects(() => readImport(archiveWithLyingSizes(), 'products', 'create'));
    assert.equal(parserCalled, false, 'ZIP metadata must not be trusted to bound decompression');
  } finally { mock.mock.restore(); }
});
