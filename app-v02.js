(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = {};
  [
    'openFilesBtn','openFolderBtn','asrBtn','exportBtn','fileInput','folderInput','assetList','categoryFilter','addCategoryBtn','assetCategory',
    'video','audio','emptyPreview','playBtn','prevFrameBtn','nextFrameBtn','timeText','fpsInput','fileName','inPoint','outPoint',
    'setInBtn','setOutBtn','splitBtn','deleteClipBtn','undoBtn','timeline','ruler','videoTrack','subtitleTrack','waveCanvas','playhead',
    'subtitleList','addSubtitleBtn','exportSrtBtn','storyboardBtn','storyboardDialog','storyInterval','generateStoryboardBtn','storyboardGrid',
    'asrDialog','asrUrl','asrToken','asrField','saveAsrConfigBtn','runAsrBtn','asrStatus','exportDialog','exportType','exportFormat',
    'runExportBtn','exportStatus'
  ].forEach(id => els[id] = $(id));

  const MEDIA_RE = /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|flac|aac|opus|ogg)$/i;
  const AUDIO_RE = /\.(mp3|wav|m4a|flac|aac|opus|ogg)$/i;

  const state = {
    assets: [], currentIndex: -1, duration: 0, clips: [], subtitles: [], selectedClip: -1,
    undo: [], objectUrl: null, ffmpeg: null,
    categories: JSON.parse(localStorage.getItem('webcut.categories') || '["未分类","人物","动物","风景","动漫","商品","其他"]')
  };

  const fmt = (t=0) => {
    t = Math.max(0, Number(t)||0);
    const m = Math.floor(t/60), s = Math.floor(t%60), ms = Math.floor((t%1)*1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  };
  const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentAsset = () => state.assets[state.currentIndex] || null;
  const currentMedia = () => currentAsset()?.kind === 'audio' ? els.audio : els.video;
  const currentTime = () => currentMedia()?.currentTime || 0;
  const assetKey = f => `webcut.asset.${f.name}.${f.size}.${f.lastModified}`;
  const baseName = () => (currentAsset()?.file.name || 'webcut').replace(/\.[^.]+$/, '');

  function rebuildCategoryUI(){
    const options = state.categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    els.assetCategory.innerHTML = options;
    els.categoryFilter.innerHTML = `<option value="all">全部分类</option>${options}`;
  }

  function isMediaFile(file){
    return !!file && ((file.type||'').startsWith('video/') || (file.type||'').startsWith('audio/') || MEDIA_RE.test(file.name||''));
  }

  function addFiles(files){
    const valid = [...files].filter(isMediaFile);
    if(!valid.length){ alert('没有找到支持的音频或视频文件'); return; }
    for(const file of valid){
      if(state.assets.some(a => a.file.name===file.name && a.file.size===file.size && a.file.lastModified===file.lastModified)) continue;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(assetKey(file)) || '{}'); } catch {}
      state.assets.push({
        file,
        kind: ((file.type||'').startsWith('audio/') || AUDIO_RE.test(file.name)) ? 'audio' : 'video',
        category: saved.category || '未分类',
        relativePath: file.webkitRelativePath || file.name
      });
    }
    renderAssets();
    if(state.currentIndex < 0 && state.assets.length) selectAsset(0);
  }

  // 文件：永远使用标准 input，避免 API/安全上下文导致按钮失效。
  els.openFilesBtn.addEventListener('click', () => {
    els.fileInput.value = '';
    els.fileInput.click();
  });
  els.fileInput.addEventListener('change', e => addFiles(e.target.files || []));

  // 文件夹：HTTPS/localhost 优先原生目录选择；其他环境自动回退 webkitdirectory。
  els.openFolderBtn.addEventListener('click', async () => {
    if(window.isSecureContext && 'showDirectoryPicker' in window){
      try{
        const dir = await window.showDirectoryPicker({mode:'read'});
        const files = [];
        await collectDirectoryHandle(dir, files);
        addFiles(files);
        return;
      }catch(err){
        if(err?.name === 'AbortError') return;
        console.warn('showDirectoryPicker failed, fallback to input:', err);
      }
    }
    els.folderInput.value = '';
    els.folderInput.click();
  });
  els.folderInput.addEventListener('change', e => addFiles(e.target.files || []));

  async function collectDirectoryHandle(dir, out){
    for await(const entry of dir.values()){
      if(entry.kind === 'file'){
        const file = await entry.getFile();
        if(isMediaFile(file)) out.push(file);
      }else if(entry.kind === 'directory'){
        await collectDirectoryHandle(entry, out);
      }
    }
  }

  function renderAssets(){
    const filter = els.categoryFilter.value;
    const items = state.assets.map((a,i)=>({a,i})).filter(x => filter==='all' || x.a.category===filter);
    if(!items.length){ els.assetList.className='asset-list empty'; els.assetList.textContent='暂无素材'; return; }
    els.assetList.className='asset-list';
    els.assetList.innerHTML = items.map(({a,i}) => `<div class="asset-item ${i===state.currentIndex?'active':''}" data-i="${i}">
      <div class="asset-thumb"></div>
      <div class="asset-meta"><div class="asset-name">${esc(a.relativePath)}</div><div class="asset-cat">${esc(a.category)} · ${(a.file.size/1024/1024).toFixed(1)} MB</div></div>
    </div>`).join('');
    els.assetList.querySelectorAll('.asset-item').forEach(node => node.onclick = () => selectAsset(Number(node.dataset.i)));
  }

  els.categoryFilter.onchange = renderAssets;
  els.addCategoryBtn.onclick = () => {
    const name = prompt('分类名称');
    if(!name) return;
    if(!state.categories.includes(name)) state.categories.push(name);
    localStorage.setItem('webcut.categories', JSON.stringify(state.categories));
    rebuildCategoryUI(); renderAssets();
  };
  els.assetCategory.onchange = () => {
    const a=currentAsset(); if(!a) return;
    a.category=els.assetCategory.value;
    localStorage.setItem(assetKey(a.file), JSON.stringify({category:a.category}));
    renderAssets();
  };

  async function selectAsset(i){
    if(i<0 || i>=state.assets.length) return;
    state.currentIndex=i; state.duration=0; state.clips=[]; state.subtitles=[]; state.selectedClip=-1; state.undo=[];
    if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    const a=currentAsset(); state.objectUrl=URL.createObjectURL(a.file);
    els.fileName.textContent=a.relativePath || a.file.name;
    els.assetCategory.value=a.category;
    const isAudio=a.kind==='audio';
    els.video.classList.toggle('hidden',isAudio);
    els.audio.classList.toggle('hidden',!isAudio);
    els.emptyPreview.classList.add('hidden');
    const media=currentMedia();
    media.src=state.objectUrl; media.controls=false; media.preload='metadata';
    await new Promise(resolve => {
      const done=()=>{media.removeEventListener('loadedmetadata',done);media.removeEventListener('error',done);resolve();};
      media.addEventListener('loadedmetadata',done); media.addEventListener('error',done);
    });
    state.duration=Number.isFinite(media.duration)?media.duration:0;
    els.inPoint.value='0.000'; els.outPoint.value=state.duration.toFixed(3);
    state.clips=[{start:0,end:state.duration,deleted:false}];
    renderAssets(); renderAll();
    if(a.kind==='audio') drawWaveform(a.file).catch(drawFlatWave); else drawFlatWave();
  }

  function pushUndo(){ state.undo.push(JSON.stringify({clips:state.clips,subtitles:state.subtitles})); if(state.undo.length>30)state.undo.shift(); }
  els.undoBtn.onclick=()=>{ const x=state.undo.pop(); if(!x)return; const v=JSON.parse(x); state.clips=v.clips;state.subtitles=v.subtitles;state.selectedClip=-1;renderAll(); };

  function renderAll(){ renderRuler();renderClips();renderSubtitles();updatePlayhead(); }
  function renderRuler(){
    const d=Math.max(state.duration,1); els.ruler.innerHTML='';
    for(let i=0;i<=10;i++){ const s=document.createElement('span'); s.style.cssText=`position:absolute;left:${i*10}%;top:8px;font-size:10px;color:#8a929b`; s.textContent=fmt(d*i/10).slice(0,5); els.ruler.appendChild(s); }
  }
  function renderClips(){
    els.videoTrack.innerHTML=''; const d=Math.max(state.duration,.001);
    state.clips.forEach((c,i)=>{ const n=document.createElement('div'); n.className=`clip ${i===state.selectedClip?'selected':''} ${c.deleted?'deleted':''}`; n.style.left=`${c.start/d*100}%`;n.style.width=`${Math.max(.2,(c.end-c.start)/d*100)}%`;n.textContent=`${fmt(c.start)} → ${fmt(c.end)}`;n.onclick=()=>{state.selectedClip=i;renderClips();};els.videoTrack.appendChild(n); });
  }
  function renderSubtitles(){
    const d=Math.max(state.duration,.001); els.subtitleTrack.innerHTML='';
    state.subtitles.forEach(s=>{ const b=document.createElement('div');b.className='subtitle-block';b.style.left=`${s.start/d*100}%`;b.style.width=`${Math.max(.4,(s.end-s.start)/d*100)}%`;b.textContent=s.text;b.onclick=()=>{const m=currentMedia();if(m)m.currentTime=s.start;};els.subtitleTrack.appendChild(b); });
    if(!state.subtitles.length){els.subtitleList.className='subtitle-list empty';els.subtitleList.textContent='暂无字幕';return;}
    els.subtitleList.className='subtitle-list';
    els.subtitleList.innerHTML=state.subtitles.map((s,i)=>`<div class="subtitle-item" data-i="${i}"><div class="subtitle-time"><input class="sub-start" type="number" step="0.01" value="${s.start.toFixed(3)}"><input class="sub-end" type="number" step="0.01" value="${s.end.toFixed(3)}"></div><textarea class="sub-text">${esc(s.text)}</textarea><button class="sub-del">删除</button></div>`).join('');
    els.subtitleList.querySelectorAll('.subtitle-item').forEach(node=>{
      const i=Number(node.dataset.i), s=state.subtitles[i];
      node.querySelector('.sub-start').onchange=e=>{s.start=Number(e.target.value);renderSubtitles();};
      node.querySelector('.sub-end').onchange=e=>{s.end=Number(e.target.value);renderSubtitles();};
      node.querySelector('.sub-text').oninput=e=>{s.text=e.target.value;renderSubtitlesTrack();};
      node.querySelector('.sub-del').onclick=()=>{pushUndo();state.subtitles.splice(i,1);renderSubtitles();};
    });
  }
  function renderSubtitlesTrack(){ const d=Math.max(state.duration,.001);els.subtitleTrack.innerHTML='';state.subtitles.forEach(s=>{const b=document.createElement('div');b.className='subtitle-block';b.style.left=`${s.start/d*100}%`;b.style.width=`${Math.max(.4,(s.end-s.start)/d*100)}%`;b.textContent=s.text;els.subtitleTrack.appendChild(b);}); }
  function updatePlayhead(){ const m=currentMedia(); const t=m?.currentTime||0; els.timeText.textContent=`${fmt(t)} / ${fmt(state.duration)}`; const pct=state.duration?t/state.duration:0; els.playhead.style.left=`calc(68px + (100% - 68px) * ${pct})`; }
  ['video','audio'].forEach(k=>{ els[k].ontimeupdate=updatePlayhead;els[k].onplay=()=>els.playBtn.textContent='❚❚';els[k].onpause=()=>els.playBtn.textContent='▶'; });
  els.playBtn.onclick=()=>{const m=currentMedia();if(!m)return;m.paused?m.play():m.pause();};
  function stepFrame(dir){const m=currentMedia();if(!m)return;const fps=Math.max(1,Number(els.fpsInput.value)||30);m.pause();m.currentTime=Math.min(state.duration,Math.max(0,m.currentTime+dir/fps));}
  els.prevFrameBtn.onclick=()=>stepFrame(-1); els.nextFrameBtn.onclick=()=>stepFrame(1);
  els.timeline.onclick=e=>{if(e.target.closest('.clip,.subtitle-block'))return;const r=els.timeline.getBoundingClientRect();const x=Math.max(0,e.clientX-r.left-68),w=Math.max(1,r.width-68);const m=currentMedia();if(m)m.currentTime=Math.min(state.duration,x/w*state.duration);};

  els.setInBtn.onclick=()=>els.inPoint.value=currentTime().toFixed(3);
  els.setOutBtn.onclick=()=>els.outPoint.value=currentTime().toFixed(3);
  function splitAt(t){const i=state.clips.findIndex(c=>!c.deleted&&t>c.start+.001&&t<c.end-.001);if(i<0)return;pushUndo();const c=state.clips[i];state.clips.splice(i,1,{...c,end:t},{...c,start:t});state.selectedClip=i+1;renderClips();}
  els.splitBtn.onclick=()=>splitAt(currentTime());
  els.deleteClipBtn.onclick=()=>{if(state.selectedClip<0)return;pushUndo();state.clips[state.selectedClip].deleted=true;renderClips();};

  els.addSubtitleBtn.onclick=()=>{pushUndo();const t=currentTime();state.subtitles.push({start:t,end:Math.min(state.duration,t+2),text:'新字幕'});state.subtitles.sort((a,b)=>a.start-b.start);renderSubtitles();};
  function srtTime(t){const h=Math.floor(t/3600);t%=3600;const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;}
  els.exportSrtBtn.onclick=()=>{const srt=state.subtitles.map((s,i)=>`${i+1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n');downloadBlob(new Blob([srt],{type:'text/plain;charset=utf-8'}),baseName()+'.srt');};

  async function drawWaveform(file){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('AudioContext unavailable');const ctx=new C();const buf=await file.arrayBuffer();const audio=await ctx.decodeAudioData(buf.slice(0));const data=audio.getChannelData(0),c=els.waveCanvas,dpr=devicePixelRatio||1;c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,c.clientWidth,c.clientHeight);g.strokeStyle='#8061c9';const mid=c.clientHeight/2,step=Math.max(1,Math.floor(data.length/c.clientWidth));g.beginPath();for(let x=0;x<c.clientWidth;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;min=Math.min(min,v);max=Math.max(max,v);}g.moveTo(x,mid+min*mid*.85);g.lineTo(x,mid+max*mid*.85);}g.stroke();ctx.close();}
  function drawFlatWave(){const c=els.waveCanvas;c.width=c.clientWidth;c.height=c.clientHeight;const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.strokeStyle='#777';g.beginPath();g.moveTo(0,c.height/2);g.lineTo(c.width,c.height/2);g.stroke();}

  els.storyboardBtn.onclick=()=>els.storyboardDialog.showModal();
  els.generateStoryboardBtn.onclick=async()=>{const a=currentAsset();if(!a||a.kind!=='video'){alert('故事板仅支持视频');return;}const v=els.video,interval=Math.max(.1,Number(els.storyInterval.value)||1),old=v.currentTime;v.pause();els.storyboardGrid.textContent='生成中…';const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const g=canvas.getContext('2d'),cards=[];for(let t=0;t<state.duration&&cards.length<200;t+=interval){await seekVideo(v,t);g.drawImage(v,0,0,320,180);cards.push({t,url:canvas.toDataURL('image/jpeg',.72)});}els.storyboardGrid.innerHTML=cards.map(x=>`<div class="story-card" data-t="${x.t}"><img src="${x.url}"><div>${fmt(x.t)} · 帧 ${Math.round(x.t*(Number(els.fpsInput.value)||30))}</div></div>`).join('');els.storyboardGrid.querySelectorAll('.story-card').forEach(n=>n.onclick=()=>{v.currentTime=Number(n.dataset.t);els.storyboardDialog.close();});v.currentTime=old;};
  function seekVideo(v,t){return new Promise(r=>{const f=()=>{v.removeEventListener('seeked',f);r();};v.addEventListener('seeked',f);v.currentTime=Math.min(Math.max(0,t),Math.max(0,state.duration-.001));});}

  els.asrBtn.onclick=()=>{const cfg=JSON.parse(localStorage.getItem('webcut.asr')||'{}');els.asrUrl.value=cfg.url||'';els.asrToken.value=cfg.token||'';els.asrField.value=cfg.field||'file';els.asrDialog.showModal();};
  function saveAsr(){localStorage.setItem('webcut.asr',JSON.stringify({url:els.asrUrl.value.trim(),token:els.asrToken.value.trim(),field:els.asrField.value.trim()||'file'}));els.asrStatus.textContent='配置已保存';}
  els.saveAsrConfigBtn.onclick=saveAsr;
  els.runAsrBtn.onclick=async()=>{const a=currentAsset();if(!a)return;saveAsr();const url=els.asrUrl.value.trim();if(!url){els.asrStatus.textContent='请填写 API 地址';return;}try{els.asrStatus.textContent='正在本地提取 WAV…';const wav=await extractWav(a.file);const fd=new FormData();fd.append(els.asrField.value.trim()||'file',wav,baseName()+'.wav');const headers={};if(els.asrToken.value.trim())headers.Authorization=`Bearer ${els.asrToken.value.trim()}`;els.asrStatus.textContent='正在调用 ASR…';const res=await fetch(url,{method:'POST',headers,body:fd});const raw=await res.text();if(!res.ok)throw new Error(`${res.status} ${raw.slice(0,300)}`);let data;try{data=JSON.parse(raw);}catch{data={text:raw};}const root=data?.data??data?.result??data;const text=root?.text??root?.transcript??data?.text??'';let seg=root?.segments??root?.chunks??root?.words??[];seg=(Array.isArray(seg)?seg:[]).map(x=>({start:Number(x.start??x.start_time??x.timestamp?.[0]??0),end:Number(x.end??x.end_time??x.timestamp?.[1]??0),text:String(x.text??x.word??'')})).filter(x=>x.text);pushUndo();state.subtitles=seg.length?seg:[{start:0,end:state.duration,text:String(text)}];renderSubtitles();els.asrStatus.textContent='识别完成';}catch(e){els.asrStatus.textContent='失败：'+e.message;}};

  els.exportBtn.onclick=()=>els.exportDialog.showModal();
  els.runExportBtn.onclick=async()=>{const a=currentAsset();if(!a)return;try{els.exportStatus.textContent='正在加载本地 FFmpeg…';const ff=await getFFmpeg();const ext=(a.file.name.split('.').pop()||'bin').toLowerCase(),inName=`input.${ext}`;await safeDelete(ff,inName);await ff.writeFile(inName,new Uint8Array(await a.file.arrayBuffer()));const keep=state.clips.filter(c=>!c.deleted&&c.end>c.start);if(!keep.length)throw new Error('没有可导出的片段');let fmt=els.exportFormat.value;if(fmt==='original')fmt=els.exportType.value==='audio'?'wav':ext;const out=`output.${fmt}`;await safeDelete(ff,out);const c=keep[0];let args=['-ss',c.start.toFixed(3),'-to',c.end.toFixed(3),'-i',inName];if(keep.length>1)throw new Error('V0.2 暂时先支持单保留片段导出，多片段拼接下一版恢复');if(els.exportType.value==='audio'){args.push('-vn');if(fmt==='wav')args.push('-c:a','pcm_s16le');else if(fmt==='mp3')args.push('-c:a','libmp3lame','-q:a','2');else if(fmt==='flac')args.push('-c:a','flac');else args.push('-c:a','aac','-b:a','192k');}else if(els.exportFormat.value==='original'){args.push('-c','copy');}else args.push('-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k');args.push(out);els.exportStatus.textContent='正在本机处理…';await ff.exec(args);const data=await ff.readFile(out);downloadBlob(new Blob([data.buffer]),`${baseName()}_cut.${fmt}`);els.exportStatus.textContent='导出完成';}catch(e){els.exportStatus.textContent='导出失败：'+e.message;}};

  async function loadFFmpegModules(){
    const ffmpegMod=await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15');
    const utilMod=await import('https://esm.sh/@ffmpeg/util@0.12.2');
    return {FFmpeg:ffmpegMod.FFmpeg,toBlobURL:utilMod.toBlobURL};
  }
  async function getFFmpeg(){
    if(state.ffmpeg)return state.ffmpeg;
    const {FFmpeg,toBlobURL}=await loadFFmpegModules();
    const ff=new FFmpeg();
    ff.on('progress',({progress})=>{if(els.exportDialog.open)els.exportStatus.textContent=`处理中 ${(progress*100).toFixed(1)}%`;});
    const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
    await ff.load({coreURL:await toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),wasmURL:await toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')});
    state.ffmpeg=ff; return ff;
  }
  async function extractWav(file){const ff=await getFFmpeg(),ext=(file.name.split('.').pop()||'bin').toLowerCase(),input=`asr_input.${ext}`,out='asr.wav';await safeDelete(ff,input);await safeDelete(ff,out);await ff.writeFile(input,new Uint8Array(await file.arrayBuffer()));await ff.exec(['-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);const data=await ff.readFile(out);return new Blob([data.buffer],{type:'audio/wav'});}
  async function safeDelete(ff,n){try{await ff.deleteFile(n);}catch{}}
  function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}

  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.code==='Space'){e.preventDefault();els.playBtn.click();}else if(e.key==='ArrowLeft')stepFrame(-1);else if(e.key==='ArrowRight')stepFrame(1);else if(e.key.toLowerCase()==='i')els.setInBtn.click();else if(e.key.toLowerCase()==='o')els.setOutBtn.click();else if(e.key.toLowerCase()==='s')els.splitBtn.click();else if(e.key==='Delete')els.deleteClipBtn.click();});
  window.addEventListener('resize',()=>{if(currentAsset()?.kind==='audio')drawWaveform(currentAsset().file).catch(drawFlatWave);else drawFlatWave();});

  rebuildCategoryUI(); renderAssets(); drawFlatWave();
  console.log('webCut v0.2 loaded: local file/folder picker ready');
})();
