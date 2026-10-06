(function(root){
'use strict';
async function recognize({snapshot,chunkSeconds,transport,signal,settings,onProgress=()=>{},encode}){
if(!Number.isFinite(chunkSeconds)||chunkSeconds<2||chunkSeconds>30)throw Error('每段秒数需要在 2–30 之间');
if(!snapshot.samples?.length||snapshot.end<=snapshot.start)throw Error('没有可识别的音频');
const cues=[],count=Math.ceil((snapshot.end-snapshot.start)/chunkSeconds);for(let i=0;i<count;i++){
if(signal?.aborted)throw new DOMException('已取消','AbortError');const start=snapshot.start+i*chunkSeconds,end=Math.min(snapshot.end,start+chunkSeconds);
onProgress({index:i+1,count,start,end});const pcm=snapshot.samples.slice(Math.round(start*snapshot.rate),Math.round(end*snapshot.rate));
const text=await transport.recognize(new Blob([encode([pcm],snapshot.rate)],{type:'audio/wav'}),settings);
if(signal?.aborted)throw new DOMException('已取消','AbortError');if(text?.trim())cues.push({start,end,text:text.trim()});
}if(!cues.length)throw Error('没有识别到文字');return cues;
}
const api={recognize};if(typeof module==='object')module.exports=api;else root.AudioASR=api;
})(globalThis);
