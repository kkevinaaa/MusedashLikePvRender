// ZIP store entries. PNG is already compressed; parts bound browser memory use.
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
export class ZipWriter{
 constructor(){this.chunks=[];this.central=[];this.size=0;this.count=0;}
 add(name,data){const nameBytes=new TextEncoder().encode(name);const crc=crc32(data);const h=header(30);const v=h.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,nameBytes.length,true);const c=header(46);const d=c.view;d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,nameBytes.length,true);d.setUint32(42,this.size,true);this.chunks.push(h.bytes,nameBytes,data);this.central.push(c.bytes,nameBytes);this.size+=30+nameBytes.length+data.length;this.count++;}
 finish(){const size=this.central.reduce((n,b)=>n+b.length,0);const h=header(22),v=h.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,this.count,true);v.setUint16(10,this.count,true);v.setUint32(12,size,true);v.setUint32(16,this.size,true);return new Blob([...this.chunks,...this.central,h.bytes],{type:'application/zip'});}
}
