export const names = ['待机','上打','下劈','平砍','命中特效','怪物','人物立绘'];
export const naturalSort = files => [...files].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
export const defaults = (w,h) => ({scale:1,rotation:0,anchor:{x:w/2,y:h/2},crop:{x:0,y:0,w,h}});
export function transformPoint(x,y,t) { const a=t.rotation*Math.PI/180; x=(x-t.anchor.x)*t.scale;y=(y-t.anchor.y)*t.scale;return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)}; }
export function parseConfig(text){
 const c=JSON.parse(text);
 if(!c||![1,2].includes(c.version)||!Array.isArray(c.slots)||c.slots.length!==(c.version===1?6:7))throw Error('不支持的配置格式');
 if(c.version===1){c.slots.push({files:[],transforms:[]});c.version=2;c.mode='hit';}
 if(!['hit','miss'].includes(c.mode))throw Error('素材模式无效');
 const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
 for(const [i,s] of c.slots.entries()){
  if(!s||!Array.isArray(s.files)||s.files.length>200||!s.files.every(f=>typeof f==='string'&&f.length>0)||new Set(s.files).size!==s.files.length)throw Error('素材列表无效');
  if(s.images!==undefined&&(!Array.isArray(s.images)||s.images.length!==s.files.length||s.images.some(v=>!v||typeof v.data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.data)||(v.path!==undefined&&typeof v.path!=='string'))))throw Error('内嵌图片无效');
  if(i===6&&s.files.length>1)throw Error('人物立绘只能导入一张图片');
  const count=s.files.length?(i===5?s.files.length:1):0;
  if(!Array.isArray(s.transforms)||s.transforms.length!==count)throw Error('变换数量无效');
  for(const t of s.transforms){if(!t||!num(t.scale,.05,5)||!num(t.rotation,-180,180)||!t.anchor||!t.crop||!num(t.anchor.x,-100000,100000)||!num(t.anchor.y,-100000,100000)||!num(t.crop.x,0,100000)||!num(t.crop.y,0,100000)||!num(t.crop.w,1,100000)||!num(t.crop.h,1,100000))throw Error('变换参数无效');}
 }
 if(!num(c.fps,1,60))throw Error('帧率无效');
 return c;
}
