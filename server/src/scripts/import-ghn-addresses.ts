import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import {ghnBaseUrl,ghnConfig} from '../modules/shipping/ghn.config';
async function main(){
 const config=ghnConfig();if(!config)throw Error('Cần cấu hình GHN staging.');
 async function get(path:string){const r=await fetch(ghnBaseUrl+path,{headers:{Token:config!.token,ShopId:String(config!.shopId)},signal:AbortSignal.timeout(15000)});const j=await r.json() as any;if(!r.ok||j.code!==200||!Array.isArray(j.data))throw Error('Không lấy được danh mục GHN.');return j.data.filter((x:any)=>x.status===1);}
 const provinces=await get('/v3/master-data/province/all?limit=200');const result=[];
 for(const p of provinces){const wards=await get('/v3/master-data/ward/all-by-province-id?province_id='+p._id+'&limit=200');if(!wards.length)throw Error('Danh mục phường/xã rỗng.');result.push({name:p.name,aliases:p.extension_names||[],wards:wards.map((w:any)=>({name:w.name,aliases:w.extension_names||[]}))});}
 if(result.length<30)throw Error('Danh mục tỉnh chưa đầy đủ.');
 await writeFile('src/modules/addresses/address-catalog.data.ts','// GHN staging master data, imported 2026-11-23. Names only; no account data.\nexport const addressCatalog = '+JSON.stringify(result)+';\n');
 console.log(JSON.stringify({provinces:result.length,wards:result.reduce((n,p)=>n+p.wards.length,0)}));
}
main().catch(()=>{console.error('Không nhập được danh mục địa chỉ; file cũ được giữ nguyên.');process.exitCode=1;});
