import {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,QUALITY_HIGH,canEncodeVideo,canEncodeAudio} from 'mediabunny';
export async function createMp4(canvas,rate,audioBuffer){
 if(canvas.width%2||canvas.height%2)throw Error('MP4 的宽和高需为偶数，请调整分辨率');
 const [videoOK,audioOK]=await Promise.all([canEncodeVideo('avc',{width:canvas.width,height:canvas.height,frameRate:rate}),canEncodeAudio('aac',{sampleRate:audioBuffer.sampleRate,numberOfChannels:audioBuffer.numberOfChannels})]);
 if(!videoOK||!audioOK)throw Error('当前浏览器不支持所需的 H.264 / AAC 编码，请用桌面 Chrome 或 Edge，或导出 PNG');
 const target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target});
 const video=new CanvasSource(canvas,{codec:'avc',quality:QUALITY_HIGH});
 const audio=new AudioBufferSource({codec:'aac',quality:QUALITY_HIGH});
 output.addVideoTrack(video,{frameRate:rate});output.addAudioTrack(audio);await output.start();
 return {addFrame:(i)=>video.add(i/rate,1/rate),
 async finish(frameCount,origin,clipStart,clipEnd,cancelled,progress){
  const sr=audioBuffer.sampleRate,total=Math.ceil(frameCount/rate*sr),channels=audioBuffer.numberOfChannels;
  for(let start=0;start<total;start+=sr){
   if(cancelled()){await output.cancel();return null;}
   const length=Math.min(sr,total-start),b=new AudioBuffer({length,sampleRate:sr,numberOfChannels:channels});
   for(let c=0;c<channels;c++){const src=audioBuffer.getChannelData(c),dest=b.getChannelData(c);for(let i=0;i<length;i++){const time=origin+(start+i)/sr;const index=Math.round(time*sr);if(time>=clipStart&&time<clipEnd&&index>=0&&index<src.length)dest[i]=src[index];}}
   await audio.add(b);progress(Math.min(total,start+length)/total);await new Promise(r=>setTimeout(r,0));
  }
  await output.finalize();return new Blob([target.buffer],{type:'video/mp4'});
 },cancel:()=>output.cancel()};
}
