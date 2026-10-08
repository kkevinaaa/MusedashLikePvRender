export const WIDTH=1920,HEIGHT=1080;
export const defaults={exportFormat:"mp4",outputWidth:1920,outputHeight:1080,dimensionMode:"free",aspectRatio:16/9,exportMode:"normal",outputFps:60,stepFps:12,showCharacter:true,showMonsters:true,showFx:true,fxRandomRotation:false,fxFade:false,fxHoldLast:true,fxFadeDuration:.2,fxFadeDelay:.1,monsterFloat:false,floatAmplitude:.02,floatPeriod:2,entranceDuration:.8,entranceLead:.3,exitEnabled:false,exitDuration:.8,mode:'hit',characterX:.22,hitX:.32,top:.2,bottom:.8,characterScale:.7,monsterScale:.6,fxScale:.7,travelBeats:4,moveLead:.25,moveDuration:.18,attackOffset:-.125,flatThreshold:.025,bobAmplitude:.012,bobPeriod:3,hitDx:130,hitDy:0,background:'#dedfe9',tail:1,start:0,end:0,debug:false,enabledMonsters:[]};
export const limits={fxFadeDuration:[.01,10],fxFadeDelay:[0,10],outputWidth:[64,4096],outputHeight:[64,4096],aspectRatio:[.1,10],outputFps:[1,120],stepFps:[1,120],floatAmplitude:[0,.3],floatPeriod:[.1,30],entranceDuration:[0,10],entranceLead:[0,10],exitDuration:[.01,10],characterX:[0,1],hitX:[.05,.95],top:[0,1],bottom:[0,1],characterScale:[.05,3],monsterScale:[.05,3],fxScale:[.05,3],travelBeats:[.1,32],moveLead:[0,5],moveDuration:[.01,5],attackOffset:[-5,5],flatThreshold:[0,1],bobAmplitude:[0,.2],bobPeriod:[.1,30],hitDx:[-1920,1920],hitDy:[-1080,1080],tail:[0,20],start:[0,86400],end:[0,86400]};
export function validateSettings(value){if(!value||typeof value!=='object')throw Error('渲染参数无效');const p={...defaults,...value};delete p.countdown;for(const [k,[min,max]]of Object.entries(limits))if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error(`参数 ${k} 超出范围`);if(!['hit','miss'].includes(p.mode)||p.top>=p.bottom||!/^#[0-9a-f]{6}$/i.test(p.background)||typeof p.exitEnabled!=='boolean'||typeof p.debug!=='boolean'||!Array.isArray(p.enabledMonsters)||!p.enabledMonsters.every(n=>typeof n==='string'))throw Error('渲染配置无效');if(!['mp4','zip','folder'].includes(p.exportFormat))throw Error('导出格式无效');if(!['free','locked'].includes(p.dimensionMode)||!['normal','stepped'].includes(p.exportMode)||!['showCharacter','showMonsters','showFx','monsterFloat','fxFade','fxHoldLast','fxRandomRotation'].every(k=>typeof p[k]==='boolean')||!Number.isInteger(p.outputWidth)||!Number.isInteger(p.outputHeight))throw Error('输出参数无效');if(p.end&&p.end<=p.start)throw Error('片段结束必须晚于开始');return p;}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ease=v=>1-(1-clamp(v,0,1))**3;
export const noteTime=(n,m)=>m.offsetSeconds+n.tick*60/(m.bpm*m.ppq);
export function hash(seed,id){let h=(2166136261^(seed>>>0))>>>0;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;return h>>>0;}
export function lastAt(list,t,key){let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid][key]<=t)lo=mid+1;else hi=mid;}return lo-1;}
function bob(t,p){return p.bobAmplitude*Math.sin(2*Math.PI*t/p.bobPeriod);}
function moveY(e,t,p){if(!e)return .5+bob(t,p);const end=e.move+p.moveDuration;if(t<end)return e.from+(e.height-e.from)*ease((t-e.move)/p.moveDuration);return e.height;}
function actorY(movement,attack,t,p){let y=moveY(movement,t,p);const moving=movement&&t<movement.move+p.moveDuration;const attacking=attack&&t<attack.attackEnd;if(!moving&&!attacking){const rest=Math.max(movement?movement.move+p.moveDuration:0,attack?attack.attackEnd:0);y=(movement?movement.height:.5)+bob(t-rest,p);}return y;}
export function compile(chart,p,counts=[4,5,5,5,3],fps=8){const notes=chart.notes.map(n=>({...n,time:noteTime(n,chart.meta)})).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));const origin=gridOrigin(chart,p);const events=[];for(const n of notes){const move=n.time-p.moveLead;const previous=events.at(-1);const attackIndex=lastAt(events,move,'attack');const from=actorY(previous,events[attackIndex],move,p);const delta=n.height-from;const action=Math.abs(delta)<=p.flatThreshold?3:delta<0?1:2;const rawAttack=n.time+p.attackOffset;const attack=p.exportMode==='stepped'?Math.ceil((rawAttack-origin)*p.stepFps-1e-8)/p.stepFps+origin:rawAttack;events.push({...n,move,from,action,attack,attackEnd:attack+(counts[action]||1)/fps});}return events;}
export function actorAt(events,t,p,counts,fps){if(p.mode==='miss')return{height:.5+bob(t,p),slot:6,frame:0};const movement=events[lastAt(events,t,'move')],attack=events[lastAt(events,t,'attack')];let slot=0,index=Math.floor(t*fps);if(attack&&t<attack.attackEnd){slot=attack.action;index=Math.floor((t-attack.attack)*fps+1e-8);}return{height:actorY(movement,attack,t,p),slot,frame:((index%counts[slot])+counts[slot])%counts[slot]};}
export function monsterAt(event,t,p,bpm,radius=0){const width=logicalWidth(p),travel=p.travelBeats*60/bpm,speed=(width-p.hitX*width)/travel;const x=p.hitX*width+(event.time-t)*speed;return{x,visible:x-radius<=width&&(p.mode==='miss'?x+radius>=0:t<event.time)};}
export function hitConflicts(events){for(let i=1;i<events.length;i++)if(events[i].time===events[i-1].time)return true;return false;}

