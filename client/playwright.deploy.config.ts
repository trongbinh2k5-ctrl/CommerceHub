import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e-deploy',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:5002',headless:true,launchOptions:{executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'},screenshot:'only-on-failure'},
  webServer:{command:'npm run dev:demo --prefix ../server',url:'http://127.0.0.1:5002/health',reuseExistingServer:false,timeout:120000,env:{SERVE_FRONTEND:'true',DEMO_PORT:'5002',DEMO_PUBLIC_APP_URL:'http://127.0.0.1:5002',CORS_ORIGINS:'http://127.0.0.1:5002',UPLOAD_STORAGE:'gridfs'}},
});
