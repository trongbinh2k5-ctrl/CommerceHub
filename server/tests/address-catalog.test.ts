import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeliveryAddress,addressCatalog} from '../src/modules/addresses/address-catalog';
test('address catalogue covers provinces and rejects wrong or incomplete recipient addresses',()=>{
 assert.equal(addressCatalog.length,34);
 assert.deepEqual(validateDeliveryAddress({province:'TP Hồ Chí Minh',ward:'Bến Thành',detail:'123 Đường QA'}),{province:'Hồ Chí Minh',ward:'Phường Bến Thành'});
 for(const a of [{province:'hn',ward:'kq',detail:'so185'},{province:'Hà Nội',ward:'Phường Sài Gòn',detail:'123 Đường QA'},{province:'Hồ Chí Minh',ward:'Phường Sài Gòn',detail:'tes'}])assert.throws(()=>validateDeliveryAddress(a));
});
