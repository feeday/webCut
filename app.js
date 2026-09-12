import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js';
import { toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'openFilesBtn','openFolderBtn','asrBtn','exportBtn','fileInput','assetList','categoryFilter','addCategoryBtn','assetCategory',
  'video','audio','emptyPreview','playBtn','prevFrameBtn','nextFrameBtn','timeText','fpsInput','fileName','inPoint','outPoint',
  'setInBtn','setOutBtn','splitBtn','deleteClipBtn','undoBtn','timeline','ruler','videoTrack','subtitleTrack','waveCanvas','playhead',
  'subtitleList','addSubtitleBtn','exportSrtBtn','storyboardBtn','storyboardDialog','storyInterval','generateStoryboardBtn','storyboardGrid',
  'asrDialog','asrUrl','asrToken','asrField','saveAsrConfigBtn','runAsrBtn','asrStatus','exportDialog','exportType','exportFormat',
  'runExportBtn','exportStatus'
].map(id => [id, $(id)]));

const state = {
  assets: [],
  currentIndex: -1,
  duration: 0,
  clips: [],
  subtitles: [],
  selectedClip: -1,
  undo: [],
  categories: JSON.parse(localStorage.getItem('webcut.categories') || '["未分类","人物","动物","风景","动漫","商品","其他"]'),
  ffmpeg: null,
  ffmpegLoaded: false,
  objectUrl: null,
};

