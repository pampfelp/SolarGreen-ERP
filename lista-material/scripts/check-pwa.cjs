const {chromium} = require('playwright');
const path = require('path');
const url = process.argv[2] || 'https://pampfelp.github.io/SolarGreen-ERP/lista-material/';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const android = await chromium.launchPersistentContext(path.resolve(__dirname,'../test-results/pwa-android-profile'),{
    headless:true,executablePath:edge,viewport:{width:393,height:851},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'});
  const page = await android.newPage();
  await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await android.newCDPSession(page);
  await cdp.send('Page.enable');
  const errors = await cdp.send('Page.getInstallabilityErrors');
  const manifest = await cdp.send('Page.getAppManifest');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  const active = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state);
  if(active!=='activated') throw new Error('Service worker not active: '+active);
  if(errors.installabilityErrors.length) throw new Error('Installability: '+JSON.stringify(errors.installabilityErrors));
  if(manifest.errors.length) throw new Error('Manifest: '+JSON.stringify(manifest.errors));
  await page.evaluate(() => { const event=new Event('beforeinstallprompt',{cancelable:true}); event.prompt=()=>{}; window.dispatchEvent(event); });
  if(!await page.locator('#install-banner').isVisible()) throw new Error('Android install banner missing');
  await android.close();
  const iphone = await chromium.launchPersistentContext(path.resolve(__dirname,'../test-results/pwa-iphone-profile'),{
    headless:true,executablePath:edge,viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'});
  const ios = await iphone.newPage();
  await ios.goto(url,{waitUntil:'networkidle'});
  if(!await ios.locator('#install-banner').isVisible()) throw new Error('iPhone instructions missing');
  if(!/Compartilhar/.test(await ios.locator('#install-banner').innerText())) throw new Error('iPhone instructions incomplete');
  await iphone.close();
  console.log('Public PWA: SW active, manifest valid, Chromium installable, Android and iPhone guidance visible');
})().catch(error => {console.error(error);process.exit(1)});
