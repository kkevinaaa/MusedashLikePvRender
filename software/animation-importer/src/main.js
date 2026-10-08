import './style.css';
import { names, naturalSort, defaults, parseConfig, transformPoint } from './core.js';

const $ = s => document.querySelector(s);
const clone = v => structuredClone(v);
const allocated = new Set();
function collectResources(){const used=new Set([...slots.flatMap(s=>s.frames),...(applied?.frames.flat()??[])]);for(const f of allocated)if(!used.has(f)){URL.revokeObjectURL(f.url);allocated.delete(f);}}
const emptySlot = () => ({files:[], transforms:[], frames:[]});
let slots = names.map(emptySlot), selected = 0, frame = 0, fps = 8, playing = false, started = 0;
let applied = null, dirty = false, busy = false, mode = 'view', zoom = 1, origin = {x:0,y:0}, drag = null;
const html = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current = () => slots[selected];
const asset = () => current().frames[frame];
const tx = () => current().transforms[selected === 5 ? frame : 0];
const pack = () => ({version:1,fps,slots:slots.map(s=>({files:[...s.files],transforms:clone(s.transforms)}))});
const snapshot = () => ({config:pack(),frames:slots.map(s=>[...s.frames])});
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error);}
function changed(){dirty=true;$('#apply').disabled=false;$('#cancel').disabled=false;}
function stop(){playing=false;$('#play').textContent='播放';}
function updateSlots(){ $('#slots').innerHTML=slots.map((s,i)=>`<button class="slot ${i===selected?'active':''}" data-slot="${i}">${s.frames[0]?`<img src="${s.frames[0].url}" alt="">`:''}<span>${names[i]}<small>${s.frames.length?`${s.frames.length} ${i===5?'张':'帧'}`:s.files.length?'待关联':'导入'}</small></span></button>`).join(''); }
function updateFrames(){ $('#frames').innerHTML=current().frames.map((f,i)=>`<button draggable="true" data-frame="${i}" class="frame ${i===frame?'active':''}" title="${html(f.name)}"><img src="${f.url}" alt="">${html(f.name)}</button>`).join(''); }
function updateFields(){ const t=tx();document.querySelector('#monsterAll').disabled=!asset();document.querySelector('#scaleSlider').value=t?.scale??1;document.querySelector('#rotateSlider').value=t?.rotation??0;$('#group').textContent=names[selected];$('#monsterAll').hidden=selected!==5;$('#onionLabel').hidden=selected===0||selected===5;$('#play').disabled=selected===5||!asset();$('#empty').hidden=!!asset();$('#frameLabel').textContent=asset()?`${frame+1} / ${current().frames.length}`:'—';
  for(const el of document.querySelectorAll('[data-param]')){const p=el.dataset.param.split('.');el.disabled=!asset();el.value=t?(p.length===1?t[p[0]]:t[p[0]][p[1]]):'';}
  for(const el of document.querySelectorAll('[data-needs]'))el.disabled=!asset();
  $('#warning').textContent='';if(t){const c=t.crop;const clipped=(selected===5?[asset()]:current().frames).map((f,i)=>{const b=f?.bounds;return b&&(b.x<c.x||b.y<c.y||b.x+b.w>c.x+c.w||b.y+b.h>c.y+c.h)?i+1:null;}).filter(Boolean);if(clipped.length)$('#warning').textContent=`裁剪超出内容：第 ${clipped.join('、')} 帧`;}
}
function update(){updateSlots();updateFrames();updateFields();draw();}
function fit(){const f=asset(),box=$('#canvas').getBoundingClientRect();if(f){const t=tx(),c=t.crop;const points=[[c.x,c.y],[c.x+c.w,c.y],[c.x,c.y+c.h],[c.x+c.w,c.y+c.h]].map(([x,y])=>transformPoint(x,y,t));const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));zoom=Math.min((box.width-80)/Math.max(1,right-left),(box.height-80)/Math.max(1,bottom-top));origin={x:box.width/2-(left+right)/2*zoom,y:box.height/2-(top+bottom)/2*zoom};}else{zoom=1;origin={x:box.width/2,y:box.height/2};}draw();}
function setMode(value){mode=value;stop();if(value==='anchor'){frame=0;updateFrames();updateFields();}for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===mode);draw();}

