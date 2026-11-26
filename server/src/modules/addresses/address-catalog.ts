import {addressCatalog} from './address-catalog.data';
export {addressCatalog};
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
export function findProvince(name:string){return addressCatalog.find(p=>[p.name,...p.aliases].some(s=>normalized(s)===normalized(name)));}
export function validateDeliveryAddress(a:{province:string;ward:string;detail:string}){
 const p=findProvince(a.province);if(!p)throw Object.assign(new Error('Tỉnh/thành chưa hợp lệ. Hãy chọn tên từ danh sách gợi ý.'),{statusCode:400});
 const matches=p.wards.filter(w=>[w.name,...w.aliases].some(s=>normalized(s)===normalized(a.ward)));
 if(matches.length!==1)throw Object.assign(new Error('Phường/xã chưa hợp lệ hoặc không thuộc tỉnh/thành đã chọn. Hãy chọn lại từ gợi ý.'),{statusCode:400});
 if(a.detail.trim().length<8||!/[\p{L}]/u.test(a.detail))throw Object.assign(new Error('Nhập địa chỉ chi tiết ít nhất 8 ký tự: số nhà, đường hoặc thôn/xóm.'),{statusCode:400});
 return {province:p.name,ward:matches[0].name};
}
