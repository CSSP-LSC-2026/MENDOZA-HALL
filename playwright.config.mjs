import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./browser-tests',workers:1,timeout:120000,
  use:{baseURL:'http://localhost:8788',headless:true,viewport:{width:1100,height:800},reducedMotion:'reduce',
    launchOptions:process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{}
  },
  webServer:{command:'npm run dev -- --binding DEMO_MODE=true',url:'http://localhost:8788',reuseExistingServer:true,timeout:120000},
  reporter:'list'
});