$('#app').innerHTML=`<header><h1>动画导入器</h1><div><button id="load">打开配置</button><button id="save">保存配置</button></div></header>
<main><aside id="slots"></aside><section class="editor"><div class="toolbar"><button id="folder">导入文件夹</button><button id="files">选择图片</button><button id="fit">适应窗口</button><select id="background" aria-label="预览背景"><option value="checker">透明背景</option><option value="light">浅色</option><option value="dark">深色</option></select></div><div class="stage"><canvas id="canvas" aria-label="素材预览"></canvas><div id="empty">选择槽位，导入 PNG</div></div><div class="transport"><button id="prev" data-needs aria-label="上一帧">◀</button><button id="play">播放</button><button id="next" data-needs aria-label="下一帧">▶</button><span id="frameLabel">—</span><label>帧率 <input id="fps" type="number" min="1" max="60" value="8"></label></div><div class="frames" id="frames"></div></section>
<aside><h2 id="group">待机</h2><div class="pair"><button data-mode="view" class="active">查看</button><button data-mode="anchor" data-needs>锚点</button><button data-mode="crop" data-needs>裁剪</button></div>
<label class="field">缩放 <input aria-label="缩放" data-param="scale" type="number" min="0.05" max="5" step="0.05"></label><input id="scaleSlider" aria-label="缩放滑块" type="range" min="0.05" max="5" step="0.01" value="1" class="wide" data-needs>
<label class="field">旋转 <input aria-label="旋转" data-param="rotation" type="number" min="-180" max="180" step="1"></label><input id="rotateSlider" aria-label="旋转滑块" type="range" min="-180" max="180" step="1" value="0" class="wide" data-needs>
<h3>锚点</h3><div class="pair"><label>X<input aria-label="锚点 X" data-param="anchor.x" type="number" step="1"></label><label>Y<input aria-label="锚点 Y" data-param="anchor.y" type="number" step="1"></label></div>
<h3>裁剪</h3><div class="pair"><label>X<input aria-label="裁剪 X" data-param="crop.x" type="number" min="0"></label><label>Y<input aria-label="裁剪 Y" data-param="crop.y" type="number" min="0"></label></div><div class="pair"><label>宽<input aria-label="裁剪宽" data-param="crop.w" type="number" min="1"></label><label>高<input aria-label="裁剪高" data-param="crop.h" type="number" min="1"></label></div><label class="field">边距<input id="margin" type="number" min="0" max="1000" value="12"></label><button id="autoCrop" class="wide" data-needs>包住全部帧</button><button id="clearCrop" class="wide" data-needs>恢复完整画布</button><div class="warning" id="warning"></div>
<label class="check" id="onionLabel"><input id="onion" type="checkbox">叠加待机首帧</label><button id="monsterAll" class="wide" hidden>应用到全部怪物</button><details><summary>重置</summary><button class="wide" id="resetTransform" data-needs>重置缩放与旋转</button><button class="wide" id="resetAnchor" data-needs>锚点回到中心</button><button class="wide" id="reset" data-needs>重置本组</button></details></aside></main>
<footer><span id="status" role="status">未导入素材</span><div><button id="cancel" disabled>取消</button><button id="apply" class="primary" disabled>应用</button></div></footer><input id="fileInput" type="file" accept="image/png" multiple hidden><input id="folderInput" type="file" webkitdirectory multiple hidden><input id="configInput" type="file" accept=".json" hidden>`;
const canvas=$('#canvas'),ctx=canvas.getContext('2d');
function sourcePoint(x,y){const t=tx(),a=-t.rotation*Math.PI/180;const dx=(x-origin.x)/zoom,dy=(y-origin.y)/zoom;return{x:(dx*Math.cos(a)-dy*Math.sin(a))/t.scale+t.anchor.x,y:(dx*Math.sin(a)+dy*Math.cos(a))/t.scale+t.anchor.y};}
function drawImage(f,t,alpha=1,outline=false){ctx.save();ctx.globalAlpha=alpha;ctx.translate(origin.x,origin.y);ctx.scale(zoom,zoom);ctx.rotate(t.rotation*Math.PI/180);ctx.scale(t.scale,t.scale);ctx.translate(-t.anchor.x,-t.anchor.y);const c=t.crop;ctx.save();ctx.beginPath();ctx.rect(c.x,c.y,c.w,c.h);ctx.clip();ctx.drawImage(f.image,0,0);ctx.restore();if(outline){ctx.strokeStyle='#4779ef';ctx.lineWidth=1.5/(zoom*t.scale);ctx.setLineDash([6/(zoom*t.scale),4/(zoom*t.scale)]);ctx.strokeRect(c.x,c.y,c.w,c.h);}ctx.restore();}
function draw(){const b=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;const w=Math.round(b.width*dpr),h=Math.round(b.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,b.width,b.height);const bg=$('#background').value;ctx.fillStyle=bg==='dark'?'#272b33':'#fafafa';ctx.fillRect(0,0,b.width,b.height);if(bg==='checker'){ctx.fillStyle='#e5e7eb';for(let y=0;y<b.height;y+=16)for(let x=0;x<b.width;x+=16)if((x/16+y/16)%2===0)ctx.fillRect(x,y,16,16);}if(!asset())return;if($('#onion').checked&&selected>0&&selected<5&&slots[0].frames[0])drawImage(slots[0].frames[0],slots[0].transforms[0],.22);drawImage(asset(),tx(),1,true);ctx.strokeStyle='#ee5577';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(origin.x-12,origin.y);ctx.lineTo(origin.x+12,origin.y);ctx.moveTo(origin.x,origin.y-12);ctx.lineTo(origin.x,origin.y+12);ctx.stroke();ctx.beginPath();ctx.arc(origin.x,origin.y,5,0,Math.PI*2);ctx.stroke();}
function bounds(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=-1,bottom=-1;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(pixels[(y*c.width+i)*4+3]>0){left=Math.min(left,i);right=Math.max(right,i);top=Math.min(top,y);bottom=Math.max(bottom,y);}return right<0?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};}
async function importFiles(list){if(busy)return;const target=selected;const input=naturalSort(Array.from(list).filter(f=>/\.png$/i.test(f.name)));if(!input.length){status('未找到 PNG 图片',true);return;}if(new Set(input.map(f=>f.name)).size!==input.length){status('文件名重复，请分别导入各动作文件夹',true);return;}if(input.length>200){status('每个槽位最多导入 200 张图片',true);return;}busy=true;stop();status('正在读取素材…');const pending=[];try{for(const f of input){const url=URL.createObjectURL(f),image=new Image();const item={name:f.name,url,image,blob:f,path:f.webkitRelativePath||f.name};pending.push(item);allocated.add(item);image.src=url;await image.decode();if(image.width*image.height>20000000)throw Error(`${f.name} 尺寸过大`);item.w=image.width;item.h=image.height;item.bounds=bounds(image);}if(target!==5&&pending.some(f=>f.w!==pending[0].w||f.h!==pending[0].h))throw Error('同一动作的画布尺寸必须一致');const old=slots[target];const matching=old.files.length===pending.length&&old.files.every(n=>pending.some(f=>f.name===n));let ordered=matching?old.files.map(n=>pending.find(f=>f.name===n)):pending;let transforms=matching&&old.transforms.length?clone(old.transforms):target===5?ordered.map(f=>defaults(f.w,f.h)):[defaults(ordered[0].w,ordered[0].h)];for(let i=0;i<ordered.length;i++){const t=transforms[target===5?i:0],f=ordered[i];if(!t||t.crop.x+t.crop.w>f.w||t.crop.y+t.crop.h>f.h)throw Error('保存的裁剪框超出新素材尺寸');}slots[target]={files:ordered.map(f=>f.name),frames:ordered,transforms};selected=target;frame=0;changed();update();fit();status(`已导入${names[target]} · ${pending.length} 张`);}catch(e){pending.forEach(f=>URL.revokeObjectURL(f.url));status(`导入失败：${e.message}`,true);}finally{busy=false;collectResources();}}
function moveAnchor(x,y){const t=tx();const p=transformPoint(x,y,t);origin.x+=p.x*zoom;origin.y+=p.y*zoom;t.anchor={x,y};}
function constrainCrop(){const c=tx().crop,f=asset();c.x=Math.max(0,Math.min(f.w-1,c.x));c.y=Math.max(0,Math.min(f.h-1,c.y));c.w=Math.max(1,Math.min(f.w-c.x,c.w));c.h=Math.max(1,Math.min(f.h-c.y,c.h));}
function applyField(key,value){const t=tx();if(!t||!Number.isFinite(value))return;if(key==='scale')t.scale=Math.min(5,Math.max(.05,value));else if(key==='rotation')t.rotation=Math.min(180,Math.max(-180,value));else if(key.startsWith('anchor.'))moveAnchor(key.endsWith('x')?value:t.anchor.x,key.endsWith('y')?value:t.anchor.y);else{t.crop[key.split('.')[1]]=Math.round(value);constrainCrop();}changed();updateFields();draw();}
$('#slots').onclick=e=>{const b=e.target.closest('[data-slot]');if(!b)return;stop();selected=Number(b.dataset.slot);frame=0;setMode('view');update();fit();};
$('#files').onclick=()=>$('#fileInput').click();$('#folder').onclick=()=>$('#folderInput').click();for(const id of ['fileInput','folderInput'])$('#'+id).onchange=async e=>{await importFiles(e.target.files);e.target.value='';};
$('#fit').onclick=fit;$('#background').onchange=draw;$('#onion').onchange=draw;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-param]').forEach(el=>el.onchange=()=>{applyField(el.dataset.param,Number(el.value));updateFields();});
$('#scaleSlider').oninput=e=>applyField('scale',Number(e.target.value));$('#rotateSlider').oninput=e=>applyField('rotation',Number(e.target.value));
function step(n){if(!asset())return;stop();frame=(frame+n+current().frames.length)%current().frames.length;updateFrames();updateFields();draw();}
$('#prev').onclick=()=>step(-1);$('#next').onclick=()=>step(1);
$('#play').onclick=()=>{if(playing){stop();return;}if(!asset()||selected===5)return;setMode('view');playing=true;started=performance.now()-frame*1000/fps;$('#play').textContent='暂停';};
$('#fps').onchange=e=>{fps=Math.round(Math.min(60,Math.max(1,Number(e.target.value)||8)));e.target.value=fps;started=performance.now()-frame*1000/fps;changed();};
$('#frames').onclick=e=>{const b=e.target.closest('[data-frame]');if(b){stop();frame=+b.dataset.frame;updateFrames();updateFields();draw();}};
let draggingFrame=null;$('#frames').ondragstart=e=>{const b=e.target.closest('[data-frame]');if(!b)return;draggingFrame=+b.dataset.frame;e.dataTransfer.setData('text/plain',String(draggingFrame));};$('#frames').ondragover=e=>e.preventDefault();$('#frames').ondrop=e=>{e.preventDefault();const b=e.target.closest('[data-frame]');if(!b||draggingFrame===null)return;const to=+b.dataset.frame,s=current();for(const a of [s.frames,s.files,...(selected===5?[s.transforms]:[])])a.splice(to,0,a.splice(draggingFrame,1)[0]);draggingFrame=null;stop();frame=to;changed();update();};
canvas.onpointerdown=e=>{if(!asset())return;stop();const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top};canvas.setPointerCapture(e.pointerId);if(mode==='anchor'){frame=0;updateFrames();const s=sourcePoint(p.x,p.y);moveAnchor(Math.round(s.x),Math.round(s.y));changed();updateFields();draw();drag={type:'anchor'};}else if(mode==='crop')drag={type:'crop',start:sourcePoint(p.x,p.y)};else drag={type:'pan',x:p.x,y:p.y,origin:{...origin}};};
canvas.onpointermove=e=>{if(!drag)return;const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top};if(drag.type==='pan'){origin={x:drag.origin.x+p.x-drag.x,y:drag.origin.y+p.y-drag.y};}else if(drag.type==='anchor'){const s=sourcePoint(p.x,p.y);moveAnchor(Math.round(s.x),Math.round(s.y));changed();updateFields();}else{const s=sourcePoint(p.x,p.y),a=drag.start;tx().crop={x:Math.round(Math.min(a.x,s.x)),y:Math.round(Math.min(a.y,s.y)),w:Math.round(Math.abs(s.x-a.x)),h:Math.round(Math.abs(s.y-a.y))};constrainCrop();changed();updateFields();}draw();};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};canvas.onwheel=e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,old=zoom;zoom=Math.min(10,Math.max(.02,zoom*Math.exp(-e.deltaY*.001)));origin={x:x-(x-origin.x)*zoom/old,y:y-(y-origin.y)*zoom/old};draw();};
$('#autoCrop').onclick=()=>{const list=selected===5?[asset()]:current().frames;const bs=list.map(f=>f.bounds).filter(Boolean);if(!bs.length){status('素材全部透明',true);return;}const m=Math.max(0,Math.min(1000,Number($('#margin').value)||0));const x=Math.max(0,Math.min(...bs.map(b=>b.x))-m),y=Math.max(0,Math.min(...bs.map(b=>b.y))-m);tx().crop={x,y,w:Math.min(asset().w,Math.max(...bs.map(b=>b.x+b.w))+m)-x,h:Math.min(asset().h,Math.max(...bs.map(b=>b.y+b.h))+m)-y};changed();updateFields();fit();};
$('#clearCrop').onclick=()=>{tx().crop={x:0,y:0,w:asset().w,h:asset().h};changed();updateFields();draw();};
$('#resetTransform').onclick=()=>{tx().scale=1;tx().rotation=0;changed();updateFields();fit();};$('#resetAnchor').onclick=()=>{moveAnchor(asset().w/2,asset().h/2);changed();updateFields();draw();};$('#reset').onclick=()=>{current().transforms[selected===5?frame:0]=defaults(asset().w,asset().h);changed();updateFields();fit();};
$('#monsterAll').onclick=()=>{if(!asset())return;const t=clone(tx());if(current().frames.some(f=>t.crop.x+t.crop.w>f.w||t.crop.y+t.crop.h>f.h)){status('怪物画布尺寸不同，当前裁剪框无法用于全部图片',true);return;}current().transforms=current().frames.map(()=>clone(t));changed();update();status('已应用到全部怪物');};
$('#apply').onclick=()=>{applied=snapshot();collectResources();dirty=false;$('#apply').disabled=$('#cancel').disabled=true;window.dispatchEvent(new CustomEvent('animation-assets-applied',{detail:pack()}));status('已应用。保存配置可供下次载入');};
$('#cancel').onclick=()=>{stop();const s=applied;if(s){fps=s.config.fps;slots=s.config.slots.map((v,i)=>({...clone(v),frames:[...s.frames[i]]}));}else{slots=names.map(emptySlot);fps=8;}frame=0;dirty=false;$('#fps').value=fps;$('#apply').disabled=$('#cancel').disabled=true;update();fit();collectResources();status('已恢复上次应用的配置');};
const dataURL = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(blob);});
async function exportConfig(source=snapshot()){
 const c=clone(source.config);
 for(let i=0;i<c.slots.length;i++){
  const slot=c.slots[i],frames=source.frames[i];
  if(frames.length!==slot.files.length)throw Error('请先关联'+names[i]+'的素材，再保存');
  slot.images=await Promise.all(frames.map(async f=>({path:f.path||f.name,data:await dataURL(f.blob||await(await fetch(f.url)).blob())})));
 }
 return c;
}
async function loadConfig(value){
 if(busy)throw Error('素材正在加载');
 const c=parseConfig(typeof value==='string'?value:JSON.stringify(value));busy=true;stop();
 try{
  const next=[];
  for(const [i,s] of c.slots.entries()){
   let frames=[];
   if(s.images){
    for(let j=0;j<s.images.length;j++){
     const saved=s.images[j],blob=await(await fetch(saved.data)).blob(),url=URL.createObjectURL(blob),image=new Image();
     const f={name:s.files[j],path:saved.path||s.files[j],blob,url,image};allocated.add(f);image.src=url;await image.decode();
     if(image.width*image.height>20000000)throw Error('图片尺寸过大');
     f.w=image.width;f.h=image.height;f.bounds=bounds(image);frames.push(f);
    }
   }else{frames=s.files.map(n=>slots[i].frames.find(f=>f.name===n));if(!frames.every(Boolean))frames=[];}
   if(i!==5&&frames.some(f=>f.w!==frames[0].w||f.h!==frames[0].h))throw Error('同一动作的画布尺寸必须一致');
   for(let j=0;j<frames.length;j++){const t=s.transforms[i===5?j:0],f=frames[j];if(t.crop.x+t.crop.w>f.w||t.crop.y+t.crop.h>f.h)throw Error('裁剪框超出素材尺寸');}
   next.push({files:[...s.files],transforms:clone(s.transforms),frames});
  }
  slots=next;fps=c.fps;$('#fps').value=fps;frame=0;changed();update();fit();
 }finally{busy=false;collectResources();}
}
$('#save').onclick=async()=>{try{const blob=new Blob([JSON.stringify(await exportConfig())],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='animation-assets.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出配置及图片');}catch(e){status('保存失败：'+e.message,true);}};
$('#load').onclick=()=>$('#configInput').click();$('#configInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(dirty&&!confirm('放弃当前未应用的修改？'))return;await loadConfig(await f.text());status(slots.some(s=>s.files.length&&!s.frames.length)?'旧配置缺少图片，请关联一次素材后重新保存':'配置和素材已载入');}catch(err){status('配置未载入：'+err.message,true);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>fit()).observe(canvas.parentElement);
function loop(now){if(playing&&asset()){const n=Math.floor((now-started)*fps/1000)%current().frames.length;if(n!==frame){frame=n;updateFrames();$('#frameLabel').textContent=`${frame+1} / ${current().frames.length}`;draw();}}requestAnimationFrame(loop);}update();fit();requestAnimationFrame(loop);


// Same-origin renderer bridge. Original image bytes remain local.
window.animationImporter = {
 get applied(){return applied;},
 get dirty(){return dirty;},
 async importGroup(index,files){if(busy)throw Error('素材正在加载');selected=index;frame=0;await importFiles(files);},
 getConfig:pack,
 setConfig:loadConfig,
 exportConfig,
 apply(){document.querySelector('#apply').click();},
 cancel(){document.querySelector('#cancel').click();},
 pause:stop
};
window.dispatchEvent(new Event('animation-importer-ready'));
