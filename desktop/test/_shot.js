const { _electron: electron } = require('playwright'); const path=require('path'); const fs=require('fs'); const os=require('os');
(async()=>{ const ud=fs.mkdtempSync(path.join(os.tmpdir(),'pfh-'));
const app=await electron.launch({args:['.','--no-sandbox',`--user-data-dir=${ud}`],cwd:'/home/claude/portalfirma-desktop',env:{...process.env,PF_MOCK:'1'}});
const w=await app.firstWindow(); const errs=[]; w.on('pageerror',e=>errs.push(e.message));
await w.setViewportSize({width:+(process.argv[3]||1500),height:+(process.argv[4]||920)}); await w.waitForFunction(() => window.studio && window.Inmo, null, { timeout: 15000 }); await w.waitForTimeout(300); await w.evaluate(() => window.studio.goHome()); await w.waitForSelector('.hub-card'); await w.waitForTimeout(800);
if(process.argv[5]) await w.evaluate(process.argv[5]); await w.waitForTimeout(800);
await w.screenshot({path:process.argv[2], fullPage:true}); console.log('errs',errs); await app.close();})();
