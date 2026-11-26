import { timingSafeEqual } from 'node:crypto';
import { SePayPgClient } from 'sepay-pg-node';

export const sepayCheckoutUrl='https://pay-sandbox.sepay.vn/v1/checkout/init';
export const sepayApiUrl='https://pgapi-sandbox.sepay.vn/v1';
export function sepayReturnIsPublic(returnUrl:string){
  const host=new URL(returnUrl).hostname.toLowerCase();
  return !(/^localhost$|\.localhost$|\.local$|^127\.|^0\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^\[/.test(host));
}
export function sepayConfig(){
  const environment=process.env.SEPAY_ENV || 'sandbox';
  if(!['sandbox','production'].includes(environment))return null;
  const merchantId=process.env.SEPAY_MERCHANT_ID?.trim();
  const secretKey=process.env.SEPAY_SECRET_KEY?.trim();
  const ipnSecret=process.env.SEPAY_IPN_SECRET?.trim();
  const returnUrl=process.env.SEPAY_RETURN_URL?.trim();
  if(process.env.SEPAY_ENABLED!=='true'||!merchantId||!secretKey||!ipnSecret||!returnUrl)return null;
  if(merchantId.includes(':')||Buffer.byteLength(ipnSecret)<32||(environment==='sandbox'&&secretKey.startsWith('spsk_live_'))||(environment==='production'&&!secretKey.startsWith('spsk_live_')))return null;
  try{const url=new URL(returnUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null;}catch{return null;}
  if(environment==='production'&&(!returnUrl.startsWith('https://')||!sepayReturnIsPublic(returnUrl)))return null;
  return {merchantId,secretKey,ipnSecret,returnUrl,environment:environment as 'sandbox'|'production'};
}
export function authenticateSepayIpn(value:unknown,secret:string){
  if(typeof value!=='string')return false;
  const actual=Buffer.from(value),expected=Buffer.from(secret);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function sepayReturnOrigin(value:unknown,config:NonNullable<ReturnType<typeof sepayConfig>>):string|null{
  if(typeof value!=='string')return null;
  try{
    const url=new URL(value);
    if(url.origin!==value||url.username||url.password||!['http:','https:'].includes(url.protocol))return null;
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&['5173','4173'].includes(url.port);
    const configured=[new URL(config.returnUrl).origin,...(process.env.CORS_ORIGINS||'').split(',').map(v=>v.trim())];
    if(process.env.PUBLIC_APP_URL){try{configured.push(new URL(process.env.PUBLIC_APP_URL).origin);}catch{}}
    return local||configured.includes(value)?value:null;
  }catch{return null;}
}
export function sepayForm(config:NonNullable<ReturnType<typeof sepayConfig>>,ref:string,amount:number,returnOrigin?:string){
  const client=new SePayPgClient({env:config.environment,merchant_id:config.merchantId,secret_key:config.secretKey});
  const callback=(outcome:string)=>{
    const bridge=returnOrigin&&returnOrigin!==new URL(config.returnUrl).origin;
    const url=bridge?new URL('/api/payments/sepay/return',config.returnUrl):new URL(config.returnUrl);
    url.searchParams.set('ref',ref);url.searchParams.set('outcome',outcome);return url.href;
  };
  // Callback URLs are optional, but SePay rejects private callbacks. Local demos use IPN/query instead.
  const callbacks=sepayReturnIsPublic(config.returnUrl)?{success_url:callback('success'),error_url:callback('error'),cancel_url:callback('cancel')}:{};
  const fields=client.checkout.initOneTimePaymentFields({
    // SDK 1.0.0 signs insertion order. Keep the gateway's canonical order, not the SDK example order.
    // https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/form-thanh-toan
    order_amount:amount,merchant:config.merchantId,currency:'VND',operation:'PURCHASE',
    order_description:`Thanh toan BerylCore ${ref}`,order_invoice_number:ref,payment_method:'BANK_TRANSFER',
    ...callbacks,
  });
  return {action:config.environment==='production'?'https://pay.sepay.vn/v1/checkout/init':sepayCheckoutUrl,returnMode:sepayReturnIsPublic(config.returnUrl)?'redirect':'manual',fields:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,String(value)]))};
}
// Avoid floating-point rounding of a provider amount into a valid order amount.
export function sepayAmount(value:unknown):number|null{
  if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
  if(typeof value!=='string'||!/^\d{1,16}(?:\.0{1,2})?$/.test(value))return null;
  const amount=Number(value);return Number.isSafeInteger(amount)?amount:null;
}

