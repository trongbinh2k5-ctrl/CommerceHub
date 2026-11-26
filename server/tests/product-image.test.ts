import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidProductImage } from '../src/modules/products/product-image';
test('product images accept HTTPS/local assets and reject unsafe URLs', () => {
  for (const value of ['', '/images/headphones.webp', 'https://images.example.com/a.png']) assert.equal(isValidProductImage(value), true, value);
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,test', '//example.com/image.png', 'http://example.com/image.png', '/images/../private.png', 'https://user:pass@example.com/a.png', {}, 'x'.repeat(2049)]) assert.equal(isValidProductImage(value), false);
});
