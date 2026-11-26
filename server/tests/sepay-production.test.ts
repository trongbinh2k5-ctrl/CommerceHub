import test from 'node:test';
import assert from 'node:assert/strict';
import { sepayConfig, sepayForm } from '../src/modules/payments/sepay.config';

test('Production uses live checkout and rejects private or sandbox configuration', () => {
  const names = ['SEPAY_ENV','SEPAY_ENABLED','SEPAY_MERCHANT_ID','SEPAY_SECRET_KEY','SEPAY_IPN_SECRET','SEPAY_RETURN_URL'];
  const previous = names.map(name => process.env[name]);
  try {
    Object.assign(process.env,{SEPAY_ENV:'production',SEPAY_ENABLED:'true',SEPAY_MERCHANT_ID:'TEST_ONLY',SEPAY_SECRET_KEY:'spsk_live_fake_unit_test_only',SEPAY_IPN_SECRET:'test-only-secret-at-least-32-characters',SEPAY_RETURN_URL:'https://store.example/payments/sepay/return'});
    const config = sepayConfig();
    assert.ok(config);
    assert.equal(config.environment,'production');
    const form = sepayForm(config,'a'.repeat(32),2000);
    assert.equal(form.action,'https://pay.sepay.vn/v1/checkout/init');
    assert.equal(form.fields.payment_method,'BANK_TRANSFER');
    assert.match(form.fields.success_url,/^https:\/\/store\.example\//);
    process.env.SEPAY_RETURN_URL='http://localhost:5173/payments/sepay/return';
    assert.equal(sepayConfig(),null);
    process.env.SEPAY_RETURN_URL='https://store.example/payments/sepay/return';
    process.env.SEPAY_SECRET_KEY='spsk_test_fake';
    assert.equal(sepayConfig(),null);
    process.env.SEPAY_ENV='invalid';
    assert.equal(sepayConfig(),null);
  } finally { names.forEach((name,index) => { if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index]; }); }
});
