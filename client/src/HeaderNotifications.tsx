import {Bell} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {useSession} from './context';
export function HeaderNotifications(){
 const {user}=useSession();
 const q=useQuery({queryKey:['header-notifications',user?.id],queryFn:()=>api<unknown[]>('/notifications?page=1') as Promise<{data:unknown[];unread:number}>,enabled:user?.role==='CUSTOMER',refetchInterval:15000,refetchOnWindowFocus:true});
 if(user?.role!=='CUSTOMER')return null;
 const count=q.data?.unread||0;
 return <Link to="/account?tab=notifications" className="header-notifications" aria-label={count?`Thông báo, ${count} chưa đọc`:'Thông báo'} title="Thông báo"><Bell size={21} aria-hidden="true"/>{count>0&&<span className="notification-count" aria-hidden="true">{count>99?'99+':count}</span>}</Link>;
}
