import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'./payment-e2e',testMatch:'sepay.spec.ts',webServer:[
  {command:'npm run dev:demo --prefix ../server',url:'http://127.0.0.1:5001/health',timeout:120000,reuseExistingServer:false,env:{SEPAY_ENV:'sandbox',SEPAY_ENABLED:'true',SEPAY_MERCHANT_ID:'TESTMERCHANT',SEPAY_SECRET_KEY:'spsk_test_browser_fake_secret',SEPAY_IPN_SECRET:'isolated-browser-ipn-secret-32-bytes',SEPAY_RETURN_URL:'https://berylcore-demo.example/payments/sepay/return',EMAIL_VERIFICATION_REQUIRED:'false'}},
  {command:'npm run preview',url:'http://127.0.0.1:4173',timeout:60000,env:{API_TARGET:'http://127.0.0.1:5001'},reuseExistingServer:false},
]});
