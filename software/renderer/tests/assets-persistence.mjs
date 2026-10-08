import {importFixture} from './fixtures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.RENDERER_URL||'http://127.0.0.1:5175';
const errors=[];
async function fresh(){const p=await browser.newPage({acceptDownloads:true});p.on('dialog',d=>d.accept());p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#materials').click();await p.frameLocator('#editor').locator('#slots').waitFor();return p;}
async function save(p,loc){const waiting=p.waitForEvent('download');await loc.click();return JSON.parse(await fs.readFile(await(await waiting).path(),'utf8'));}
async function load(loc,c){await loc.setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});}
try{
 const a=await fresh();await importFixture(a,false);
 const af=a.frameLocator('#editor');await af.locator('[data-slot="0"]').click();await af.locator('#fps').fill('12');await af.locator('#fps').press('Tab');await af.getByLabel('缩放',{exact:true}).fill('.8');await af.getByLabel('缩放',{exact:true}).press('Tab');
 const standalone=await save(a,af.locator('#save'));assert.equal(standalone.fps,12);assert.equal(standalone.slots[0].transforms[0].scale,.8);for(const s of standalone.slots){assert.equal(s.images.length,s.files.length);assert.ok(s.images.every(i=>i.data.startsWith('data:image/png;base64,')&&i.path));}
 await af.locator('#apply').click();await a.locator('#closeAssets').click();const renderer=await save(a,a.locator('#save'));assert.deepEqual(renderer.assets,standalone);await a.close();
 const b=await fresh(),bf=b.frameLocator('#editor');await load(bf.locator('#configInput'),standalone);await bf.locator('#status').filter({hasText:'配置和素材已载入'}).waitFor();assert.deepEqual(await bf.locator('.slot small').allTextContents(),standalone.slots.slice(0,6).map((s,i)=>s.files.length+(i===5?' 张':' 帧')));assert.deepEqual(await save(b,bf.locator('#save')),standalone);
 const broken=structuredClone(standalone);broken.slots[5].images[0].data='data:image/png;base64,AAAA';await load(bf.locator('#configInput'),broken);await bf.locator('#status').filter({hasText:'配置未载入'}).waitFor();assert.deepEqual(await save(b,bf.locator('#save')),standalone);await b.close();
 const c=await fresh();await c.locator('#closeAssets').click();await load(c.locator('#configFile'),renderer);await c.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('工程已载入'));assert.deepEqual((await save(c,c.locator('#save'))).assets,standalone);
 await c.locator('#materials').click();const cf=c.frameLocator('#editor');const old=structuredClone(standalone);old.slots.forEach(s=>delete s.images);await load(cf.locator('#configInput'),old);await cf.locator('#status').filter({hasText:'配置和素材已载入'}).waitFor();assert.deepEqual(await save(c,cf.locator('#save')),standalone);
 assert.deepEqual(errors,[]);console.log('PASS: both config downloads restore all PNGs in fresh pages; calibration and FPS preserved; corrupt load atomic; legacy matching supported.');
}finally{await browser.close();}
