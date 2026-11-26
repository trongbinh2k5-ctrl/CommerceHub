export const ghnBaseUrl='https://dev-online-gateway.ghn.vn/shiip/public-api';
export function ghnConfig(){
  const token=process.env.GHN_TOKEN?.trim(),shopId=Number(process.env.GHN_SHOP_ID);
  if(process.env.GHN_ENABLED!=='true'||(process.env.GHN_ENV||'staging')!=='staging'||!token||!Number.isSafeInteger(shopId)||shopId<=0)return null;
  return {token,shopId};
}
