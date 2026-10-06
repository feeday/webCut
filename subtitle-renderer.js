(function(root){
 'use strict';
 const fonts={sans:'"Microsoft YaHei", "Noto Sans CJK SC", sans-serif',serif:'SimSun, "Noto Serif CJK SC", serif',kai:'KaiTi, STKaiti, serif',arial:'Arial, sans-serif'};
 const defaults={font:'sans',size:4.5,x:50,y:90,color:'#ffffff',bold:true};
 const clamp=(v,a,b,d)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):d;
 function style(s={}){return {font:fonts[s.font]?s.font:defaults.font,size:clamp(s.size,1,15,defaults.size),x:clamp(s.x,0,100,50),y:clamp(s.y,0,100,90),color:/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:defaults.color,bold:s.bold!==false};}
 function segments(cues,duration){
  const valid=cues.filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&c.end>0&&c.start<duration&&String(c.text).trim());
  const times=[...new Set([0,duration,...valid.flatMap(c=>[Math.max(0,c.start),Math.min(duration,c.end)])])].sort((a,b)=>a-b);
  return times.slice(0,-1).map((start,i)=>({start,end:times[i+1],text:valid.filter(c=>c.start<=start&&c.end>start).map(c=>c.text).join('\n')}));
 }
 function paint(canvas,text,raw,W,H){
  const s=style(raw);canvas.width=W;canvas.height=H;const g=canvas.getContext('2d');g.clearRect(0,0,W,H);if(!text)return;
  let size=Math.max(1,H*s.size/100),lines;
  function layout(){g.font=`${s.bold?'700':'400'} ${size}px ${fonts[s.font]}`;lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(line&&g.measureText(line+char).width>W*.9){lines.push(line);line='';}line+=char;}lines.push(line);}}
  layout();while(lines.length*size*1.3>H*.9&&size>1){size*=.85;layout();}
  const lineHeight=size*1.3,boxHeight=lines.length*lineHeight,pad=Math.max(1,size*.1);
  const maxWidth=Math.max(...lines.map(line=>g.measureText(line).width));
  const x=Math.max(maxWidth/2+pad,Math.min(W-maxWidth/2-pad,W*s.x/100));
  const top=Math.max(pad,Math.min(H-boxHeight-pad,H*s.y/100-boxHeight/2));
  g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.strokeStyle='#000000';g.lineWidth=Math.max(1,size*.1);g.fillStyle=s.color;
  lines.forEach((line,i)=>{const y=top+(i+.5)*lineHeight;g.strokeText(line,x,y);g.fillText(line,x,y);});
 }
 async function prepare(ff,cues,raw,W,H,duration,progress){
  await document.fonts?.ready;
  const list=segments(cues,duration),canvas=document.createElement('canvas'),files=[],images=new Map();
  try{
   for(let i=0;i<list.length;i++){
    const segment=list[i];let name=images.get(segment.text);
    if(!name){name=`webcut_sub_${images.size}.png`;paint(canvas,segment.text,raw,W,H);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('字幕绘制失败')),'image/png'));await ff.writeFile(name,new Uint8Array(await blob.arrayBuffer()));files.push(name);images.set(segment.text,name);}
    segment.file=name;progress?.(`正在绘制字幕 ${i+1}/${list.length}…`);
   }
   const manifest='webcut_subtitles.txt';
   const body=list.map(s=>`file '${s.file}'\noption framerate 1000\nduration ${(s.end-s.start).toFixed(6)}\n`).join('')+`file '${list.at(-1).file}'\noption framerate 1000\n`;
   await ff.writeFile(manifest,new TextEncoder().encode(body));files.push(manifest);return {manifest,files};
  }catch(e){for(const file of files)try{await ff.deleteFile(file)}catch{}throw e;}
 }
 const api={fonts,defaults,style,segments,paint,prepare};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WebCutSubtitleRenderer=api;
})(globalThis);
