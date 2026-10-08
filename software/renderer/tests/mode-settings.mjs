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
async function field(p,key,v){const el=p.locator('[data-setting='+key+']');await el.evaluate(e=>{const d=e.closest('details');if(d)d.open=true;});await el.fill(String(v));await el.press('Tab');}
try{
 const a=await fresh();await a.locator('#closeAssets').click();await field(a,'characterScale',130);await field(a,'bobAmplitude',.03);await a.locator('#areaCenter').fill('40');await a.locator('#areaCenter').press('Tab');await a.locator('#mode').selectOption('miss');assert.equal(await a.locator('[data-setting=characterScale]').inputValue(),'130');await field(a,'characterScale',80);await field(a,'bobAmplitude',.07);await a.locator('#areaCenter').fill('60');await a.locator('#areaCenter').press('Tab');await a.locator('#mode').selectOption('hit');assert.equal(await a.locator('[data-setting=characterScale]').inputValue(),'130');assert.equal(await a.locator('[data-setting=bobAmplitude]').inputValue(),'0.03');assert.equal(await a.locator('#areaCenter').inputValue(),'40');const project=await save(a,a.locator('#save'));assert.equal(project.modeSettings.hit.characterScale,1.3);assert.equal(project.modeSettings.miss.characterScale,.8);await a.close();
 const b=await fresh();await b.locator('#closeAssets').click();await load(b.locator('#configFile'),project);await b.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('工程已载入'));await b.locator('#mode').selectOption('miss');assert.equal(await b.locator('[data-setting=characterScale]').inputValue(),'80');assert.equal(await b.locator('[data-setting=bobAmplitude]').inputValue(),'0.07');assert.equal(await b.locator('#areaCenter').inputValue(),'60');await b.locator('#mode').selectOption('hit');assert.equal(await b.locator('#areaCenter').inputValue(),'40');
 const old=structuredClone(project);delete old.modeSettings;await load(b.locator('#configFile'),old);await b.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('工程已载入'));await b.locator('#mode').selectOption('miss');assert.equal(await b.locator('[data-setting=characterScale]').inputValue(),'130');assert.equal(await b.locator('#areaCenter').inputValue(),'40');assert.deepEqual(errors,[]);console.log('PASS: hit/miss parameters remain separate across switches and fresh-page project restore; legacy projects migrate.');
}finally{await browser.close();}
