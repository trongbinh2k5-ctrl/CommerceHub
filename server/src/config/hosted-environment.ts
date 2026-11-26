// Render supplies this public URL. Explicit settings always take precedence.
export function applyHostedDefaults(env:NodeJS.ProcessEnv=process.env){
  if(env.SERVE_FRONTEND!=='true'||!env.RENDER_EXTERNAL_URL)return;
  const url=new URL(env.RENDER_EXTERNAL_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid hosted application URL');
  env.PUBLIC_APP_URL ||= url.origin;
  env.CORS_ORIGINS ||= env.PUBLIC_APP_URL;
  if(env.SEPAY_ENABLED==='true')env.SEPAY_RETURN_URL ||= new URL('/payments/sepay/return',env.PUBLIC_APP_URL).href;
}
