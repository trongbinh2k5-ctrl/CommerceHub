import { describe, it, expect } from 'vitest';
import { clipboardRows } from './ExcelSheet';

describe('Excel clipboard parsing', () => {
  it('keeps phone leading zeros and empty cells across CRLF rows', () => {
    expect(clipboardRows('An\tan@test.local\t0901234567\r\nBình\tbinh@test.local\t\r\n')).toEqual([['An', 'an@test.local', '0901234567'], ['Bình', 'binh@test.local', '']]);
  });
  it('keeps quoted multiline and tab content in a single cell', () => {
    expect(clipboardRows('SKU-1\t"RAM: 16 GB\nSSD: 512 GB"\t"có\ttab"\n')).toEqual([['SKU-1', 'RAM: 16 GB\nSSD: 512 GB', 'có\ttab']]);
  });
  it('unescapes Excel double quotes and preserves the final row', () => {
    expect(clipboardRows('"Tên ""đặc biệt"""\t123')).toEqual([['Tên "đặc biệt"', '123']]);
  });
  it('does not invent a row for empty clipboard content', () => {
    expect(clipboardRows('')).toEqual([]);
  });
});
