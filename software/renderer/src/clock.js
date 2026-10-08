export class Clock {
 context=null;source=null;buffer=null;playing=false;position=0;anchor=0;offset=0;until=0;token=0;
 get ctx(){return this.context??=new AudioContext();}
 async decode(file){return this.ctx.decodeAudioData(await file.arrayBuffer());}
 get time(){return this.playing?Math.min(this.until,this.offset+this.ctx.currentTime-this.anchor):this.position;}
 pause(){this.token++;this.position=this.time;this.playing=false;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
 seek(t){this.pause();this.position=t;}
 async play(from,audioStart,audioEnd,until){this.pause();const token=++this.token;await this.ctx.resume();if(token!==this.token)return;this.offset=from;this.anchor=this.ctx.currentTime;this.position=from;this.until=until;this.playing=true;const offset=Math.max(from,audioStart,0);if(this.buffer&&offset<Math.min(audioEnd,this.buffer.duration)){const s=this.ctx.createBufferSource();s.buffer=this.buffer;s.connect(this.ctx.destination);s.start(this.anchor+Math.max(0,offset-from),offset,Math.min(audioEnd,this.buffer.duration)-offset);this.source=s;}}
}
