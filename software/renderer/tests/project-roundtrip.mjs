import {importFixture} from './fixtures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-accelerated-2d-canvas']});
const base=process.env.RENDERER_URL||'http://127.0.0.1:5175';
const errors=[];
async function fresh(){const p=await browser.newPage({acceptDownloads:true});p.on('dialog',d=>d.accept());p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#materials').click();await p.frameLocator('#editor').locator('#slots').waitFor();return p;}
async function save(p,loc){const waiting=p.waitForEvent('download');await loc.click();return JSON.parse(await fs.readFile(await(await waiting).path(),'utf8'));}
async function load(loc,c){await loc.setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});}

function wav(){const n=48000*3,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/48000)*2000),44+i*2);return b;}
async function seek(p,t){await p.locator('#seek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input'));},t);}
try{
 const a=await fresh();await importFixture(a);await a.locator('#closeAssets').click();const chart={version:1,meta:{title:'完整工程',bpm:120,offsetSeconds:0,ppq:480,timeSignature:{numerator:4,denominator:4},seed:91,music:null},notes:[{id:'a',tick:960,height:.2}]};await load(a.locator('#chartFile'),chart);await a.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入 1'));const audio=wav();await a.locator('#musicFile').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:audio});await a.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已载入音乐'));await a.locator('#outWidth').fill('160');await a.locator('#outWidth').press('Tab');await a.locator('#outHeight').fill('90');await a.locator('#outHeight').press('Tab');await seek(a,2.05);await a.waitForTimeout(100);const preview=await a.locator('#canvas').evaluate(c=>c.toDataURL());const project=await save(a,a.locator('#save'));assert.equal(project.version,2);assert.equal(project.chart.meta.seed,91);assert.deepEqual(project.chart.notes,chart.notes);assert.equal(project.assets.slots[6].files[0],'Pillow.png');assert.deepEqual(Buffer.from(project.music.data.split(',')[1],'base64'),audio);await a.close();
 const b=await fresh();await b.locator('#closeAssets').click();await load(b.locator('#configFile'),project);await b.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('工程已载入'));assert.deepEqual(await save(b,b.locator('#save')),project);await seek(b,2.05);await b.waitForTimeout(100);const restoredPreview=await b.locator('#canvas').evaluate(c=>c.toDataURL());assert.ok(restoredPreview===preview,'restored preview must match saved scene');await b.locator('#play').click();await b.waitForFunction(()=>document.querySelector('#play').textContent==='暂停');await b.locator('#play').click();assert.deepEqual(await save(b,b.locator('#save')),project);
 const broken=structuredClone(project);broken.music.data='data:audio/wav;base64,AAAA';await load(b.locator('#configFile'),broken);await b.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('配置未载入'));assert.deepEqual(await save(b,b.locator('#save')),project);
 const waiting=b.waitForEvent('download');await b.locator('#exportFrames').click();const mp4=await waiting;assert.ok((await fs.stat(await mp4.path())).size>1000);await b.waitForFunction(()=>!document.querySelector('#exportDialog').open);assert.deepEqual(errors,[]);console.log('PASS: full project restores exact original audio bytes, chart, assets, preview, playback and MP4 export in fresh page; invalid audio preserves prior project.');
}finally{await browser.close();}