function fmt(t=0){
  t = Math.max(0, Number(t)||0);
  const m = Math.floor(t/60), s = Math.floor(t%60), ms = Math.floor((t%1)*1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
function esc(s=''){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function currentAsset(){return state.assets[state.currentIndex] || null;}
function currentMedia(){const a=currentAsset(); return a?.kind==='audio' ? els.audio : els.video;}
function currentTime(){return currentMedia()?.currentTime || 0;}
function saveCategories(){localStorage.setItem('webcut.categories', JSON.stringify(state.categories));}
function assetKey(file){return `webcut.asset.${file.name}.${file.size}.${file.lastModified}`;}
function saveAssetMeta(asset){localStorage.setItem(assetKey(asset.file), JSON.stringify({category:asset.category}));}

function rebuildCategoryUI(){
  const options = state.categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  els.assetCategory.innerHTML = options;
  els.categoryFilter.innerHTML = `<option value="all">全部分类</option>${options}`;
}
rebuildCategoryUI();

els.openFilesBtn.onclick = () => els.fileInput.click();
els.fileInput.onchange = e => addFiles([...e.target.files]);
els.openFolderBtn.onclick = async () => {
  if(!window.showDirectoryPicker){ alert('当前浏览器不支持文件夹访问，请使用最新版 Chrome / Edge。'); return; }
  try{
    const dir = await window.showDirectoryPicker();
    const files=[];
    for await(const entry of dir.values()){
      if(entry.kind==='file'){
        const f=await entry.getFile();
        if(f.type.startsWith('video/')||f.type.startsWith('audio/')||/\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|flac|aac|opus)$/i.test(f.name)) files.push(f);
      }
    }
    addFiles(files);
  }catch(e){ if(e.name!=='AbortError') alert(e.message); }
};

function addFiles(files){
  for(const file of files){
    const saved = JSON.parse(localStorage.getItem(assetKey(file)) || '{}');
    state.assets.push({file, kind:file.type.startsWith('audio/')?'audio':'video', category:saved.category||'未分类'});
  }
  renderAssets();
  if(state.currentIndex<0 && state.assets.length) selectAsset(0);
}

function renderAssets(){
  const filter=els.categoryFilter.value;
  const items=state.assets.map((a,i)=>({a,i})).filter(x=>filter==='all'||x.a.category===filter);
  if(!items.length){els.assetList.className='asset-list empty';els.assetList.textContent='暂无素材';return;}
  els.assetList.className='asset-list';
  els.assetList.innerHTML=items.map(({a,i})=>`<div class="asset-item ${i===state.currentIndex?'active':''}" data-i="${i}">
    <div class="asset-thumb"></div><div class="asset-meta"><div class="asset-name">${esc(a.file.name)}</div><div class="asset-cat">${esc(a.category)} · ${(a.file.size/1024/1024).toFixed(1)} MB</div></div></div>`).join('');
  els.assetList.querySelectorAll('.asset-item').forEach(el=>el.onclick=()=>selectAsset(Number(el.dataset.i)));
}
els.categoryFilter.onchange=renderAssets;
els.addCategoryBtn.onclick=()=>{
  const name=prompt('分类名称'); if(!name) return;
  if(!state.categories.includes(name)) state.categories.push(name);
  saveCategories(); rebuildCategoryUI(); renderAssets();
};
els.assetCategory.onchange=()=>{ const a=currentAsset(); if(!a)return; a.category=els.assetCategory.value; saveAssetMeta(a); renderAssets(); };

async function selectAsset(i){
  if(i<0||i>=state.assets.length)return;
  state.currentIndex=i; state.duration=0; state.clips=[]; state.subtitles=[]; state.selectedClip=-1; state.undo=[];
  if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  const a=currentAsset(); state.objectUrl=URL.createObjectURL(a.file);
  els.fileName.textContent=a.file.name; els.assetCategory.value=a.category;
  const isAudio=a.kind==='audio';
  els.video.classList.toggle('hidden',isAudio); els.audio.classList.toggle('hidden',!isAudio); els.emptyPreview.classList.add('hidden');
  const media=currentMedia(); media.src=state.objectUrl; media.controls=false;
  await new Promise(resolve=>{ media.onloadedmetadata=resolve; media.onerror=resolve; });
  state.duration=Number.isFinite(media.duration)?media.duration:0;
  els.inPoint.value='0.000'; els.outPoint.value=state.duration.toFixed(3);
  state.clips=[{start:0,end:state.duration,deleted:false}];
  renderAssets(); renderAll(); drawWaveform(a.file).catch(()=>drawFlatWave());
}

function pushUndo(){state.undo.push(JSON.stringify({clips:state.clips,subtitles:state.subtitles})); if(state.undo.length>30)state.undo.shift();}
els.undoBtn.onclick=()=>{const x=state.undo.pop();if(!x)return;const v=JSON.parse(x);state.clips=v.clips;state.subtitles=v.subtitles;state.selectedClip=-1;renderAll();};

function renderAll(){renderRuler();renderClips();renderSubtitles();updatePlayhead();updateTime();}
function renderRuler(){
  const d=Math.max(state.duration,1), marks=10; els.ruler.innerHTML='';
  for(let i=0;i<=marks;i++){const s=document.createElement('span');s.style.cssText=`position:absolute;left:${i/marks*100}%;top:8px;font-size:10px;color:#8a929b`;s.textContent=fmt(d*i/marks).slice(0,5);els.ruler.appendChild(s);}
}
function renderClips(){
  els.videoTrack.innerHTML=''; const d=Math.max(state.duration,0.001);
  state.clips.forEach((c,i)=>{const el=document.createElement('div');el.className=`clip ${i===state.selectedClip?'selected':''} ${c.deleted?'deleted':''}`;el.style.left=`${c.start/d*100}%`;el.style.width=`${Math.max(.2,(c.end-c.start)/d*100)}%`;el.textContent=`${fmt(c.start)} → ${fmt(c.end)}`;el.onclick=()=>{state.selectedClip=i;renderClips()};els.videoTrack.appendChild(el);});
}
function renderSubtitles(){
  const d=Math.max(state.duration,0.001); els.subtitleTrack.innerHTML='';
  state.subtitles.forEach((s,i)=>{const b=document.createElement('div');b.className='subtitle-block';b.style.left=`${s.start/d*100}%`;b.style.width=`${Math.max(.4,(s.end-s.start)/d*100)}%`;b.textContent=s.text;b.onclick=()=>{currentMedia().currentTime=s.start;updatePlayhead()};els.subtitleTrack.appendChild(b);});
  if(!state.subtitles.length){els.subtitleList.className='subtitle-list empty';els.subtitleList.textContent='暂无字幕';return;}
  els.subtitleList.className='subtitle-list';
  els.subtitleList.innerHTML=state.subtitles.map((s,i)=>`<div class="subtitle-item" data-i="${i}"><div class="subtitle-time"><input class="sub-start" type="number" step="0.01" value="${s.start.toFixed(3)}"><input class="sub-end" type="number" step="0.01" value="${s.end.toFixed(3)}"></div><textarea class="sub-text">${esc(s.text)}</textarea><button class="sub-del">删除</button></div>`).join('');
  els.subtitleList.querySelectorAll('.subtitle-item').forEach(el=>{
    const i=Number(el.dataset.i), s=state.subtitles[i];
    el.querySelector('.sub-start').onchange=e=>{s.start=Number(e.target.value);renderSubtitles()};
    el.querySelector('.sub-end').onchange=e=>{s.end=Number(e.target.value);renderSubtitles()};
    el.querySelector('.sub-text').oninput=e=>{s.text=e.target.value;renderSubtitleTrackOnly()};
    el.querySelector('.sub-del').onclick=()=>{pushUndo();state.subtitles.splice(i,1);renderSubtitles()};
  });
}
function renderSubtitleTrackOnly(){
  const d=Math.max(state.duration,0.001); els.subtitleTrack.innerHTML='';
  state.subtitles.forEach(s=>{const b=document.createElement('div');b.className='subtitle-block';b.style.left=`${s.start/d*100}%`;b.style.width=`${Math.max(.4,(s.end-s.start)/d*100)}%`;b.textContent=s.text;els.subtitleTrack.appendChild(b);});
}

function updateTime(){const m=currentMedia();els.timeText.textContent=`${fmt(m?.currentTime||0)} / ${fmt(state.duration)}`;}
function updatePlayhead(){const pct=state.duration?currentTime()/state.duration*100:0;els.playhead.style.left=`calc(68px + (100% - 68px) * ${pct/100})`;updateTime();}
['video','audio'].forEach(k=>{els[k].ontimeupdate=updatePlayhead;els[k].onplay=()=>els.playBtn.textContent='❚❚';els[k].onpause=()=>els.playBtn.textContent='▶';});
els.playBtn.onclick=()=>{const m=currentMedia();if(!m)return;m.paused?m.play():m.pause()};
function stepFrame(dir){const m=currentMedia();if(!m)return;const fps=Math.max(1,Number(els.fpsInput.value)||30);m.pause();m.currentTime=Math.min(state.duration,Math.max(0,m.currentTime+dir/fps));}
els.prevFrameBtn.onclick=()=>stepFrame(-1);els.nextFrameBtn.onclick=()=>stepFrame(1);
els.timeline.onclick=e=>{if(e.target.closest('.clip,.subtitle-block'))return;const r=els.timeline.getBoundingClientRect();const x=Math.max(0,e.clientX-r.left-68);const w=Math.max(1,r.width-68);const m=currentMedia();if(m)m.currentTime=Math.min(state.duration,x/w*state.duration);};

els.setInBtn.onclick=()=>els.inPoint.value=currentTime().toFixed(3);
els.setOutBtn.onclick=()=>els.outPoint.value=currentTime().toFixed(3);
function splitAt(t){
  const i=state.clips.findIndex(c=>!c.deleted&&t>c.start+0.001&&t<c.end-0.001);if(i<0)return;
  pushUndo();const c=state.clips[i];state.clips.splice(i,1,{...c,end:t},{...c,start:t});state.selectedClip=i+1;renderClips();
}
els.splitBtn.onclick=()=>splitAt(currentTime());
els.deleteClipBtn.onclick=()=>{if(state.selectedClip<0)return;pushUndo();state.clips[state.selectedClip].deleted=true;renderClips();};

els.addSubtitleBtn.onclick=()=>{pushUndo();const t=currentTime();state.subtitles.push({start:t,end:Math.min(state.duration,t+2),text:'新字幕'});state.subtitles.sort((a,b)=>a.start-b.start);renderSubtitles();};
els.exportSrtBtn.onclick=()=>{
  const srt=state.subtitles.map((s,i)=>`${i+1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text}\n`).join('\n');downloadBlob(new Blob([srt],{type:'text/plain;charset=utf-8'}),baseName()+'.srt');
};
function toSrtTime(t){const h=Math.floor(t/3600);t%=3600;const m=Math.floor(t/60);const s=Math.floor(t%60);const ms=Math.floor((t%1)*1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;}

async function drawWaveform(file){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();const buf=await file.arrayBuffer();const audio=await ctx.decodeAudioData(buf.slice(0));const data=audio.getChannelData(0);const c=els.waveCanvas, dpr=devicePixelRatio||1;c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;const g=c.getContext('2d');g.scale(dpr,dpr);g.clearRect(0,0,c.clientWidth,c.clientHeight);g.strokeStyle='#8061c9';g.lineWidth=1;const mid=c.clientHeight/2, step=Math.max(1,Math.floor(data.length/c.clientWidth));g.beginPath();for(let x=0;x<c.clientWidth;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;if(v<min)min=v;if(v>max)max=v;}g.moveTo(x,mid+min*mid*.85);g.lineTo(x,mid+max*mid*.85);}g.stroke();ctx.close();
}
function drawFlatWave(){const c=els.waveCanvas;c.width=c.clientWidth;c.height=c.clientHeight;const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.strokeStyle='#aaa';g.beginPath();g.moveTo(0,c.height/2);g.lineTo(c.width,c.height/2);g.stroke();}

els.storyboardBtn.onclick=()=>els.storyboardDialog.showModal();
els.generateStoryboardBtn.onclick=generateStoryboard;
async function generateStoryboard(){
  const a=currentAsset();if(!a||a.kind!=='video'){alert('故事板仅支持视频');return;}const v=els.video, interval=Math.max(.1,Number(els.storyInterval.value)||1);const was=v.currentTime;v.pause();els.storyboardGrid.innerHTML='生成中…';const cards=[];const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const g=canvas.getContext('2d');const times=[];for(let t=0;t<state.duration;t+=interval)times.push(t);const limit=200;for(const t of times.slice(0,limit)){await seekVideo(v,t);g.drawImage(v,0,0,canvas.width,canvas.height);cards.push({t,url:canvas.toDataURL('image/jpeg',.72)});}els.storyboardGrid.innerHTML=cards.map((x,i)=>`<div class="story-card" data-t="${x.t}"><img src="${x.url}"><div>${fmt(x.t)} · 帧 ${Math.round(x.t*(Number(els.fpsInput.value)||30))}</div></div>`).join('');els.storyboardGrid.querySelectorAll('.story-card').forEach(c=>c.onclick=()=>{v.currentTime=Number(c.dataset.t);els.storyboardDialog.close();});v.currentTime=was;
}
function seekVideo(v,t){return new Promise(r=>{const fn=()=>{v.removeEventListener('seeked',fn);r()};v.addEventListener('seeked',fn);v.currentTime=Math.min(Math.max(0,t),Math.max(0,state.duration-.001));});}

els.asrBtn.onclick=()=>{const cfg=JSON.parse(localStorage.getItem('webcut.asr')||'{}');els.asrUrl.value=cfg.url||'';els.asrToken.value=cfg.token||'';els.asrField.value=cfg.field||'file';els.asrDialog.showModal();};
els.saveAsrConfigBtn.onclick=saveAsrConfig;
function saveAsrConfig(){localStorage.setItem('webcut.asr',JSON.stringify({url:els.asrUrl.value.trim(),token:els.asrToken.value.trim(),field:els.asrField.value.trim()||'file'}));els.asrStatus.textContent='配置已保存';}
els.runAsrBtn.onclick=async()=>{
  const a=currentAsset();if(!a)return;saveAsrConfig();const url=els.asrUrl.value.trim();if(!url){els.asrStatus.textContent='请填写 API 地址';return;}
  try{els.asrStatus.textContent='正在本地提取 16k 单声道 WAV…';const wav=await extractWav(a.file);els.asrStatus.textContent=`已提取 ${(wav.size/1024/1024).toFixed(1)} MB，正在调用 ASR…`;const form=new FormData();form.append(els.asrField.value.trim()||'file',wav,baseName()+'.wav');const headers={};if(els.asrToken.value.trim())headers.Authorization=`Bearer ${els.asrToken.value.trim()}`;const res=await fetch(url,{method:'POST',headers,body:form});const raw=await res.text();if(!res.ok)throw new Error(`${res.status} ${raw.slice(0,500)}`);let data;try{data=JSON.parse(raw)}catch{data={text:raw}};const parsed=parseAsr(data);pushUndo();state.subtitles=parsed.segments.length?parsed.segments:[{start:0,end:state.duration,text:parsed.text||''}];renderSubtitles();els.asrStatus.textContent=`完成：${parsed.text||state.subtitles.map(x=>x.text).join(' ')}`;
  }catch(e){els.asrStatus.textContent='失败：'+e.message;}
};
function parseAsr(data){
  const root=data?.data??data?.result??data;const text=root?.text??root?.transcript??data?.text??'';let seg=root?.segments??root?.chunks??root?.words??[];
  seg=(Array.isArray(seg)?seg:[]).map(x=>({start:Number(x.start??x.start_time??x.timestamp?.[0]??0),end:Number(x.end??x.end_time??x.timestamp?.[1]??0),text:String(x.text??x.word??'')})).filter(x=>x.text);
  if(seg.length&&seg.every(x=>x.end<=x.start)){for(let i=0;i<seg.length;i++){seg[i].start=i?seg[i-1].end:0;seg[i].end=seg[i].start+Math.max(.2,state.duration/seg.length)}}
  return {text:String(text||seg.map(x=>x.text).join(' ')),segments:seg};
}

els.exportBtn.onclick=()=>els.exportDialog.showModal();
els.runExportBtn.onclick=async()=>{
  const a=currentAsset();if(!a)return;try{els.exportStatus.textContent='正在准备 FFmpeg…';const ff=await getFFmpeg();const inputExt=(a.file.name.split('.').pop()||'bin').toLowerCase();const inName=`input.${inputExt}`;await safeDelete(ff,inName);await ff.writeFile(inName,new Uint8Array(await a.file.arrayBuffer()));const keep=state.clips.filter(c=>!c.deleted&&c.end>c.start);if(!keep.length)throw new Error('没有可导出的片段');const type=els.exportType.value;let fmt=els.exportFormat.value;if(fmt==='original')fmt=type==='audio'?'wav':inputExt;let out=`output.${fmt}`;await safeDelete(ff,out);els.exportStatus.textContent='正在本机转码 / 剪辑…';const one=keep.length===1?keep[0]:null;let args;
    if(one){args=['-ss',one.start.toFixed(3),'-to',one.end.toFixed(3),'-i',inName];if(type==='audio'){args.push('-vn');if(fmt==='wav')args.push('-c:a','pcm_s16le');else if(fmt==='mp3')args.push('-c:a','libmp3lame','-q:a','2');else if(fmt==='flac')args.push('-c:a','flac');else args.push('-c:a','aac','-b:a','192k');}else if(els.exportFormat.value==='original'){args.push('-c','copy');}else{args.push('-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k');}args.push(out);}else{args=buildMultiClipArgs(inName,out,keep,type,fmt);}
    await ff.exec(args);const data=await ff.readFile(out);const mime=type==='audio'?`audio/${fmt}`:`video/${fmt}`;downloadBlob(new Blob([data.buffer],{type:mime}),`${baseName()}_cut.${fmt}`);els.exportStatus.textContent='导出完成。';
  }catch(e){els.exportStatus.textContent='导出失败：'+e.message;}
};
function buildMultiClipArgs(input,out,clips,type,fmt){
  if(type==='audio'){
    const filters=clips.map((c,i)=>`[0:a]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS[a${i}]`).join(';');const ins=clips.map((_,i)=>`[a${i}]`).join('');return ['-i',input,'-filter_complex',`${filters};${ins}concat=n=${clips.length}:v=0:a=1[a]`,'-map','[a]',...(fmt==='wav'?['-c:a','pcm_s16le']:fmt==='mp3'?['-c:a','libmp3lame','-q:a','2']:fmt==='flac'?['-c:a','flac']:['-c:a','aac','-b:a','192k']),out];
  }
  const filters=clips.map((c,i)=>`[0:v]trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS[a${i}]`).join(';');const ins=clips.map((_,i)=>`[v${i}][a${i}]`).join('');return ['-i',input,'-filter_complex',`${filters};${ins}concat=n=${clips.length}:v=1:a=1[v][a]`,'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k',out];
}

async function extractWav(file){
  const ff=await getFFmpeg();const ext=(file.name.split('.').pop()||'bin').toLowerCase(),input=`asr_input.${ext}`,out='asr.wav';await safeDelete(ff,input);await safeDelete(ff,out);await ff.writeFile(input,new Uint8Array(await file.arrayBuffer()));await ff.exec(['-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);const data=await ff.readFile(out);return new Blob([data.buffer],{type:'audio/wav'});
}
async function getFFmpeg(){
  if(state.ffmpegLoaded)return state.ffmpeg;const ff=new FFmpeg();ff.on('log',({message})=>console.log('[ffmpeg]',message));ff.on('progress',({progress})=>{if(els.exportDialog.open)els.exportStatus.textContent=`处理中 ${(progress*100).toFixed(1)}%`;});const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';await ff.load({coreURL:await toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),wasmURL:await toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')});state.ffmpeg=ff;state.ffmpegLoaded=true;return ff;
}
async function safeDelete(ff,name){try{await ff.deleteFile(name)}catch{}}
function baseName(){const n=currentAsset()?.file.name||'webcut';return n.replace(/\.[^.]+$/,'');}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}

window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.code==='Space'){e.preventDefault();els.playBtn.click();}
  else if(e.key==='ArrowLeft')stepFrame(-1);else if(e.key==='ArrowRight')stepFrame(1);
  else if(e.key.toLowerCase()==='i')els.setInBtn.click();else if(e.key.toLowerCase()==='o')els.setOutBtn.click();else if(e.key.toLowerCase()==='s')els.splitBtn.click();else if(e.key==='Delete')els.deleteClipBtn.click();
});

window.addEventListener('resize',()=>{if(currentAsset())drawWaveform(currentAsset().file).catch(()=>drawFlatWave())});
renderAssets();
