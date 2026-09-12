(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {};
  [
    'openFilesBtn','openFolderBtn','fileInput','folderInput','assetList','assetTypeFilter','categoryFilter','addCategoryBtn',
    'stage','audioOnlyPreview','playBtn','prevFrameBtn','nextFrameBtn','timeText','fpsInput','mediaInfo','storyboardBtn',
    'inspectorEmpty','inspectorContent','fileName','assetCategory','clipTrack','clipStart','clipIn','clipOut','clipDuration','clipVolume','clipOpacity',
    'splitBtn','deleteClipBtn','undoBtn','addVisualTrackBtn','addAudioTrackBtn','zoomOutBtn','zoomInBtn','zoomRange','zoomLabel','fitTimelineBtn',
    'timeline','timelineInner','ruler','tracksContainer','playhead','subtitleTrack','addSubtitleBtn','exportSrtBtn',
    'storyboardDialog','storyInterval','generateStoryboardBtn','storyboardGrid',
    'asrBtn','asrDialog','asrUrl','asrToken','asrField','saveAsrConfigBtn','runAsrBtn','asrStatus',
    'exportBtn','exportDialog','exportType','exportFormat','runExportBtn','exportStatus'
  ].forEach(id => els[id] = $(id));

  const HEADER_W = 116;
  const MIN_ZOOM = 20;
  const MAX_ZOOM = 240;
  const IMAGE_DEFAULT_DURATION = 3;
  const MEDIA_RE = /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|flac|aac|opus|ogg|jpg|jpeg|png|webp|gif|bmp)$/i;
  const AUDIO_RE = /\.(mp3|wav|m4a|flac|aac|opus|ogg)$/i;
  const IMAGE_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i;

  const state = {
    assets: [],
    tracks: [],
    subtitles: [],
    selectedAssetId: null,
    selectedTrackId: null,
    selectedClipId: null,
    playhead: 0,
    zoom: 90,
    playing: false,
    playStartClock: 0,
    playbackRaf: 0,
    undo: [],
    elementMap: new Map(),
    ffmpeg: null,
    categories: JSON.parse(localStorage.getItem('webcut.categories') || '["未分类","人物","动物","风景","动漫","商品","其他"]')
  };

  const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (t=0) => {
    t = Math.max(0, Number(t)||0);
    const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = Math.floor(t%60), ms = Math.floor((t%1)*1000);
    return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  };
  const srtTime = (t=0) => {
    const h=Math.floor(t/3600); t%=3600; const m=Math.floor(t/60), s=Math.floor(t%60), ms=Math.floor((t%1)*1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };

  function assetById(id){ return state.assets.find(a=>a.id===id) || null; }
  function trackById(id){ return state.tracks.find(t=>t.id===id) || null; }
  function findClip(id){
    for(const track of state.tracks){ const clip=track.clips.find(c=>c.id===id); if(clip) return {track,clip}; }
    return null;
  }
  function selectedClip(){ return findClip(state.selectedClipId); }
  function projectDuration(){
    let d = 0;
    for(const t of state.tracks) for(const c of t.clips) d = Math.max(d, c.start + c.duration);
    for(const s of state.subtitles) d = Math.max(d, s.end);
    return Math.max(d, .1);
  }
  function assetKey(f){ return `webcut.asset.${f.name}.${f.size}.${f.lastModified}`; }
  function baseName(asset){ return (asset?.file?.name || 'webcut').replace(/\.[^.]+$/,''); }

  function snapshot(){
    state.undo.push(JSON.stringify({tracks:state.tracks,subtitles:state.subtitles,selectedTrackId:state.selectedTrackId,selectedClipId:state.selectedClipId,playhead:state.playhead}));
    if(state.undo.length>40) state.undo.shift();
  }
  function undo(){
    const raw=state.undo.pop(); if(!raw) return;
    const s=JSON.parse(raw); state.tracks=s.tracks; state.subtitles=s.subtitles; state.selectedTrackId=s.selectedTrackId; state.selectedClipId=s.selectedClipId; state.playhead=s.playhead;
    stopPlayback(); renderAll();
  }

  function isMediaFile(file){
    const type=file?.type || '';
    return !!file && (type.startsWith('video/') || type.startsWith('audio/') || type.startsWith('image/') || MEDIA_RE.test(file.name||''));
  }
  function kindOf(file){
    const type=file.type || '';
    if(type.startsWith('image/') || IMAGE_RE.test(file.name)) return 'image';
    if(type.startsWith('audio/') || AUDIO_RE.test(file.name)) return 'audio';
    return 'video';
  }

  async function readMetadata(file,kind,url){
    if(kind==='image'){
      return await new Promise(resolve=>{ const img=new Image(); img.onload=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:img.naturalWidth||0,height:img.naturalHeight||0}); img.onerror=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:0,height:0}); img.src=url; });
    }
    const tag=document.createElement(kind==='audio'?'audio':'video'); tag.preload='metadata'; tag.src=url;
    return await new Promise(resolve=>{
      const done=()=>{ cleanup(); resolve({duration:Number.isFinite(tag.duration)?tag.duration:0,width:tag.videoWidth||0,height:tag.videoHeight||0}); };
      const cleanup=()=>{ tag.removeEventListener('loadedmetadata',done); tag.removeEventListener('error',done); };
      tag.addEventListener('loadedmetadata',done); tag.addEventListener('error',done); tag.load();
    });
  }

  async function addFiles(files){
    const valid=[...files].filter(isMediaFile);
    if(!valid.length){ alert('没有找到支持的视频、音频或图像文件'); return; }
    for(const file of valid){
      if(state.assets.some(a=>a.file.name===file.name && a.file.size===file.size && a.file.lastModified===file.lastModified)) continue;
      const kind=kindOf(file), url=URL.createObjectURL(file); let saved={};
      try{ saved=JSON.parse(localStorage.getItem(assetKey(file))||'{}'); }catch{}
      const asset={id:uid('asset'),file,kind,url,relativePath:file.webkitRelativePath||file.name,category:saved.category||'未分类',duration:kind==='image'?IMAGE_DEFAULT_DURATION:0,width:0,height:0,peaks:null,hasAudio:kind==='audio'?true:null};
      state.assets.push(asset); renderAssets();
      const meta=await readMetadata(file,kind,url); Object.assign(asset,meta); renderAssets();
      if(!state.selectedAssetId) state.selectedAssetId=asset.id;
      if(state.tracks.every(t=>t.clips.length===0) && state.assets.length===1) await addAssetToTimeline(asset.id,true);
    }
    renderAll();
  }

  els.openFilesBtn.onclick=()=>{ els.fileInput.value=''; els.fileInput.click(); };
  els.fileInput.onchange=e=>addFiles(e.target.files||[]);
  els.openFolderBtn.onclick=async()=>{
    if(window.isSecureContext && 'showDirectoryPicker' in window){
      try{ const dir=await window.showDirectoryPicker({mode:'read'}); const files=[]; await collectDirectory(dir,files); await addFiles(files); return; }
      catch(err){ if(err?.name==='AbortError') return; console.warn(err); }
    }
    els.folderInput.value=''; els.folderInput.click();
  };
  els.folderInput.onchange=e=>addFiles(e.target.files||[]);
  async function collectDirectory(dir,out){
    for await(const entry of dir.values()){
      if(entry.kind==='file'){ const f=await entry.getFile(); if(isMediaFile(f)) out.push(f); }
      else if(entry.kind==='directory') await collectDirectory(entry,out);
    }
  }

  function rebuildCategoryUI(){
    const options=state.categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    els.categoryFilter.innerHTML=`<option value="all">全部分类</option>${options}`;
    els.assetCategory.innerHTML=options;
  }
  els.addCategoryBtn.onclick=()=>{
    const name=prompt('分类名称'); if(!name) return;
    if(!state.categories.includes(name)) state.categories.push(name);
    localStorage.setItem('webcut.categories',JSON.stringify(state.categories)); rebuildCategoryUI(); renderAssets();
  };
  els.assetTypeFilter.onchange=renderAssets; els.categoryFilter.onchange=renderAssets;
  els.assetCategory.onchange=()=>{
    const asset=assetById(state.selectedAssetId); if(!asset) return;
    asset.category=els.assetCategory.value; localStorage.setItem(assetKey(asset.file),JSON.stringify({category:asset.category})); renderAssets();
  };

  function typeLabel(kind){ return kind==='video'?'视频':kind==='audio'?'音频':'图像'; }
  function typeIcon(kind){ return kind==='video'?'🎬':kind==='audio'?'🎵':'🖼️'; }
  function renderAssets(){
    const tf=els.assetTypeFilter.value, cf=els.categoryFilter.value;
    const list=state.assets.filter(a=>(tf==='all'||a.kind===tf)&&(cf==='all'||a.category===cf));
    if(!list.length){ els.assetList.className='asset-list empty'; els.assetList.textContent='暂无素材'; return; }
    els.assetList.className='asset-list';
    els.assetList.innerHTML=list.map(a=>`<div class="asset-item ${a.id===state.selectedAssetId?'active':''}" data-id="${a.id}">
      <div class="asset-thumb ${a.kind}">${a.kind==='image'?`<img src="${a.url}">`:typeIcon(a.kind)}</div>
      <div class="asset-meta"><div class="asset-name">${esc(a.relativePath)}</div><div class="asset-cat">${typeLabel(a.kind)} · ${a.duration?fmt(a.duration):'读取中'} · ${(a.file.size/1024/1024).toFixed(1)} MB</div></div>
      <button class="asset-add" title="加入时间轴">＋</button>
    </div>`).join('');
    els.assetList.querySelectorAll('.asset-item').forEach(node=>{
      const id=node.dataset.id;
      node.onclick=e=>{ if(e.target.closest('.asset-add')) return; state.selectedAssetId=id; renderAssets(); renderInspector(); };
      node.ondblclick=()=>addAssetToTimeline(id,false);
      node.querySelector('.asset-add').onclick=e=>{ e.stopPropagation(); addAssetToTimeline(id,false); };
    });
  }

  function createTrack(type,name){
    const n=state.tracks.filter(t=>t.type===type).length+1;
    const track={id:uid('track'),type,name:name||(type==='visual'?`视频/图像 ${n}`:`音频 ${n}`),clips:[],visible:true,muted:false};
    state.tracks.push(track); state.selectedTrackId=track.id; return track;
  }
  function compatibleTrack(asset){
    const type=asset.kind==='audio'?'audio':'visual';
    const selected=trackById(state.selectedTrackId); if(selected?.type===type) return selected;
    return state.tracks.find(t=>t.type===type) || createTrack(type);
  }
  function firstAudioTrack(){ return state.tracks.find(t=>t.type==='audio') || createTrack('audio'); }

  async function ensurePeaks(asset){
    if(asset.peaks) return asset.peaks;
    if(asset.kind==='image'){ asset.hasAudio=false; return null; }
    try{
      const C=window.AudioContext||window.webkitAudioContext; if(!C) throw new Error('AudioContext unavailable');
      const ctx=new C(); const arr=await asset.file.arrayBuffer(); const buf=await ctx.decodeAudioData(arr.slice(0)); const data=buf.getChannelData(0); const bins=1200; const peaks=[]; const step=Math.max(1,Math.floor(data.length/bins));
      for(let i=0;i<bins;i++){ let min=1,max=-1; const st=i*step,en=Math.min(data.length,st+step); for(let j=st;j<en;j++){ const v=data[j]; if(v<min)min=v;if(v>max)max=v; } peaks.push([min,max]); }
      asset.peaks=peaks; asset.hasAudio=true; await ctx.close(); return peaks;
    }catch(err){ asset.hasAudio=false; return null; }
  }

  async function addAssetToTimeline(assetId,auto=false){
    const asset=assetById(assetId); if(!asset) return;
    if(!auto) snapshot();
    const track=compatibleTrack(asset); const start=state.playhead;
    const clip={id:uid('clip'),assetId:asset.id,start,in:0,out:asset.duration||IMAGE_DEFAULT_DURATION,duration:asset.duration||IMAGE_DEFAULT_DURATION,volume:1,opacity:1,linkGroup:null};
    if(asset.kind==='image'){ clip.out=clip.duration=IMAGE_DEFAULT_DURATION; }
    track.clips.push(clip); state.selectedTrackId=track.id; state.selectedClipId=clip.id; state.selectedAssetId=asset.id;
    if(asset.kind==='video'){
      const hasAudio=await ensurePeaks(asset);
      if(hasAudio){
        const at=firstAudioTrack(); const group=uid('link'); clip.linkGroup=group;
        at.clips.push({id:uid('clip'),assetId:asset.id,start,in:0,out:asset.duration,duration:asset.duration,volume:1,opacity:1,linkGroup:group,linkedVisualId:clip.id});
      }
    } else if(asset.kind==='audio') ensurePeaks(asset).then(()=>renderTimeline());
    renderAll();
  }

  els.addVisualTrackBtn.onclick=()=>{ snapshot(); createTrack('visual'); renderTimeline(); };
  els.addAudioTrackBtn.onclick=()=>{ snapshot(); createTrack('audio'); renderTimeline(); };

  function linkedClips(clip){
    if(!clip?.linkGroup) return [];
    const arr=[]; for(const t of state.tracks) for(const c of t.clips) if(c.linkGroup===clip.linkGroup && c.id!==clip.id) arr.push({track:t,clip:c}); return arr;
  }

  function renderInspector(){
    const found=selectedClip(); const asset=found?assetById(found.clip.assetId):assetById(state.selectedAssetId);
    if(!asset){ els.inspectorEmpty.classList.remove('hidden'); els.inspectorContent.classList.add('hidden'); return; }
    els.inspectorEmpty.classList.add('hidden'); els.inspectorContent.classList.remove('hidden');
    els.fileName.textContent=asset.relativePath; els.assetCategory.value=asset.category;
    if(found){
      const {track,clip}=found; els.clipTrack.textContent=track.name; els.clipStart.value=clip.start.toFixed(3); els.clipIn.value=clip.in.toFixed(3); els.clipOut.value=clip.out.toFixed(3); els.clipDuration.value=clip.duration.toFixed(3); els.clipVolume.value=Math.round((clip.volume??1)*100); els.clipOpacity.value=Math.round((clip.opacity??1)*100);
      document.body.classList.toggle('selected-audio',track.type==='audio');
      $('.visual-only')?.classList.toggle('hidden',track.type!=='visual');
      $('.audio-only-field')?.classList.toggle('hidden',track.type!=='audio');
    }else{
      els.clipTrack.textContent='仅素材库'; els.clipStart.value=''; els.clipIn.value=''; els.clipOut.value=''; els.clipDuration.value=asset.duration.toFixed(3); els.clipVolume.value='100'; els.clipOpacity.value='100';
    }
  }

  function applyClipField(field){
    const found=selectedClip(); if(!found) return; const {clip,track}=found; const asset=assetById(clip.assetId); snapshot();
    const old={start:clip.start,in:clip.in,out:clip.out,duration:clip.duration};
    if(field==='start') clip.start=Math.max(0,Number(els.clipStart.value)||0);
    if(field==='in') clip.in=clamp(Number(els.clipIn.value)||0,0,Math.max(0,clip.out-.02));
    if(field==='out') clip.out=asset.kind==='image'?Math.max(clip.in+.02,Number(els.clipOut.value)||clip.out):clamp(Number(els.clipOut.value)||clip.out,clip.in+.02,asset.duration||clip.out);
    if(field==='duration'){
      const d=Math.max(.05,Number(els.clipDuration.value)||clip.duration); clip.duration=asset.kind==='image'?d:Math.min(d,Math.max(.05,(asset.duration||clip.out)-clip.in)); clip.out=clip.in+clip.duration;
    }else clip.duration=Math.max(.05,clip.out-clip.in);
    if(field==='volume') clip.volume=clamp((Number(els.clipVolume.value)||0)/100,0,2);
    if(field==='opacity') clip.opacity=clamp((Number(els.clipOpacity.value)||0)/100,0,1);
    const ds=clip.start-old.start, di=clip.in-old.in, dd=clip.duration-old.duration;
    for(const x of linkedClips(clip)){ if(field==='start')x.clip.start+=ds; if(field==='in'){x.clip.in+=di;x.clip.duration=Math.max(.05,x.clip.out-x.clip.in);} if(field==='out'||field==='duration'){x.clip.duration=clip.duration;x.clip.out=x.clip.in+clip.duration;} }
    renderAll();
  }
  els.clipStart.onchange=()=>applyClipField('start'); els.clipIn.onchange=()=>applyClipField('in'); els.clipOut.onchange=()=>applyClipField('out'); els.clipDuration.onchange=()=>applyClipField('duration'); els.clipVolume.onchange=()=>applyClipField('volume'); els.clipOpacity.onchange=()=>applyClipField('opacity');

  function laneWidth(){ return Math.max(900, Math.ceil(projectDuration()*state.zoom)+80); }
  function renderRuler(){
    const w=laneWidth(), d=projectDuration(); els.ruler.style.width=`${HEADER_W+w}px`;
    let tick=1; if(state.zoom<40)tick=5; else if(state.zoom<70)tick=2; else if(state.zoom>160)tick=.5;
    let html=`<div class="ruler-head" style="width:${HEADER_W}px"></div><div class="ruler-lane" style="width:${w}px">`;
    for(let t=0;t<=d+tick;t+=tick){ const left=t*state.zoom; html+=`<span class="tick" style="left:${left}px"><i></i><b>${fmt(t).replace('.000','')}</b></span>`; }
    html+='</div>'; els.ruler.innerHTML=html;
  }

  function renderTimeline(){
    const w=laneWidth(); renderRuler();
    els.tracksContainer.innerHTML=state.tracks.map((track,ti)=>{
      const clips=track.clips.map(c=>{
        const a=assetById(c.assetId); const left=c.start*state.zoom, width=Math.max(6,c.duration*state.zoom);
        return `<div class="tl-clip ${a.kind} ${c.id===state.selectedClipId?'selected':''}" data-clip="${c.id}" style="left:${left}px;width:${width}px">
          <div class="trim-handle left" data-handle="left"></div><span>${typeIcon(a.kind)} ${esc(a.file.name)}</span>${track.type==='audio'?'<canvas class="clip-wave"></canvas>':''}<div class="trim-handle right" data-handle="right"></div>
        </div>`;
      }).join('');
      const controls=track.type==='visual'?`<button data-action="vis">${track.visible?'👁':'🚫'}</button><button data-action="up">↑</button><button data-action="down">↓</button>`:`<button data-action="mute">${track.muted?'🔇':'🔊'}</button>`;
      return `<div class="track-row ${track.id===state.selectedTrackId?'selected-track':''}" data-track="${track.id}"><div class="track-header" style="width:${HEADER_W}px"><strong>${esc(track.name)}</strong><div>${controls}</div></div><div class="track-lane" style="width:${w}px">${clips}</div></div>`;
    }).join('') + `<div class="track-row subtitle-row"><div class="track-header" style="width:${HEADER_W}px"><strong>字幕</strong></div><div id="subtitleTrack" class="track-lane subtitle-lane" style="width:${w}px"></div></div>`;
    els.subtitleTrack=$('subtitleTrack'); renderSubtitles();
    bindTimelineEvents(); drawAllWaveforms(); updatePlayheadUI();
    els.timelineInner.style.width=`${HEADER_W+w}px`;
  }

  function bindTimelineEvents(){
    els.tracksContainer.querySelectorAll('.track-row[data-track]').forEach(row=>{
      const track=trackById(row.dataset.track);
      row.querySelector('.track-header').onclick=e=>{
        const act=e.target.closest('button')?.dataset.action;
        if(act){ snapshot(); if(act==='vis')track.visible=!track.visible; if(act==='mute')track.muted=!track.muted; if(act==='up'||act==='down')moveTrack(track.id,act==='up'?-1:1); renderAll(); return; }
        state.selectedTrackId=track.id; state.selectedClipId=null; renderTimeline(); renderInspector();
      };
    });
    els.tracksContainer.querySelectorAll('.tl-clip').forEach(node=>{
      node.onclick=e=>{ e.stopPropagation(); state.selectedClipId=node.dataset.clip; const f=findClip(state.selectedClipId); state.selectedTrackId=f.track.id; state.selectedAssetId=f.clip.assetId; renderAssets(); renderTimeline(); renderInspector(); syncPreview(state.playhead,false); };
      node.onpointerdown=e=>startClipDrag(e,node.dataset.clip,e.target.dataset.handle||'move');
    });
  }
  function moveTrack(id,dir){
    const i=state.tracks.findIndex(t=>t.id===id); if(i<0)return; const j=clamp(i+dir,0,state.tracks.length-1); if(i===j)return; const [t]=state.tracks.splice(i,1); state.tracks.splice(j,0,t);
  }

  function startClipDrag(e,clipId,mode){
    e.preventDefault(); e.stopPropagation(); const found=findClip(clipId); if(!found)return; const {clip}=found; state.selectedClipId=clip.id; state.selectedTrackId=found.track.id; state.selectedAssetId=clip.assetId; snapshot();
    const x0=e.clientX, orig={start:clip.start,in:clip.in,out:clip.out,duration:clip.duration}; const asset=assetById(clip.assetId); const links=linkedClips(clip).map(x=>({clip:x.clip,start:x.clip.start,in:x.clip.in,out:x.clip.out,duration:x.clip.duration}));
    const move=ev=>{
      const dt=(ev.clientX-x0)/state.zoom;
      if(mode==='move'){
        const ns=Math.max(0,orig.start+dt), delta=ns-orig.start; clip.start=ns; links.forEach(x=>x.clip.start=x.start+delta);
      }else if(mode==='left'){
        let delta=dt; delta=Math.max(delta,-orig.in); delta=Math.min(delta,orig.duration-.05); clip.start=Math.max(0,orig.start+delta); const actual=clip.start-orig.start; clip.in=orig.in+actual; clip.duration=orig.duration-actual; clip.out=clip.in+clip.duration;
        links.forEach(x=>{x.clip.start=x.start+actual;x.clip.in=x.in+actual;x.clip.duration=x.duration-actual;x.clip.out=x.clip.in+x.clip.duration;});
      }else{
        let dur=Math.max(.05,orig.duration+dt); if(asset.kind!=='image')dur=Math.min(dur,Math.max(.05,(asset.duration||orig.out)-orig.in)); clip.duration=dur; clip.out=clip.in+dur; links.forEach(x=>{x.clip.duration=dur;x.clip.out=x.clip.in+dur;});
      }
      renderTimeline(); renderInspector(); syncPreview(state.playhead,false);
    };
    const up=()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up,{once:true});
  }

  function drawAllWaveforms(){
    document.querySelectorAll('.tl-clip.audio .clip-wave,.track-row .tl-clip .clip-wave').forEach(canvas=>{
      const node=canvas.closest('.tl-clip'); const f=findClip(node.dataset.clip); if(!f)return; const asset=assetById(f.clip.assetId); ensurePeaks(asset).then(()=>drawClipWave(canvas,asset,f.clip));
    });
  }
  function drawClipWave(canvas,asset,clip){
    if(!asset.peaks||!canvas.isConnected)return; const r=canvas.getBoundingClientRect(), dpr=devicePixelRatio||1; canvas.width=Math.max(1,r.width*dpr); canvas.height=Math.max(1,r.height*dpr); const g=canvas.getContext('2d'); g.scale(dpr,dpr); g.clearRect(0,0,r.width,r.height); g.strokeStyle='#7658cf'; g.globalAlpha=.8; g.beginPath();
    const startRatio=asset.duration?clip.in/asset.duration:0, endRatio=asset.duration?clip.out/asset.duration:1; const p0=Math.floor(startRatio*asset.peaks.length), p1=Math.max(p0+1,Math.ceil(endRatio*asset.peaks.length));
    for(let x=0;x<r.width;x++){ const pi=Math.min(p1-1,p0+Math.floor((x/Math.max(1,r.width))*(p1-p0))); const [mn,mx]=asset.peaks[pi]||[0,0]; const mid=r.height/2; g.moveTo(x,mid+mn*mid*.9); g.lineTo(x,mid+mx*mid*.9); } g.stroke();
  }

  function renderSubtitles(){
    if(!els.subtitleTrack)return; els.subtitleTrack.innerHTML=state.subtitles.map((s,i)=>`<div class="subtitle-block" data-sub="${i}" style="left:${s.start*state.zoom}px;width:${Math.max(6,(s.end-s.start)*state.zoom)}px">${esc(s.text)}</div>`).join('');
  }

  function updatePlayheadUI(){
    const x=HEADER_W + state.playhead*state.zoom; els.playhead.style.left=`${x}px`; els.timeText.textContent=`${fmt(state.playhead)} / ${fmt(projectDuration())}`;
  }

  els.timeline.onclick=e=>{
    if(e.target.closest('.tl-clip,.track-header,.subtitle-block,button,input'))return;
    const innerRect=els.timelineInner.getBoundingClientRect(); const t=(e.clientX-innerRect.left-HEADER_W+els.timeline.scrollLeft)/state.zoom; seekTo(clamp(t,0,projectDuration()));
  };

  function setZoom(v,anchorTime=state.playhead){
    state.zoom=clamp(Number(v)||90,MIN_ZOOM,MAX_ZOOM); els.zoomRange.value=state.zoom; els.zoomLabel.textContent=`${state.zoom}px/s`; renderTimeline();
    const target=HEADER_W+anchorTime*state.zoom-els.timeline.clientWidth/2; els.timeline.scrollLeft=Math.max(0,target);
  }
  els.zoomRange.oninput=()=>setZoom(els.zoomRange.value); els.zoomInBtn.onclick=()=>setZoom(state.zoom+15); els.zoomOutBtn.onclick=()=>setZoom(state.zoom-15);
  els.fitTimelineBtn.onclick=()=>{ const d=projectDuration(); const available=Math.max(300,els.timeline.clientWidth-HEADER_W-30); setZoom(clamp(available/d,MIN_ZOOM,MAX_ZOOM),0); els.timeline.scrollLeft=0; };
  els.timeline.addEventListener('wheel',e=>{ if(!e.ctrlKey)return; e.preventDefault(); setZoom(state.zoom+(e.deltaY<0?12:-12)); },{passive:false});

  function splitSelected(){
    const f=selectedClip(); if(!f)return; const {track,clip}=f; const t=state.playhead; if(t<=clip.start+.02||t>=clip.start+clip.duration-.02)return; snapshot();
    const leftDur=t-clip.start, rightDur=clip.duration-leftDur, right={...clip,id:uid('clip'),start:t,in:clip.in+leftDur,duration:rightDur,out:clip.out}; clip.duration=leftDur; clip.out=clip.in+leftDur;
    track.clips.push(right);
    for(const link of linkedClips(clip)){
      const lc=link.clip, lleft=t-lc.start, lright=lc.duration-lleft; const nr={...lc,id:uid('clip'),start:t,in:lc.in+lleft,duration:lright,out:lc.out,linkGroup:right.linkGroup||clip.linkGroup}; lc.duration=lleft; lc.out=lc.in+lleft; link.track.clips.push(nr);
    }
    state.selectedClipId=right.id; renderAll();
  }
  function deleteSelected(){
    const f=selectedClip(); if(!f)return; snapshot(); const ids=new Set([f.clip.id,...linkedClips(f.clip).map(x=>x.clip.id)]); for(const t of state.tracks)t.clips=t.clips.filter(c=>!ids.has(c.id)); state.selectedClipId=null; renderAll();
  }
  els.splitBtn.onclick=splitSelected; els.deleteClipBtn.onclick=deleteSelected; els.undoBtn.onclick=undo;

  function ensureMediaElement(clip,asset,track,z){
    let el=state.elementMap.get(clip.id);
    if(el)return el;
    if(asset.kind==='image'){
      el=new Image(); el.src=asset.url; el.className='stage-media stage-image'; els.stage.appendChild(el);
    }else if(track.type==='visual'){
      el=document.createElement('video'); el.src=asset.url; el.preload='auto'; el.playsInline=true; el.muted=true; el.className='stage-media'; els.stage.appendChild(el);
    }else{
      el=document.createElement('audio'); el.src=asset.url; el.preload='auto'; el.className='hidden-media'; document.body.appendChild(el);
    }
    state.elementMap.set(clip.id,el); return el;
  }

  function activeVisuals(t){
    const out=[]; state.tracks.forEach((track,ti)=>{ if(track.type!=='visual'||!track.visible)return; track.clips.forEach(c=>{ if(t>=c.start&&t<c.start+c.duration)out.push({track,clip:c,asset:assetById(c.assetId),z:ti}); }); }); return out;
  }
  function updateLayoutMode(t){
    document.body.classList.remove('media-portrait','media-landscape','media-square','media-audio');
    const vis=activeVisuals(t); const top=vis.at(-1)?.asset || assetById(state.selectedAssetId);
    if(!top || top.kind==='audio'){ document.body.classList.add('media-audio'); els.mediaInfo.textContent='音频工程'; return; }
    const ratio=(top.width||16)/(top.height||9); const mode=ratio<.86?'media-portrait':ratio>1.16?'media-landscape':'media-square'; document.body.classList.add(mode); els.mediaInfo.textContent=`${top.kind==='image'?'图像 · ':''}${mode==='media-portrait'?'竖屏':mode==='media-landscape'?'横屏':'方屏'} ${top.width||'?'}×${top.height||'?'}`;
  }

  function syncPreview(t,play){
    const active=new Set(); const visuals=activeVisuals(t); updateLayoutMode(t);
    visuals.forEach(({track,clip,asset,z})=>{
      const el=ensureMediaElement(clip,asset,track,z); active.add(clip.id); el.style.display='block'; el.style.zIndex=String(z+1); el.style.opacity=String(clip.opacity??1);
      if(asset.kind==='video'){
        const local=clip.in+(t-clip.start); if(Math.abs((el.currentTime||0)-local)>.12) try{el.currentTime=local;}catch{}
        if(play) el.play().catch(()=>{}); else el.pause();
      }
    });
    state.tracks.filter(x=>x.type==='audio'&&!x.muted).forEach((track,ti)=>track.clips.forEach(clip=>{
      if(t<clip.start||t>=clip.start+clip.duration)return; const asset=assetById(clip.assetId); const el=ensureMediaElement(clip,asset,track,ti); active.add(clip.id); el.volume=clamp(clip.volume??1,0,1); const local=clip.in+(t-clip.start); if(Math.abs((el.currentTime||0)-local)>.12)try{el.currentTime=local;}catch{} if(play)el.play().catch(()=>{}); else el.pause();
    }));
    for(const [id,el] of state.elementMap){ if(!active.has(id)){ if(el.tagName==='VIDEO'||el.tagName==='AUDIO')el.pause(); if(el.classList.contains('stage-media'))el.style.display='none'; } }
    els.audioOnlyPreview.classList.toggle('hidden',visuals.length>0);
    els.stage.classList.toggle('audio-stage',visuals.length===0);
  }

  function seekTo(t){ state.playhead=clamp(t,0,projectDuration()); if(state.playing)state.playStartClock=performance.now()-state.playhead*1000; syncPreview(state.playhead,state.playing); updatePlayheadUI(); }
  function startPlayback(){ if(state.playing)return; state.playing=true; state.playStartClock=performance.now()-state.playhead*1000; els.playBtn.textContent='❚❚'; syncPreview(state.playhead,true); tickPlayback(); }
  function stopPlayback(){ state.playing=false; cancelAnimationFrame(state.playbackRaf); els.playBtn.textContent='▶'; for(const el of state.elementMap.values())if(el.pause)el.pause(); }
  function tickPlayback(){ if(!state.playing)return; const t=(performance.now()-state.playStartClock)/1000; if(t>=projectDuration()){ seekTo(projectDuration()); stopPlayback(); return; } state.playhead=t; syncPreview(t,true); updatePlayheadUI(); state.playbackRaf=requestAnimationFrame(tickPlayback); }
  els.playBtn.onclick=()=>state.playing?stopPlayback():startPlayback();
  function stepFrame(dir){ stopPlayback(); const fps=Math.max(1,Number(els.fpsInput.value)||30); seekTo(state.playhead+dir/fps); }
  els.prevFrameBtn.onclick=()=>stepFrame(-1); els.nextFrameBtn.onclick=()=>stepFrame(1);

  els.storyboardBtn.onclick=()=>els.storyboardDialog.showModal(); els.generateStoryboardBtn.onclick=generateStoryboard;
  async function generateStoryboard(){
    const asset=assetById(state.selectedAssetId); if(!asset||asset.kind!=='video'){ alert('请先选择一个视频素材'); return; }
    const interval=Math.max(.1,Number(els.storyInterval.value)||1), v=document.createElement('video'); v.src=asset.url; v.muted=true; v.preload='auto'; await new Promise(r=>{v.onloadedmetadata=r;v.onerror=r;});
    const canvas=document.createElement('canvas'); canvas.width=320; canvas.height=Math.max(120,Math.round(320*(asset.height||9)/(asset.width||16))); const g=canvas.getContext('2d'); els.storyboardGrid.textContent='生成中…'; const cards=[];
    for(let t=0,n=0;t<asset.duration&&n<240;t+=interval,n++){ await new Promise(r=>{v.onseeked=()=>r();v.currentTime=Math.min(t,Math.max(0,asset.duration-.02));}); g.drawImage(v,0,0,canvas.width,canvas.height); cards.push({t,url:canvas.toDataURL('image/jpeg',.72)}); }
    els.storyboardGrid.innerHTML=cards.map(x=>`<div class="story-card" data-t="${x.t}"><img src="${x.url}"><div>${fmt(x.t)}</div></div>`).join(''); els.storyboardGrid.querySelectorAll('.story-card').forEach(c=>c.onclick=()=>{ const f=selectedClip(); seekTo((f?.clip.start||0)+Number(c.dataset.t)); els.storyboardDialog.close(); });
  }

  els.addSubtitleBtn.onclick=()=>{ snapshot(); state.subtitles.push({start:state.playhead,end:state.playhead+2,text:'新字幕'}); renderTimeline(); };
  els.exportSrtBtn.onclick=()=>{ const srt=state.subtitles.map((s,i)=>`${i+1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n'); downloadBlob(new Blob([srt],{type:'text/plain;charset=utf-8'}),'webCut.srt'); };

  els.asrBtn.onclick=()=>{ let cfg={}; try{cfg=JSON.parse(localStorage.getItem('webcut.asr')||'{}')}catch{} els.asrUrl.value=cfg.url||''; els.asrToken.value=cfg.token||''; els.asrField.value=cfg.field||'file'; els.asrDialog.showModal(); };
  function saveAsr(){ localStorage.setItem('webcut.asr',JSON.stringify({url:els.asrUrl.value.trim(),token:els.asrToken.value.trim(),field:els.asrField.value.trim()||'file'})); els.asrStatus.textContent='配置已保存'; }
  els.saveAsrConfigBtn.onclick=saveAsr;
  els.runAsrBtn.onclick=async()=>{
    const f=selectedClip(); const asset=assetById(f?.clip.assetId||state.selectedAssetId); if(!asset||asset.kind==='image'){ els.asrStatus.textContent='请选择视频或音频素材'; return; } saveAsr(); const url=els.asrUrl.value.trim(); if(!url){els.asrStatus.textContent='请填写 API 地址';return;}
    try{ els.asrStatus.textContent='正在本地提取 WAV…'; const wav=await extractWav(asset.file); const fd=new FormData(); fd.append(els.asrField.value.trim()||'file',wav,baseName(asset)+'.wav'); const headers={}; if(els.asrToken.value.trim())headers.Authorization=`Bearer ${els.asrToken.value.trim()}`; els.asrStatus.textContent='正在调用 Qwen ASR…'; const res=await fetch(url,{method:'POST',headers,body:fd}); const raw=await res.text(); if(!res.ok)throw new Error(`${res.status} ${raw.slice(0,300)}`); let data; try{data=JSON.parse(raw)}catch{data={text:raw}} const parsed=parseAsr(data), offset=f?.clip.start||0; snapshot(); const segs=parsed.segments.length?parsed.segments:[{start:0,end:asset.duration,text:parsed.text||''}]; state.subtitles.push(...segs.map(s=>({start:offset+s.start,end:offset+s.end,text:s.text}))); renderTimeline(); els.asrStatus.textContent=`识别完成：${parsed.text||''}`; }
    catch(err){ els.asrStatus.textContent='失败：'+friendlyFFmpegError(err); }
  };
  function parseAsr(data){ const root=data?.data??data?.result??data; const text=root?.text??root?.transcript??data?.text??''; let seg=root?.segments??root?.chunks??root?.words??[]; seg=(Array.isArray(seg)?seg:[]).map(x=>({start:Number(x.start??x.start_time??x.timestamp?.[0]??0),end:Number(x.end??x.end_time??x.timestamp?.[1]??0),text:String(x.text??x.word??'')})).filter(x=>x.text); return {text:String(text||seg.map(x=>x.text).join(' ')),segments:seg}; }

  els.exportBtn.onclick=()=>{ const hasVisual=state.tracks.some(t=>t.type==='visual'&&t.clips.length); els.exportType.value=hasVisual?'video':'audio'; els.exportDialog.showModal(); };
  els.runExportBtn.onclick=exportProject;

  function simpleSingleVideo(){
    const visuals=state.tracks.filter(t=>t.type==='visual'&&t.visible).flatMap(t=>t.clips.map(c=>({t,c}))); const audios=state.tracks.filter(t=>t.type==='audio'&&!t.muted).flatMap(t=>t.clips.map(c=>({t,c}))); if(visuals.length!==1)return null; const v=visuals[0], a=assetById(v.c.assetId); if(a.kind!=='video')return null; const related=audios.filter(x=>x.c.assetId===a.id&&x.c.linkGroup===v.c.linkGroup); if(audios.length!==related.length)return null; return {asset:a,clip:v.c};
  }

  async function exportProject(){
    try{
      const type=els.exportType.value; let fmt=els.exportFormat.value; const simple=simpleSingleVideo();
      if(simple && type==='video' && fmt==='original'){
        const {asset,clip}=simple; const ext=(asset.file.name.split('.').pop()||'mp4').toLowerCase();
        if(clip.start<=.001 && clip.in<=.001 && Math.abs(clip.duration-asset.duration)<.02){ downloadBlob(asset.file,`${baseName(asset)}_cut.${ext}`); els.exportStatus.textContent='导出完成（原始文件，无重编码）'; return; }
        els.exportStatus.textContent='正在加载浏览器本地 FFmpeg…'; const ff=await getFFmpeg(); const input=`input.${ext}`, out=`output.${ext}`; await safeDelete(ff,input);await safeDelete(ff,out);await ff.writeFile(input,new Uint8Array(await asset.file.arrayBuffer())); await ff.exec(['-ss',clip.in.toFixed(3),'-t',clip.duration.toFixed(3),'-i',input,'-c','copy',out]); const data=await ff.readFile(out); downloadBlob(new Blob([data.buffer]),`${baseName(asset)}_cut.${ext}`); els.exportStatus.textContent='导出完成（无重编码裁剪）'; return;
      }
      if(fmt==='original')fmt=type==='video'?'mp4':'wav';
      els.exportStatus.textContent='正在加载浏览器本地 FFmpeg…'; const ff=await getFFmpeg(); const usedIds=new Set();
      for(const t of state.tracks)for(const c of t.clips)usedIds.add(c.assetId); const used=[...usedIds].map(assetById).filter(Boolean); const inputIndex=new Map(); const args=[];
      for(let i=0;i<used.length;i++){ const a=used[i], ext=(a.file.name.split('.').pop()||'bin').toLowerCase(), name=`asset_${i}.${ext}`; await safeDelete(ff,name); await ff.writeFile(name,new Uint8Array(await a.file.arrayBuffer())); inputIndex.set(a.id,i); if(a.kind==='image')args.push('-loop','1'); args.push('-i',name); }
      const D=projectDuration(), filters=[]; let videoLabel='';
      if(type==='video'){
        const visualTracks=state.tracks.filter(t=>t.type==='visual'&&t.visible); const visualClips=visualTracks.flatMap((t,ti)=>t.clips.map(c=>({track:t,clip:c,ti}))).sort((a,b)=>a.ti-b.ti); const first=visualClips[0]&&assetById(visualClips[0].clip.assetId); const W=first?.width||1280,H=first?.height||720; filters.push(`color=c=black:s=${W}x${H}:r=30:d=${D}[base0]`); let prev='base0',n=0;
        for(const item of visualClips){ const c=item.clip,a=assetById(c.assetId),idx=inputIndex.get(a.id),label=`vx${n}`, next=`base${n+1}`; if(a.kind==='image')filters.push(`[${idx}:v]loop=loop=-1:size=1:start=0,trim=duration=${c.duration},setpts=PTS-STARTPTS+${c.start}/TB,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${c.opacity??1}[${label}]`); else filters.push(`[${idx}:v]trim=start=${c.in}:end=${c.out},setpts=PTS-STARTPTS+${c.start}/TB,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${c.opacity??1}[${label}]`); filters.push(`[${prev}][${label}]overlay=0:0:enable='between(t,${c.start},${c.start+c.duration})'[${next}]`); prev=next;n++; }
        videoLabel=prev;
      }
      const audioClips=state.tracks.filter(t=>t.type==='audio'&&!t.muted).flatMap(t=>t.clips.map(c=>({track:t,clip:c}))); const aLabels=[]; let ai=0;
      for(const {clip:c} of audioClips){ const a=assetById(c.assetId); if(a.kind==='image'||a.hasAudio===false)continue; const idx=inputIndex.get(a.id), lab=`ax${ai++}`, delay=Math.max(0,Math.round(c.start*1000)); filters.push(`[${idx}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`); aLabels.push(lab); }
      let audioLabel=''; if(aLabels.length===1){filters.push(`[${aLabels[0]}]anull[aout]`);audioLabel='aout';} else if(aLabels.length>1){filters.push(`${aLabels.map(x=>`[${x}]`).join('')}amix=inputs=${aLabels.length}:normalize=0,atrim=duration=${D}[aout]`);audioLabel='aout';}
      const out=`output.${fmt}`; await safeDelete(ff,out); const cmd=[...args]; if(filters.length)cmd.push('-filter_complex',filters.join(';')); if(type==='video'){cmd.push('-map',`[${videoLabel}]`); if(audioLabel)cmd.push('-map',`[${audioLabel}]`); if(fmt==='webm')cmd.push('-c:v','libvpx-vp9','-crf','32','-b:v','0',...(audioLabel?['-c:a','libopus','-b:a','160k']:[])); else cmd.push('-c:v','libx264','-preset','veryfast','-crf','20',...(audioLabel?['-c:a','aac','-b:a','192k']:[]));} else { if(!audioLabel)throw new Error('没有可导出的音频轨'); cmd.push('-map',`[${audioLabel}]`,...audioCodecArgs(fmt)); }
      cmd.push('-t',D.toFixed(3),out); els.exportStatus.textContent='正在本机合成 / 转码…'; await ff.exec(cmd); const data=await ff.readFile(out); downloadBlob(new Blob([data.buffer]),`webCut_export.${fmt}`); els.exportStatus.textContent='导出完成';
    }catch(err){ els.exportStatus.textContent='导出失败：'+friendlyFFmpegError(err); }
  }

  function audioCodecArgs(fmt){ if(fmt==='wav')return['-c:a','pcm_s16le']; if(fmt==='mp3')return['-c:a','libmp3lame','-q:a','2']; if(fmt==='flac')return['-c:a','flac']; if(fmt==='webm'||fmt==='opus')return['-c:a','libopus','-b:a','160k']; return['-c:a','aac','-b:a','192k']; }
  async function loadFFmpegModules(){ const m=await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15'); const u=await import('https://esm.sh/@ffmpeg/util@0.12.2'); return {FFmpeg:m.FFmpeg,toBlobURL:u.toBlobURL}; }
  async function getFFmpeg(){
    if(state.ffmpeg)return state.ffmpeg; const {FFmpeg,toBlobURL}=await loadFFmpegModules(); const ff=new FFmpeg(); ff.on('progress',({progress})=>{ if(els.exportDialog.open)els.exportStatus.textContent=`处理中 ${(Math.max(0,progress)*100).toFixed(1)}%`; }); const workerBootstrap='import "https://esm.sh/@ffmpeg/ffmpeg@0.12.15/es2022/worker.js";'; const classWorkerURL=URL.createObjectURL(new Blob([workerBootstrap],{type:'text/javascript'})); const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'; try{await ff.load({classWorkerURL,coreURL:await toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),wasmURL:await toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')});}finally{setTimeout(()=>URL.revokeObjectURL(classWorkerURL),1000);} state.ffmpeg=ff; return ff;
  }
  async function extractWav(file){ const ff=await getFFmpeg(); const ext=(file.name.split('.').pop()||'bin').toLowerCase(),input=`asr_input.${ext}`,out='asr.wav'; await safeDelete(ff,input);await safeDelete(ff,out);await ff.writeFile(input,new Uint8Array(await file.arrayBuffer()));await ff.exec(['-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);const data=await ff.readFile(out);return new Blob([data.buffer],{type:'audio/wav'}); }
  async function safeDelete(ff,name){try{await ff.deleteFile(name)}catch{}}
  function friendlyFFmpegError(err){ const msg=String(err?.message||err||'未知错误'); if(/failed to import ffmpeg-core/i.test(msg))return msg+'\n请 Ctrl+F5 刷新，确保 ffmpeg-worker.js 是最新版。'; if(/Failed to fetch|fetch/i.test(msg))return msg+'\n首次使用 FFmpeg 需要联网加载 WASM 核心。'; return msg; }
  function downloadBlob(blob,name){ const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000); }

  function renderAll(){ renderAssets(); renderTimeline(); renderInspector(); syncPreview(state.playhead,false); }
  window.addEventListener('keydown',e=>{ if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return; if(e.code==='Space'){e.preventDefault();state.playing?stopPlayback():startPlayback();} else if(e.key==='ArrowLeft')stepFrame(-1); else if(e.key==='ArrowRight')stepFrame(1); else if(e.key.toLowerCase()==='s')splitSelected(); else if(e.key==='Delete')deleteSelected(); });
  window.addEventListener('beforeunload',()=>state.assets.forEach(a=>URL.revokeObjectURL(a.url)));

  rebuildCategoryUI(); createTrack('visual','视频/图像 1'); createTrack('audio','音频 1'); state.selectedTrackId=state.tracks[0].id; els.zoomRange.min=MIN_ZOOM;els.zoomRange.max=MAX_ZOOM;els.zoomRange.value=state.zoom;els.zoomLabel.textContent=`${state.zoom}px/s`; renderAll();
})();
