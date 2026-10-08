import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('../..');
const out=path.resolve('test-results');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const source=(group,n)=>path.join(root,'src/EquidistantWhiteEdgeStopMotionMovie',group,`${n}.png`);
async function upload(group,names){await page.locator('#fileInput').setInputFiles(names.map(n=>source(group,n)));await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已导入'));}
async function config(){const event=page.waitForEvent('download');await page.locator('#save').click();const download=await event;return JSON.parse(await fs.readFile(await download.path(),'utf8'));}
async function field(label,value){const el=page.getByLabel(label,{exact:true});await el.fill(String(value));await el.press('Tab');}
try{
 await page.goto('http://127.0.0.1:5174');
 await upload('Idle',[4,2,1,3]);assert.deepEqual((await config()).slots[0].files,['1.png','2.png','3.png','4.png']);
 assert.equal(await page.locator('#empty').isVisible(),false);
 await page.locator('#autoCrop').click();let c=await config();assert.ok(c.slots[0].transforms[0].crop.w<1920);
 await field('缩放',.8);await field('旋转',15);await field('锚点 X',950);
 c=await config();assert.equal(c.slots[0].transforms[0].scale,.8);assert.equal(c.slots[0].transforms[0].rotation,15);assert.equal(c.slots[0].transforms[0].anchor.x,950);
 await page.locator('#apply').click();await field('缩放',1.2);await page.locator('#cancel').click();assert.equal((await config()).slots[0].transforms[0].scale,.8);
 await page.locator('#play').click();await page.waitForTimeout(180);assert.notEqual(await page.locator('#frameLabel').textContent(),'1 / 4');await page.locator('#play').click();
 const saved=await config();
 await page.locator('#configInput').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"slots":[]}')});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('配置未载入'));assert.deepEqual((await config()).slots[0],saved.slots[0]);
 await page.reload();await page.locator('#configInput').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('配置已载入'));await upload('Idle',[1,2,3,4]);assert.deepEqual((await config()).slots[0],saved.slots[0]);
 await page.locator('[data-slot="1"]').click();await upload('Upper',[1,2,3,4,5]);await page.locator('#onion').check();await page.locator('#autoCrop').click();
 await page.screenshot({path:path.join(out,'importer-1440.png')});
 await page.locator('[data-slot="5"]').click();await upload('Monsters',[1,2,3,4,5,6]);assert.equal(await page.locator('#play').isDisabled(),true);await field('缩放',.7);await page.locator('#monsterAll').click();assert.ok((await config()).slots[5].transforms.every(t=>t.scale===.7));
 await page.locator('[data-slot="1"]').click();const before=await config();await page.locator('#fileInput').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('导入失败'));assert.deepEqual((await config()).slots[1],before.slots[1]);
 await page.setViewportSize({width:1100,height:800});await page.waitForTimeout(100);assert.ok((await page.locator('#frames').boundingBox()).y<800);await page.screenshot({path:path.join(out,'importer-1100.png')});
 assert.deepEqual(errors,[]);console.log('PASS: real PNG import, natural order, crop, transforms, apply/cancel, animation, save/relink, invalid inputs, monsters');
}finally{await browser.close();}
