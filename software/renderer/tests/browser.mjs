import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out=path.resolve('test-results');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const chart={version:1,meta:{title:'渲染测试',bpm:120,offsetSeconds:0,ppq:480,timeSignature:{numerator:4,denominator:4},seed:123,music:null},notes:[{id:'a',tick:960,height:.2},{id:'b',tick:1080,height:.8},{id:'c',tick:2400,height:.3},{id:'d',tick:3360,height:.6}]};
async function upload(selector,obj){await page.locator(selector).setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(obj))});}
async function download(selector){const event=page.waitForEvent('download');await page.locator(selector).click();const d=await event;return JSON.parse(await fs.readFile(await d.path(),'utf8'));}
async function seek(time){await page.locator('#seek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},time);}
async function field(name,value){const el=page.getByLabel(name,{exact:true});await el.fill(String(value));await el.press('Tab');}
try{
 await page.goto(process.env.RENDERER_URL||'http://127.0.0.1:5175');await page.locator('#materials').click();await page.frameLocator('#editor').locator('#slots').waitFor();await page.locator('#preset').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('项目素材已载入'),{},{timeout:60000});
 const frame=page.frameLocator('#editor');assert.equal(await frame.locator('.slot small').allTextContents().then(a=>a.join(',')),'4 帧,5 帧,5 帧,5 帧,3 帧,6 张');
 await frame.locator('[data-slot="0"]').click();await frame.getByLabel('缩放',{exact:true}).fill('.9');await frame.getByLabel('缩放',{exact:true}).press('Tab');await frame.locator('#apply').click();await page.locator('#closeAssets').click();
 await upload('#chartFile',chart);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入 4'));
 const musicDir=path.resolve('../../src/Music');const music=(await fs.readdir(musicDir)).find(n=>n.endsWith('.flac'));await page.locator('#musicFile').setInputFiles(path.join(musicDir,music));await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入音乐'),{},{timeout:60000});
 await field('片段结束（秒）',4);await seek(1.8);await page.locator('#play').click();await page.waitForTimeout(400);await page.locator('#play').click();assert.ok(parseFloat(await page.locator('#time').textContent())>2.1);
 await seek(2.49);await page.screenshot({path:path.join(out,'renderer-hit.png')});const first=await page.locator('#canvas').evaluate(c=>c.toDataURL());await seek(.1);await seek(2.49);assert.equal(await page.locator('#canvas').evaluate(c=>c.toDataURL()),first);
 await page.locator('#mode').selectOption('miss');await seek(2.8);await page.screenshot({path:path.join(out,'renderer-miss.png')});assert.notEqual(await page.locator('#canvas').evaluate(c=>c.toDataURL()),first);
 await page.locator('#random').click();const changed=await download('#exportChart');assert.notEqual(changed.meta.seed,123);assert.deepEqual(changed.notes,chart.notes);
 const cfg=await download('#save');assert.equal(cfg.assets.slots[0].transforms[0].scale,.9);assert.equal(cfg.settings.mode,'miss');
 await upload('#configFile',{version:1,settings:{...cfg.settings,moveDuration:0},assets:cfg.assets});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('配置未载入'));assert.equal((await download('#save')).settings.moveDuration,cfg.settings.moveDuration);
 const dup=structuredClone(chart);dup.notes.push({...dup.notes[0],id:'same-time'});await upload('#chartFile',dup);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入 5'));await page.locator('#mode').selectOption('hit');await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('同刻多音符'));await page.locator('#mode').selectOption('miss');await page.locator('#play').click();assert.equal(await page.locator('#play').textContent(),'暂停');await page.locator('#play').click();
 await upload('#chartFile',chart);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入 4'));await page.locator('#record').click();assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'screen');await page.waitForFunction(()=>Number(document.querySelector('#count').textContent)>0);await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>document.querySelector('#play').textContent==='播放');
 await seek(3.8);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='片段播放结束',{},{timeout:15000});const ended=await page.locator('#time').textContent();await page.waitForTimeout(150);assert.equal(await page.locator('#time').textContent(),ended);
 await page.reload();await page.frameLocator('#editor').locator('#slots').waitFor({state:'attached'});await upload('#configFile',cfg);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('配置已载入'));assert.equal((await download('#save')).assets.slots[0].transforms[0].scale,.9);
 await page.locator('#materials').click();const idlePath=path.resolve('../../src/EquidistantWhiteEdgeStopMotionMovie/Idle');await frame.locator('#fileInput').setInputFiles([1,2,3,4].map(n=>path.join(idlePath,n+'.png')));await frame.locator('#apply').click();assert.equal((await page.evaluate(()=>document.querySelector('#editor').contentWindow.animationImporter.applied.config.slots[0].transforms[0].scale)),.9);await page.screenshot({path:path.join(out,'renderer-materials.png')});
 assert.deepEqual(errors,[]);console.log('PASS: embedded importer, real PNG/FLAC, seek determinism, both modes, seed export, invalid config, same-time rule, reload/relink');
}finally{await browser.close();}
