(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = {};
  [
    'openVideoBtn','addImageBtn','addAudioBtn','mainVideoInput','imageInput','audioInput',
    'stage','emptyPreview','audioOnlyPreview','playBtn','prevFrameBtn','nextFrameBtn','timeText','fpsInput','mediaInfo','storyboardBtn',
    'inspectorEmpty','inspectorContent','fileName','clipTrack','clipStart','clipIn','clipOut','clipDuration','clipVolume','clipOpacity',
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

  const state = {
    assets: [],
    mainVideoId: null,
    tracks: [],
    subtitles: [],
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
    ffmpegPromise: null,
  };

  const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (t=0) => {
    t = Math.max(0, Number(t)||0);
    const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);
    return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  };
  const srtTime = t => {
    const h=Math.floor(t/3600); t%=3600; const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);
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
    let d=0;
    for(const t of state.tracks) for(const c of t.clips) d=Math.max(d,c.start+c.duration);
    for(const s of state.subtitles) d=Math.max(d,s.end);
    return Math.max(.1,d);
  }
  function baseName(asset){ return (asset?.file?.name || 'webCut').replace(/\.[^.]+$/,''); }
  function fileExt(file){ return (file.name.split('.').pop() || 'bin').toLowerCase(); }

  function createTrack(type,name){
    const n=state.tracks.filter(t=>t.type===type).length+1;
    const track={id:uid('track'),type,name:name||(type==='visual'?`视频/图像 ${n}`:`音频 ${n}`),clips:[],visible:true,muted:false};
    state.tracks.push(track);
    return track;
  }

  function resetProject(){
    stopPlayback();
    for(const el of state.elementMap.values()){ try{el.pause?.();}catch{} el.remove?.(); }
    state.elementMap.clear();
    for(const a of state.assets) try{URL.revokeObjectURL(a.url);}catch{}
    state.assets=[]; state.mainVideoId=null; state.tracks=[]; state.subtitles=[]; state.selectedTrackId=null; state.selectedClipId=null; state.playhead=0; state.undo=[];
    createTrack('visual','视频/图像 1'); createTrack('audio','音频 1'); state.selectedTrackId=state.tracks[0].id;
    renderAll();
  }

  function snapshot(){
    state.undo.push(JSON.stringify({tracks:state.tracks,subtitles:state.subtitles,selectedTrackId:state.selectedTrackId,selectedClipId:state.selectedClipId,playhead:state.playhead}));
    if(state.undo.length>40) state.undo.shift();
  }
  function undo(){
    const raw=state.undo.pop(); if(!raw) return;
    const s=JSON.parse(raw); state.tracks=s.tracks; state.subtitles=s.subtitles; state.selectedTrackId=s.selectedTrackId; state.selectedClipId=s.selectedClipId; state.playhead=s.playhead;
    stopPlayback(); renderAll();
  }

  async function readMetadata(file,kind,url){
    if(kind==='image') return await new Promise(resolve=>{ const img=new Image(); img.onload=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:img.naturalWidth||0,height:img.naturalHeight||0}); img.onerror=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:0,height:0}); img.src=url; });
    const tag=document.createElement(kind==='audio'?'audio':'video'); tag.preload='metadata'; tag.src=url;
    return await new Promise(resolve=>{
      const done=()=>{ cleanup(); resolve({duration:Number.isFinite(tag.duration)?tag.duration:0,width:tag.videoWidth||0,height:tag.videoHeight||0}); };
      const cleanup=()=>{tag.removeEventListener('loadedmetadata',done);tag.removeEventListener('error',done)};
      tag.addEventListener('loadedmetadata',done); tag.addEventListener('error',done); tag.load();
    });
  }

  async function makeAsset(file,kind){
    const url=URL.createObjectURL(file);
    const meta=await readMetadata(file,kind,url);
    const asset={id:uid('asset'),file,kind,url,duration:meta.duration||0,width:meta.width||0,height:meta.height||0,peaks:null,hasAudio:kind==='audio'?true:null};
    state.assets.push(asset);
    return asset;
  }

  els.openVideoBtn.onclick=()=>{ els.mainVideoInput.value=''; els.mainVideoInput.click(); };
  els.mainVideoInput.onchange=async e=>{
    const file=e.target.files?.[0]; if(!file) return;
    if(state.mainVideoId && !confirm('打开新视频会清空当前工程，继续吗？')) return;
    resetProject();
    const asset=await makeAsset(file,'video'); state.mainVideoId=asset.id;
    const vt=state.tracks.find(t=>t.type==='visual');
    const pairId=uid('pair');
    const vclip={id:uid('clip'),assetId:asset.id,start:0,in:0,out:asset.duration,duration:asset.duration,volume:1,opacity:1,pairId};
    vt.clips.push(vclip); state.selectedTrackId=vt.id; state.selectedClipId=vclip.id;
    renderAll();

    // Do not block video opening on waveform generation. Add the linked audio clip when audio decode succeeds.
    ensurePeaks(asset).then(peaks=>{
      if(!peaks || !assetById(asset.id)) return;
      const at=state.tracks.find(t=>t.type==='audio') || createTrack('audio','音频 1');
      if(!at.clips.some(c=>c.pairId===pairId)) at.clips.push({id:uid('clip'),assetId:asset.id,start:0,in:0,out:asset.duration,duration:asset.duration,volume:1,opacity:1,pairId});
      renderTimeline();
    }).catch(err=>console.warn('[webCut] waveform failed:',err));
  };

  els.addImageBtn.onclick=()=>{ if(!state.mainVideoId){alert('请先打开主视频');return;} els.imageInput.value=''; els.imageInput.click(); };
  els.imageInput.onchange=async e=>{
    for(const file of [...(e.target.files||[])]){
      const asset=await makeAsset(file,'image');
      let track=trackById(state.selectedTrackId); if(!track || track.type!=='visual') track=createTrack('visual');
      snapshot(); const clip={id:uid('clip'),assetId:asset.id,start:state.playhead,in:0,out:IMAGE_DEFAULT_DURATION,duration:IMAGE_DEFAULT_DURATION,volume:1,opacity:1,pairId:null};
      track.clips.push(clip); state.selectedTrackId=track.id; state.selectedClipId=clip.id;
    }
    renderAll();
  };

  els.addAudioBtn.onclick=()=>{ if(!state.mainVideoId){alert('请先打开主视频');return;} els.audioInput.value=''; els.audioInput.click(); };
  els.audioInput.onchange=async e=>{
    for(const file of [...(e.target.files||[])]){
      const asset=await makeAsset(file,'audio');
      let track=trackById(state.selectedTrackId); if(!track || track.type!=='audio') track=createTrack('audio');
      snapshot(); const clip={id:uid('clip'),assetId:asset.id,start:state.playhead,in:0,out:asset.duration,duration:asset.duration,volume:1,opacity:1,pairId:null};
      track.clips.push(clip); state.selectedTrackId=track.id; state.selectedClipId=clip.id;
      ensurePeaks(asset).then(()=>renderTimeline()).catch(()=>{});
    }
    renderAll();
  };

  async function ensurePeaks(asset){
    if(asset.peaks) return asset.peaks;
    if(asset.kind==='image') return null;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C) return null;
    let ctx=new C();
    try{
      const arr=await asset.file.arrayBuffer();
      let decoded;
      try{ decoded=await ctx.decodeAudioData(arr.slice(0)); }
      catch(nativeErr){
        try{await ctx.close();}catch{}
        const wav=await extractWavFromAsset(asset);
        ctx=new C(); decoded=await ctx.decodeAudioData(wav.slice(0));
      }
      const data=decoded.getChannelData(0), bins=1800, peaks=[], step=Math.max(1,Math.floor(data.length/bins));
      for(let i=0;i<bins;i++){
        let mn=1,mx=-1; const st=i*step,en=Math.min(data.length,st+step);
        for(let j=st;j<en;j++){const v=data[j];if(v<mn)mn=v;if(v>mx)mx=v;}
        peaks.push([mn===1?0:mn,mx===-1?0:mx]);
      }
      asset.peaks=peaks; asset.hasAudio=true; return peaks;
    }catch(err){ asset.hasAudio=false; console.warn('[webCut] cannot build waveform:',err); return null; }
    finally{try{await ctx.close();}catch{}}
  }

  async function extractWavFromAsset(asset){
    const ff=await getFFmpeg(); const input=`wave_${asset.id}.${fileExt(asset.file)}`,out=`wave_${asset.id}.wav`;
    await safeDelete(ff,input); await safeDelete(ff,out);
    await ff.writeFile(input,new Uint8Array(await asset.file.arrayBuffer()));
    const code=await ff.exec(['-hide_banner','-loglevel','error','-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);
    if(code!==0) throw new Error('视频中没有可解码音频');
    const data=await ff.readFile(out);
    return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  }

  function pairMates(clip){
    if(!clip?.pairId) return [];
    const out=[];
    for(const t of state.tracks) for(const c of t.clips) if(c.pairId===clip.pairId && c.id!==clip.id) out.push({track:t,clip:c});
    return out;
  }

  function renderInspector(){
    const f=selectedClip();
    if(!f){ els.inspectorEmpty.classList.remove('hidden'); els.inspectorContent.classList.add('hidden'); return; }
    const {track,clip}=f,asset=assetById(clip.assetId);
    els.inspectorEmpty.classList.add('hidden'); els.inspectorContent.classList.remove('hidden');
    els.fileName.textContent=asset?.file?.name||'-'; els.clipTrack.textContent=track.name;
    els.clipStart.value=clip.start.toFixed(3); els.clipIn.value=clip.in.toFixed(3); els.clipOut.value=clip.out.toFixed(3); els.clipDuration.value=clip.duration.toFixed(3); els.clipVolume.value=Math.round((clip.volume??1)*100); els.clipOpacity.value=Math.round((clip.opacity??1)*100);
    document.body.classList.toggle('selected-audio',track.type==='audio');
    document.querySelector('.visual-only')?.classList.toggle('hidden',track.type!=='visual');
    document.querySelector('.audio-only-field')?.classList.toggle('hidden',track.type!=='audio');
  }

  function applyField(field){
    const f=selectedClip(); if(!f) return; snapshot();
    const {clip}=f,asset=assetById(clip.assetId),old={start:clip.start,in:clip.in,duration:clip.duration};
    if(field==='start') clip.start=Math.max(0,Number(els.clipStart.value)||0);
    if(field==='in') clip.in=clamp(Number(els.clipIn.value)||0,0,Math.max(0,clip.out-.02));
    if(field==='out') clip.out=asset.kind==='image'?Math.max(clip.in+.02,Number(els.clipOut.value)||clip.out):clamp(Number(els.clipOut.value)||clip.out,clip.in+.02,asset.duration||clip.out);
    if(field==='duration'){
      const d=Math.max(.05,Number(els.clipDuration.value)||clip.duration); clip.duration=asset.kind==='image'?d:Math.min(d,Math.max(.05,(asset.duration||clip.out)-clip.in)); clip.out=clip.in+clip.duration;
    }else clip.duration=Math.max(.05,clip.out-clip.in);
    if(field==='volume') clip.volume=clamp((Number(els.clipVolume.value)||0)/100,0,2);
    if(field==='opacity') clip.opacity=clamp((Number(els.clipOpacity.value)||0)/100,0,1);
    const ds=clip.start-old.start,di=clip.in-old.in;
    for(const m of pairMates(clip)){
      if(field==='start') m.clip.start+=ds;
      if(field==='in'){m.clip.in+=di;m.clip.duration=clip.duration;m.clip.out=m.clip.in+m.clip.duration;}
      if(field==='out'||field==='duration'){m.clip.duration=clip.duration;m.clip.out=m.clip.in+m.clip.duration;}
    }
    renderAll();
  }
  els.clipStart.onchange=()=>applyField('start'); els.clipIn.onchange=()=>applyField('in'); els.clipOut.onchange=()=>applyField('out'); els.clipDuration.onchange=()=>applyField('duration'); els.clipVolume.onchange=()=>applyField('volume'); els.clipOpacity.onchange=()=>applyField('opacity');

  function laneWidth(){return Math.max(900,Math.ceil(projectDuration()*state.zoom)+80)}
  function renderRuler(){
    const w=laneWidth(),d=projectDuration(); els.ruler.style.width=`${HEADER_W+w}px`;
    let tick=1;if(state.zoom<40)tick=5;else if(state.zoom<70)tick=2;else if(state.zoom>160)tick=.5;
    let html=`<div class="ruler-head" style="width:${HEADER_W}px"></div><div class="ruler-lane" style="width:${w}px">`;
    for(let t=0;t<=d+tick;t+=tick) html+=`<span class="tick" style="left:${t*state.zoom}px"><i></i><b>${fmt(t).replace('.000','')}</b></span>`;
    els.ruler.innerHTML=html+'</div>';
  }

  function renderTimeline(){
    const w=laneWidth(); renderRuler();
    els.tracksContainer.innerHTML=state.tracks.map(track=>{
      const clips=track.clips.map(c=>{
        const a=assetById(c.assetId); if(!a) return '';
        const left=c.start*state.zoom,width=Math.max(6,c.duration*state.zoom),visualClass=track.type==='audio'?'audio':a.kind;
        return `<div class="tl-clip ${visualClass} ${c.id===state.selectedClipId?'selected':''}" data-clip="${c.id}" style="left:${left}px;width:${width}px"><div class="trim-handle left" data-handle="left"></div><span>${track.type==='audio'?'🎵':a.kind==='image'?'🖼️':'🎬'} ${esc(a.file.name)}</span>${track.type==='audio'?'<canvas class="clip-wave"></canvas>':''}<div class="trim-handle right" data-handle="right"></div></div>`;
      }).join('');
      const controls=track.type==='visual'?`<button data-action="vis">${track.visible?'👁':'🚫'}</button><button data-action="up">↑</button><button data-action="down">↓</button>`:`<button data-action="mute">${track.muted?'🔇':'🔊'}</button>`;
      return `<div class="track-row ${track.id===state.selectedTrackId?'selected-track':''}" data-track="${track.id}"><div class="track-header" style="width:${HEADER_W}px"><strong>${esc(track.name)}</strong><div>${controls}</div></div><div class="track-lane" style="width:${w}px">${clips}</div></div>`;
    }).join('')+`<div class="track-row subtitle-row"><div class="track-header" style="width:${HEADER_W}px"><strong>字幕</strong></div><div id="subtitleTrack" class="track-lane subtitle-lane" style="width:${w}px"></div></div>`;
    els.subtitleTrack=$('subtitleTrack'); renderSubtitles(); bindTimeline(); drawAllWaveforms(); updatePlayheadUI(); els.timelineInner.style.width=`${HEADER_W+w}px`;
  }

  function bindTimeline(){
    els.tracksContainer.querySelectorAll('.track-row[data-track]').forEach(row=>{
      const track=trackById(row.dataset.track);
      row.querySelector('.track-header').onclick=e=>{
        const act=e.target.closest('button')?.dataset.action;
        if(act){snapshot();if(act==='vis')track.visible=!track.visible;if(act==='mute')track.muted=!track.muted;if(act==='up'||act==='down')moveTrack(track.id,act==='up'?-1:1);renderAll();return;}
        state.selectedTrackId=track.id;state.selectedClipId=null;renderTimeline();renderInspector();
      };
    });
    els.tracksContainer.querySelectorAll('.tl-clip').forEach(node=>{
      node.onclick=e=>{e.stopPropagation();state.selectedClipId=node.dataset.clip;const f=findClip(state.selectedClipId);state.selectedTrackId=f.track.id;renderTimeline();renderInspector();syncPreview(state.playhead,false)};
      node.onpointerdown=e=>startDrag(e,node.dataset.clip,e.target.dataset.handle||'move');
    });
  }

  function moveTrack(id,dir){const i=state.tracks.findIndex(t=>t.id===id);if(i<0)return;const j=clamp(i+dir,0,state.tracks.length-1);if(i===j)return;const[t]=state.tracks.splice(i,1);state.tracks.splice(j,0,t)}

  function startDrag(e,clipId,mode){
    e.preventDefault();e.stopPropagation();const f=findClip(clipId);if(!f)return;const{clip}=f;state.selectedClipId=clip.id;state.selectedTrackId=f.track.id;snapshot();
    const x0=e.clientX,orig={start:clip.start,in:clip.in,out:clip.out,duration:clip.duration},asset=assetById(clip.assetId),mates=pairMates(clip).map(x=>({clip:x.clip,start:x.clip.start,in:x.clip.in,out:x.clip.out,duration:x.clip.duration}));
    const move=ev=>{
      const dt=(ev.clientX-x0)/state.zoom;
      if(mode==='move'){const ns=Math.max(0,orig.start+dt),d=ns-orig.start;clip.start=ns;mates.forEach(x=>x.clip.start=x.start+d)}
      else if(mode==='left'){let d=Math.max(dt,-orig.in);d=Math.min(d,orig.duration-.05);clip.start=Math.max(0,orig.start+d);const actual=clip.start-orig.start;clip.in=orig.in+actual;clip.duration=orig.duration-actual;clip.out=clip.in+clip.duration;mates.forEach(x=>{x.clip.start=x.start+actual;x.clip.in=x.in+actual;x.clip.duration=x.duration-actual;x.clip.out=x.clip.in+x.clip.duration})}
      else{let dur=Math.max(.05,orig.duration+dt);if(asset.kind!=='image')dur=Math.min(dur,Math.max(.05,(asset.duration||orig.out)-orig.in));clip.duration=dur;clip.out=clip.in+dur;mates.forEach(x=>{x.clip.duration=dur;x.clip.out=x.clip.in+dur})}
      renderTimeline();renderInspector();syncPreview(state.playhead,false);
    };
    const up=()=>window.removeEventListener('pointermove',move);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
  }

  function drawAllWaveforms(){
    document.querySelectorAll('.clip-wave').forEach(canvas=>{
      const node=canvas.closest('.tl-clip'),f=findClip(node.dataset.clip);if(!f)return;const asset=assetById(f.clip.assetId);
      ensurePeaks(asset).then(peaks=>{if(peaks)drawClipWave(canvas,asset,f.clip)}).catch(()=>{});
    });
  }
  function drawClipWave(canvas,asset,clip){
    if(!asset.peaks||!canvas.isConnected)return;const r=canvas.getBoundingClientRect();if(r.width<2||r.height<2)return;const dpr=devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,r.width,r.height);g.strokeStyle='#7158d3';g.lineWidth=1;g.globalAlpha=.95;g.beginPath();
    const p0=Math.floor((asset.duration?clip.in/asset.duration:0)*asset.peaks.length),p1=Math.max(p0+1,Math.ceil((asset.duration?clip.out/asset.duration:1)*asset.peaks.length));
    for(let x=0;x<r.width;x++){const pi=Math.min(p1-1,p0+Math.floor((x/Math.max(1,r.width))*(p1-p0))),p=asset.peaks[pi]||[0,0],mid=r.height/2;g.moveTo(x,mid+p[0]*mid*.86);g.lineTo(x,mid+p[1]*mid*.86)}g.stroke();
  }

  function renderSubtitles(){if(!els.subtitleTrack)return;els.subtitleTrack.innerHTML=state.subtitles.map((s,i)=>`<div class="subtitle-block" data-sub="${i}" style="left:${s.start*state.zoom}px;width:${Math.max(6,(s.end-s.start)*state.zoom)}px">${esc(s.text)}</div>`).join('')}
  function updatePlayheadUI(){els.playhead.style.left=`${HEADER_W+state.playhead*state.zoom}px`;els.timeText.textContent=`${fmt(state.playhead)} / ${fmt(projectDuration())}`}

  els.timeline.onclick=e=>{if(e.target.closest('.tl-clip,.track-header,.subtitle-block,button,input'))return;const r=els.timelineInner.getBoundingClientRect(),t=(e.clientX-r.left-HEADER_W+els.timeline.scrollLeft)/state.zoom;seekTo(clamp(t,0,projectDuration()))};
  function setZoom(v,anchor=state.playhead){state.zoom=clamp(Number(v)||90,MIN_ZOOM,MAX_ZOOM);els.zoomRange.value=state.zoom;els.zoomLabel.textContent=`${state.zoom}px/s`;renderTimeline();els.timeline.scrollLeft=Math.max(0,HEADER_W+anchor*state.zoom-els.timeline.clientWidth/2)}
  els.zoomRange.oninput=()=>setZoom(els.zoomRange.value);els.zoomInBtn.onclick=()=>setZoom(state.zoom+15);els.zoomOutBtn.onclick=()=>setZoom(state.zoom-15);els.fitTimelineBtn.onclick=()=>{setZoom(clamp(Math.max(300,els.timeline.clientWidth-HEADER_W-30)/projectDuration(),MIN_ZOOM,MAX_ZOOM),0);els.timeline.scrollLeft=0};els.timeline.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(state.zoom+(e.deltaY<0?12:-12))},{passive:false});

  function splitSelected(){
    const f=selectedClip();if(!f)return;const{track,clip}=f,t=state.playhead;if(t<=clip.start+.02||t>=clip.start+clip.duration-.02)return;snapshot();
    const offset=t-clip.start,rightDur=clip.duration-offset,newPair=clip.pairId?uid('pair'):null;
    const right={...clip,id:uid('clip'),start:t,in:clip.in+offset,duration:rightDur,out:clip.out,pairId:newPair};
    clip.duration=offset;clip.out=clip.in+offset;track.clips.push(right);
    for(const m of pairMates(clip)){
      const mc=m.clip,mright={...mc,id:uid('clip'),start:t,in:mc.in+offset,duration:rightDur,out:mc.out,pairId:newPair};
      mc.duration=offset;mc.out=mc.in+offset;m.track.clips.push(mright);
    }
    state.selectedClipId=right.id;renderAll();
  }

  function deleteSelected(){
    const f=selectedClip();if(!f)return;snapshot();
    const ids=new Set([f.clip.id,...pairMates(f.clip).map(x=>x.clip.id)]);
    for(const t of state.tracks)t.clips=t.clips.filter(c=>!ids.has(c.id));
    state.selectedClipId=null;renderAll();
  }
  els.splitBtn.onclick=splitSelected;els.deleteClipBtn.onclick=deleteSelected;els.undoBtn.onclick=undo;
  els.addVisualTrackBtn.onclick=()=>{snapshot();const t=createTrack('visual');state.selectedTrackId=t.id;renderTimeline()};els.addAudioTrackBtn.onclick=()=>{snapshot();const t=createTrack('audio');state.selectedTrackId=t.id;renderTimeline()};

  function ensureMediaElement(clip,asset,track,z){
    let el=state.elementMap.get(clip.id);if(el)return el;
    if(asset.kind==='image'){el=new Image();el.src=asset.url;el.className='stage-media stage-image';els.stage.appendChild(el)}
    else if(track.type==='visual'){el=document.createElement('video');el.src=asset.url;el.preload='auto';el.playsInline=true;el.muted=true;el.className='stage-media';els.stage.appendChild(el)}
    else{el=document.createElement('audio');el.src=asset.url;el.preload='auto';el.className='hidden-media';document.body.appendChild(el)}
    state.elementMap.set(clip.id,el);return el;
  }
  function activeVisuals(t){const out=[];state.tracks.forEach((track,ti)=>{if(track.type!=='visual'||!track.visible)return;track.clips.forEach(c=>{if(t>=c.start&&t<c.start+c.duration)out.push({track,clip:c,asset:assetById(c.assetId),z:ti})})});return out}
  function updateLayoutMode(t){
    document.body.classList.remove('media-portrait','media-landscape','media-square','media-audio');const vis=activeVisuals(t),top=vis.at(-1)?.asset||assetById(state.mainVideoId);
    if(!top){document.body.classList.add('media-audio');els.mediaInfo.textContent='未载入';return}const ratio=(top.width||16)/(top.height||9),mode=ratio<.86?'media-portrait':ratio>1.16?'media-landscape':'media-square';document.body.classList.add(mode);els.mediaInfo.textContent=`${mode==='media-portrait'?'竖屏':mode==='media-landscape'?'横屏':'方屏'} ${top.width||'?'}×${top.height||'?'}`;
  }
  function syncPreview(t,play){
    const active=new Set(),visuals=activeVisuals(t);updateLayoutMode(t);
    visuals.forEach(({track,clip,asset,z})=>{if(!asset)return;const el=ensureMediaElement(clip,asset,track,z);active.add(clip.id);el.style.display='block';el.style.zIndex=String(z+1);el.style.opacity=String(clip.opacity??1);if(asset.kind==='video'){const local=clip.in+(t-clip.start);if(Math.abs((el.currentTime||0)-local)>.12)try{el.currentTime=local}catch{};if(play)el.play().catch(()=>{});else el.pause()}});
    state.tracks.filter(x=>x.type==='audio'&&!x.muted).forEach((track,ti)=>track.clips.forEach(clip=>{if(t<clip.start||t>=clip.start+clip.duration)return;const asset=assetById(clip.assetId);if(!asset)return;const el=ensureMediaElement(clip,asset,track,ti);active.add(clip.id);el.volume=clamp(clip.volume??1,0,1);const local=clip.in+(t-clip.start);if(Math.abs((el.currentTime||0)-local)>.12)try{el.currentTime=local}catch{};if(play)el.play().catch(()=>{});else el.pause()}));
    for(const[id,el]of state.elementMap)if(!active.has(id)){try{el.pause?.()}catch{}if(el.classList.contains('stage-media'))el.style.display='none'}
    els.emptyPreview.classList.toggle('hidden',visuals.length>0);els.audioOnlyPreview.classList.add('hidden');
  }
  function seekTo(t){state.playhead=clamp(t,0,projectDuration());if(state.playing)state.playStartClock=performance.now()-state.playhead*1000;syncPreview(state.playhead,state.playing);updatePlayheadUI()}
  function startPlayback(){if(state.playing)return;state.playing=true;state.playStartClock=performance.now()-state.playhead*1000;els.playBtn.textContent='❚❚';syncPreview(state.playhead,true);tick()}
  function stopPlayback(){state.playing=false;cancelAnimationFrame(state.playbackRaf);if(els.playBtn)els.playBtn.textContent='▶';for(const el of state.elementMap.values())try{el.pause?.()}catch{}}
  function tick(){if(!state.playing)return;const t=(performance.now()-state.playStartClock)/1000;if(t>=projectDuration()){seekTo(projectDuration());stopPlayback();return}state.playhead=t;syncPreview(t,true);updatePlayheadUI();state.playbackRaf=requestAnimationFrame(tick)}
  els.playBtn.onclick=()=>state.playing?stopPlayback():startPlayback();function stepFrame(d){stopPlayback();seekTo(state.playhead+d/Math.max(1,Number(els.fpsInput.value)||30))}els.prevFrameBtn.onclick=()=>stepFrame(-1);els.nextFrameBtn.onclick=()=>stepFrame(1);

  els.storyboardBtn.onclick=()=>els.storyboardDialog.showModal();els.generateStoryboardBtn.onclick=async()=>{const asset=assetById(state.mainVideoId);if(!asset)return;const interval=Math.max(.1,Number(els.storyInterval.value)||1),v=document.createElement('video');v.src=asset.url;v.muted=true;v.preload='auto';await new Promise(r=>{v.onloadedmetadata=r;v.onerror=r});const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.max(120,Math.round(320*(asset.height||9)/(asset.width||16)));const g=canvas.getContext('2d'),cards=[];els.storyboardGrid.textContent='生成中…';for(let t=0,n=0;t<asset.duration&&n<240;t+=interval,n++){await new Promise(r=>{v.onseeked=r;v.currentTime=Math.min(t,Math.max(0,asset.duration-.02))});g.drawImage(v,0,0,canvas.width,canvas.height);cards.push({t,url:canvas.toDataURL('image/jpeg',.72)})}els.storyboardGrid.innerHTML=cards.map(x=>`<div class="story-card" data-t="${x.t}"><img src="${x.url}"><div>${fmt(x.t)}</div></div>`).join('');els.storyboardGrid.querySelectorAll('.story-card').forEach(c=>c.onclick=()=>{seekTo(Number(c.dataset.t));els.storyboardDialog.close()})};

  els.addSubtitleBtn.onclick=()=>{snapshot();state.subtitles.push({start:state.playhead,end:Math.min(projectDuration(),state.playhead+2),text:'新字幕'});renderTimeline()};
  els.exportSrtBtn.onclick=()=>{const srt=state.subtitles.map((s,i)=>`${i+1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n');downloadBlob(new Blob([srt],{type:'text/plain;charset=utf-8'}),'webCut.srt')};

  els.asrBtn.onclick=()=>{let cfg={};try{cfg=JSON.parse(localStorage.getItem('webcut.asr')||'{}')}catch{}els.asrUrl.value=cfg.url||'';els.asrToken.value=cfg.token||'';els.asrField.value=cfg.field||'file';els.asrDialog.showModal()};
  els.saveAsrConfigBtn.onclick=()=>{localStorage.setItem('webcut.asr',JSON.stringify({url:els.asrUrl.value.trim(),token:els.asrToken.value.trim(),field:els.asrField.value.trim()||'file'}));els.asrStatus.textContent='配置已保存'};
  els.runAsrBtn.onclick=async()=>{const asset=assetById(state.mainVideoId);if(!asset)return;const url=els.asrUrl.value.trim();if(!url){els.asrStatus.textContent='请填写 API 地址';return}try{els.asrStatus.textContent='正在本地提取 WAV…';const wavBuf=await extractWavFromAsset(asset),wav=new Blob([wavBuf],{type:'audio/wav'}),fd=new FormData();fd.append(els.asrField.value.trim()||'file',wav,baseName(asset)+'.wav');const headers={};if(els.asrToken.value.trim())headers.Authorization=`Bearer ${els.asrToken.value.trim()}`;els.asrStatus.textContent='正在调用 Qwen ASR…';const res=await fetch(url,{method:'POST',headers,body:fd}),raw=await res.text();if(!res.ok)throw new Error(`${res.status} ${raw.slice(0,300)}`);let data;try{data=JSON.parse(raw)}catch{data={text:raw}}const root=data?.data??data?.result??data,text=root?.text??root?.transcript??data?.text??'';let seg=root?.segments??root?.chunks??root?.words??[];seg=(Array.isArray(seg)?seg:[]).map(x=>({start:Number(x.start??x.start_time??x.timestamp?.[0]??0),end:Number(x.end??x.end_time??x.timestamp?.[1]??0),text:String(x.text??x.word??'')})).filter(x=>x.text);snapshot();state.subtitles=seg.length?seg:[{start:0,end:asset.duration,text:String(text)}];renderTimeline();els.asrStatus.textContent=`识别完成：${text||''}`}catch(err){els.asrStatus.textContent='失败：'+String(err?.message||err)}};

  els.exportBtn.onclick=()=>{if(!state.mainVideoId){alert('请先打开视频');return}els.exportDialog.showModal()};els.runExportBtn.onclick=exportProject;
  async function exportProject(){
    try{
      const type=els.exportType.value;let fmt=els.exportFormat.value;if(fmt==='original')fmt=type==='video'?fileExt(assetById(state.mainVideoId)):'wav';const ff=await getFFmpeg(),usedIds=new Set();for(const t of state.tracks)for(const c of t.clips)usedIds.add(c.assetId);const used=[...usedIds].map(assetById).filter(Boolean),inputIndex=new Map(),args=[];
      for(let i=0;i<used.length;i++){const a=used[i],name=`asset_${i}.${fileExt(a.file)}`;await safeDelete(ff,name);await ff.writeFile(name,new Uint8Array(await a.file.arrayBuffer()));inputIndex.set(a.id,i);if(a.kind==='image')args.push('-loop','1');args.push('-i',name)}
      const D=projectDuration(),filters=[];let videoLabel='';
      if(type==='video'){
        const visualClips=state.tracks.filter(t=>t.type==='visual'&&t.visible).flatMap((t,ti)=>t.clips.map(c=>({clip:c,ti}))).sort((a,b)=>a.ti-b.ti),main=assetById(state.mainVideoId),W=main?.width||1280,H=main?.height||720;filters.push(`color=c=black:s=${W}x${H}:r=30:d=${D}[base0]`);let prev='base0',n=0;
        for(const item of visualClips){const c=item.clip,a=assetById(c.assetId),idx=inputIndex.get(a.id),label=`vx${n}`,next=`base${n+1}`;if(a.kind==='image')filters.push(`[${idx}:v]loop=loop=-1:size=1:start=0,trim=duration=${c.duration},setpts=PTS-STARTPTS+${c.start}/TB,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${c.opacity??1}[${label}]`);else filters.push(`[${idx}:v]trim=start=${c.in}:end=${c.out},setpts=PTS-STARTPTS+${c.start}/TB,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${c.opacity??1}[${label}]`);filters.push(`[${prev}][${label}]overlay=0:0:enable='between(t,${c.start},${c.start+c.duration})'[${next}]`);prev=next;n++}videoLabel=prev;
      }
      const audioClips=state.tracks.filter(t=>t.type==='audio'&&!t.muted).flatMap(t=>t.clips),aLabels=[];let ai=0;for(const c of audioClips){const a=assetById(c.assetId);if(!a||a.hasAudio===false)continue;const idx=inputIndex.get(a.id),lab=`ax${ai++}`,delay=Math.round(c.start*1000);filters.push(`[${idx}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`);aLabels.push(lab)}let audioLabel='';if(aLabels.length===1){filters.push(`[${aLabels[0]}]anull[aout]`);audioLabel='aout'}else if(aLabels.length>1){filters.push(`${aLabels.map(x=>`[${x}]`).join('')}amix=inputs=${aLabels.length}:normalize=0,atrim=duration=${D}[aout]`);audioLabel='aout'}
      const out=`output.${fmt}`;await safeDelete(ff,out);const cmd=[...args];if(filters.length)cmd.push('-filter_complex',filters.join(';'));if(type==='video'){cmd.push('-map',`[${videoLabel}]`);if(audioLabel)cmd.push('-map',`[${audioLabel}]`);if(fmt==='webm')cmd.push('-c:v','libvpx-vp9','-crf','32','-b:v','0',...(audioLabel?['-c:a','libopus']:[]));else cmd.push('-c:v','libx264','-preset','veryfast','-crf','20',...(audioLabel?['-c:a','aac','-b:a','192k']:[]))}else{if(!audioLabel)throw new Error('没有可导出的音频');cmd.push('-map',`[${audioLabel}]`,...audioCodecArgs(fmt))}cmd.push('-t',D.toFixed(3),out);els.exportStatus.textContent='正在本机合成 / 转码…';await ff.exec(cmd);const data=await ff.readFile(out);downloadBlob(new Blob([data.buffer]),`webCut_export.${fmt}`);els.exportStatus.textContent='导出完成';
    }catch(err){els.exportStatus.textContent='导出失败：'+String(err?.message||err)}
  }
  function audioCodecArgs(fmt){if(fmt==='wav')return['-c:a','pcm_s16le'];if(fmt==='mp3')return['-c:a','libmp3lame','-q:a','2'];if(fmt==='flac')return['-c:a','flac'];return['-c:a','aac','-b:a','192k']}

  async function getFFmpeg(){
    if(state.ffmpeg)return state.ffmpeg;if(state.ffmpegPromise)return state.ffmpegPromise;
    state.ffmpegPromise=(async()=>{const m=await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15'),u=await import('https://esm.sh/@ffmpeg/util@0.12.2'),ff=new m.FFmpeg();ff.on('progress',({progress})=>{if(els.exportDialog.open)els.exportStatus.textContent=`处理中 ${(Math.max(0,progress)*100).toFixed(1)}%`});const bootstrap='import "https://esm.sh/@ffmpeg/ffmpeg@0.12.15/es2022/worker.js";',worker=URL.createObjectURL(new Blob([bootstrap],{type:'text/javascript'})),base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';try{await ff.load({classWorkerURL:worker,coreURL:await u.toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),wasmURL:await u.toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')})}finally{setTimeout(()=>URL.revokeObjectURL(worker),1000)}state.ffmpeg=ff;return ff})();
    try{return await state.ffmpegPromise}finally{state.ffmpegPromise=null}
  }
  async function safeDelete(ff,name){try{await ff.deleteFile(name)}catch{}}
  function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}

  function renderAll(){renderTimeline();renderInspector();syncPreview(state.playhead,false)}
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.code==='Space'){e.preventDefault();state.playing?stopPlayback():startPlayback()}else if(e.key==='ArrowLeft')stepFrame(-1);else if(e.key==='ArrowRight')stepFrame(1);else if(e.key.toLowerCase()==='s')splitSelected();else if(e.key==='Delete')deleteSelected()});
  window.addEventListener('beforeunload',()=>state.assets.forEach(a=>{try{URL.revokeObjectURL(a.url)}catch{}}));

  createTrack('visual','视频/图像 1');createTrack('audio','音频 1');state.selectedTrackId=state.tracks[0].id;els.zoomRange.value=state.zoom;els.zoomLabel.textContent=`${state.zoom}px/s`;renderAll();
})();