// Times are absolute music seconds; evaluating a seek never depends on prior frames.
export function transitionTimes(events,p,counts,fps){
 const selected=events.filter(e=>e.time>=p.start&&(!p.end||e.time<=p.end));
 const first=selected[0],last=selected.at(-1);
 if(!first)return null;
 const enterEnd=first.time-p.entranceLead;
 const leaveStart=p.mode==='hit'?Math.max(last.attackEnd,last.move+p.moveDuration,last.time+effectDuration(p,counts[4],fps)):last.time;
 return {enterStart:enterEnd-p.entranceDuration,enterEnd,leaveStart,leaveEnd:leaveStart+p.exitDuration};
}
export function actorXAt(t,p,times,radius){
 const target=p.characterX*logicalWidth(p),offscreen=-radius-1;
 if(!times)return target;
 if(t<times.enterEnd){if(p.entranceDuration===0)return offscreen;const u=clamp((t-times.enterStart)/p.entranceDuration,0,1);return offscreen+(target-offscreen)*(1-(1-u)**3);}
 if(p.exitEnabled&&t>=times.leaveStart){const u=clamp((t-times.leaveStart)/p.exitDuration,0,1);return target+(offscreen-target)*u**3;}
 return target;
}
export function compositionRange(centerPercent,heightPercent){return {top:(centerPercent-heightPercent/2)/100,bottom:(centerPercent+heightPercent/2)/100};}

export function logicalWidth(p){return HEIGHT*(p.outputWidth??1920)/(p.outputHeight??1080);}
export function gridOrigin(chart,p){const first=chart?.notes.map(n=>noteTime(n,chart.meta)).filter(t=>t>=p.start&&(!p.end||t<=p.end)).sort((a,b)=>a-b)[0];return Math.min(p.start,first==null?p.start:first-p.entranceLead-p.entranceDuration);}
export function sampledTime(t,p,origin){return p.exportMode==='stepped'?origin+Math.floor((t-origin)*p.stepFps+1e-8)/p.stepFps:t;}
export function monsterDrift(event,t,p,seed,bpm){if(!p.monsterFloat)return 0;const phase=hash(seed,event.id+':float')/4294967296*Math.PI*2;const remaining=clamp((event.time-t)/Math.min(.5,p.travelBeats*60/bpm*.25),0,1);const envelope=p.mode==='hit'?remaining*remaining*(3-2*remaining):1;return HEIGHT*p.floatAmplitude*Math.sin(t*2*Math.PI/p.floatPeriod+phase)*envelope;}

export function effectDuration(p,count,fps){const duration=count/fps;return p.fxFade?(p.fxHoldLast?p.fxFadeDelay+p.fxFadeDuration:Math.min(duration,p.fxFadeDelay+p.fxFadeDuration)):duration;}
export function effectAt(age,p,count,fps){
 if(age<0||age>=effectDuration(p,count,fps))return null;
 return {frame:Math.min(count-1,Math.floor(age*fps+1e-8)),alpha:p.fxFade?Math.max(0,Math.min(1,1-(age-p.fxFadeDelay)/p.fxFadeDuration)):1};
}

export function effectRotation(seed,id,p){return p.fxRandomRotation?hash(seed,id+':fx-rotation')/4294967296*360:0;}
