import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
// Local test fixtures are uploaded explicitly; they are never part of the web bundle.
export async function importFixture(page,miss=false){
 const root=fileURLToPath(new URL('../../../src/EquidistantWhiteEdgeStopMotionMovie/',import.meta.url));
 const groups=['Idle','Upper','Lower','Stright','Hitfx','Monsters'];
 for(const index of (miss?[5,6]:[0,1,2,3,4,5,6])){
  const dir=index===6?root:path.join(root,groups[index]);const names=index===6?['Pillow.png']:(await fs.readdir(dir)).filter(n=>n.endsWith('.png'));
  const files=await Promise.all(names.map(async name=>({name,data:(await fs.readFile(path.join(dir,name))).toString('base64')})));
  await page.evaluate(async({index,files})=>{const bridge=document.querySelector('#editor').contentWindow.animationImporter;await bridge.importGroup(index,files.map(f=>new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name,{type:'image/png'})));},{index,files});
 }
 await page.evaluate(()=>document.querySelector('#editor').contentWindow.animationImporter.apply());
}
