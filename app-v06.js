(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const els = {};
  [
    'openVideoBtn','addVideoBtn','addImageBtn','addAudioBtn','mainVideoInput','extraVideoInput','imageInput','audioInput',
    'stage','previewVideo','overlayLayer','emptyPreview','playBtn','prevFrameBtn','nextFrameBtn','timeText','fpsInput','mediaInfo','storyboardBtn',
    'inspectorEmpty','inspectorContent','fileName','clipTrack','clipStart','clipIn','clipOut','clipDuration','clipVolume','clipOpacity',
    'imageFields','imageX','imageY','imageScale',
    'splitBtn','deleteClipBtn','undoBtn','zoomOutBtn','zoomInBtn','zoomRange','zoomLabel','fitTimelineBtn',
    'timeline','timelineInner','ruler','videoLane','videoAudioLane','imageLane','audioLane','subtitleLane','playhead',
    'addSubtitleBtn','exportSrtBtn','storyboardDialog','storyInterval','generateStoryboardBtn','storyboardGrid',
    'asrBtn','asrDialog','asrUrl','asrToken','asrField','saveAsrConfigBtn','runAsrBtn','asrStatus',
    'exportBtn','exportDialog','exportType','exportFormat','canvasPreset','canvasWidth','canvasHeight','fitMode','runExportBtn','exportStatus'
  ].forEach(id => els[id] = $(id));

  const HEADER_W = 116;
  const MIN_ZOOM = 20;
  const MAX_ZOOM = 240;
  const IMAGE_DEFAULT_DURATION = 3;

  const state = {
    assets: [],
    videos: [],
    images: [],
    audios: [],
    subtitles: [],
    selected: null,
    playhead: 0,
    zoom: 90,
    playing: false,
    playStartClock: 0,
    playbackRaf: 0,
    undo: [],
    externalAudioEls: new Map(),
    overlayEls: new Map(),
    activeVideoAssetId: null,
    ffmpeg: null,
    ffmpegPromise: null,
    waveformQueue: Promise.resolve(),
  };

  const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ext = file => (file.name.split('.').pop()||'bin').toLowerCase();
  const fmt = (t=0) => { t=Math.max(0,Number(t)||0); const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`; };
  const srtTime = t => { const h=Math.floor(t/3600);t%=3600;const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`; };

  function assetById(id){return state.assets.find(a=>a.id===id)||null;}
  function baseName(asset){return (asset?.file?.name||'webCut').replace(/\.[^.]+$/,'');}
  function videoDuration(){return state.videos.reduce((m,c)=>Math.max(m,c.start+c.duration),0);}
  function projectDuration(){let d=videoDuration();for(const c of state.images)d=Math.max(d,c.start+c.duration);for(const c of state.audios)d=Math.max(d,c.start+c.duration);for(const s of state.subtitles)d=Math.max(d,s.end);return Math.max(.1,d);}
  function findClip(id){for(const kind of ['videos','images','audios']){const clip=state[kind].find(c=>c.id===id);if(clip)return {kind,clip};}return null;}
  function selectedClip(){return state.selected?findClip(state.selected.id):null;}

  function snapshot(){state.undo.push(JSON.stringify({videos:state.videos,images:state.images,audios:state.audios,subtitles:state.subtitles,selected:state.selected,playhead:state.playhead}));if(state.undo.length>40)state.undo.shift();}
  function undo(){const raw=state.undo.pop();if(!raw)return;const s=JSON.parse(raw);state.videos=s.videos;state.images=s.images;state.audios=s.audios;state.subtitles=s.subtitles;state.selected=s.selected;state.playhead=s.playhead;stopPlayback();reflowVideos(false);renderAll();}

  async function metadata(file,kind,url){
    if(kind==='image')return await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:img.naturalWidth||0,height:img.naturalHeight||0});img.onerror=()=>resolve({duration:IMAGE_DEFAULT_DURATION,width:0,height:0});img.src=url;});
    const tag=document.createElement(kind==='audio'?'audio':'video');tag.preload='metadata';tag.src=url;
    return await new Promise(resolve=>{const done=()=>{cleanup();resolve({duration:Number.isFinite(tag.duration)?tag.duration:0,width:tag.videoWidth||0,height:tag.videoHeight||0});};const cleanup=()=>{tag.removeEventListener('loadedmetadata',done);tag.removeEventListener('error',done)};tag.addEventListener('loadedmetadata',done);tag.addEventListener('error',done);tag.load();});
  }
  async function makeAsset(file,kind){const url=URL.createObjectURL(file),m=await metadata(file,kind,url),asset={id:uid('asset'),file,kind,url,duration:m.duration||0,width:m.width||0,height:m.height||0,peaks:null,hasAudio:kind==='audio'?true:null,wavePending:false};state.assets.push(asset);return asset;}

  function clearProject(){stopPlayback();for(const a of state.assets)try{URL.revokeObjectURL(a.url)}catch{};state.assets=[];state.videos=[];state.images=[];state.audios=[];state.subtitles=[];state.selected=null;state.playhead=0;state.activeVideoAssetId=null;els.previewVideo.removeAttribute('src');els.previewVideo.load();for(const el of state.externalAudioEls.values())el.remove();state.externalAudioEls.clear();for(const el of state.overlayEls.values())el.remove();state.overlayEls.clear();}

  els.openVideoBtn.onclick=()=>{els.mainVideoInput.value='';els.mainVideoInput.click();};
  els.mainVideoInput.onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(state.videos.length&& !confirm('打开新工程会清空当前时间轴，继续吗？'))return;clearProject();const asset=await makeAsset(file,'video');state.videos.push({id:uid('clip'),assetId:asset.id,start:0,in:0,out:asset.duration,duration:asset.duration,volume:1});state.selected={kind:'videos',id:state.videos[0].id};queueWaveform(asset);renderAll();};

  els.addVideoBtn.onclick=()=>{if(!state.videos.length){els.openVideoBtn.click();return;}els.extraVideoInput.value='';els.extraVideoInput.click();};
  els.extraVideoInput.onchange=async e=>{const files=[...(e.target.files||[])];if(!files.length)return;snapshot();for(const file of files){const asset=await makeAsset(file,'video');state.videos.push({id:uid('clip'),assetId:asset.id,start:0,in:0,out:asset.duration,duration:asset.duration,volume:1});queueWaveform(asset);}reflowVideos(false);state.selected={kind:'videos',id:state.videos.at(-1).id};renderAll();};

  els.addImageBtn.onclick=()=>{if(!state.videos.length){alert('请先打开视频');return;}els.imageInput.value='';els.imageInput.click();};
  els.imageInput.onchange=async e=>{const files=[...(e.target.files||[])];if(!files.length)return;snapshot();for(const file of files){const asset=await makeAsset(file,'image');const clip={id:uid('clip'),assetId:asset.id,start:state.playhead,in:0,out:IMAGE_DEFAULT_DURATION,duration:IMAGE_DEFAULT_DURATION,opacity:1,x:50,y:50,scale:35};state.images.push(clip);state.selected={kind:'images',id:clip.id};}renderAll();};

  els.addAudioBtn.onclick=()=>{if(!state.videos.length){alert('请先打开视频');return;}els.audioInput.value='';els.audioInput.click();};
  els.audioInput.onchange=async e=>{const files=[...(e.target.files||[])];if(!files.length)return;snapshot();for(const file of files){const asset=await makeAsset(file,'audio');const clip={id:uid('clip'),assetId:asset.id,start:state.playhead,in:0,out:asset.duration,duration:asset.duration,volume:1};state.audios.push(clip);state.selected={kind:'audios',id:clip.id};queueWaveform(asset);}renderAll();};

  function reflowVideos(ripple=true){let t=0;for(const c of state.videos){if(ripple)c.start=t;else c.start=t;t+=c.duration;}}

  function queueWaveform(asset){
    if(!asset||asset.wavePending||asset.peaks||asset.kind==='image')return;
    asset.wavePending=true;
    state.waveformQueue=state.waveformQueue.then(async()=>{try{await ensurePeaks(asset);}finally{asset.wavePending=false;renderTimeline();}}).catch(err=>{asset.wavePending=false;console.warn('[webCut] waveform queue:',err);});
  }

  async function ensurePeaks(asset){
    if(asset.peaks)return asset.peaks;
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;let ctx=new C();
    try{
      const arr=await asset.file.arrayBuffer();let decoded;
      try{decoded=await ctx.decodeAudioData(arr.slice(0));}
      catch{try{await ctx.close();}catch{};const wav=await extractWav(asset);ctx=new C();decoded=await ctx.decodeAudioData(wav.slice(0));}
      const data=decoded.getChannelData(0),bins=1600,step=Math.max(1,Math.floor(data.length/bins)),peaks=[];
      for(let i=0;i<bins;i++){let mn=1,mx=-1;const st=i*step,en=Math.min(data.length,st+step);for(let j=st;j<en;j++){const v=data[j];if(v<mn)mn=v;if(v>mx)mx=v;}peaks.push([mn===1?0:mn,mx===-1?0:mx]);}
      asset.peaks=peaks;asset.hasAudio=true;return peaks;
    }catch(err){asset.hasAudio=false;console.warn('[webCut] no waveform:',asset.file.name,err);return null;}
    finally{try{await ctx.close();}catch{}}
  }

  async function extractWav(asset){const ff=await getFFmpeg(),input=`wave_${asset.id}.${ext(asset.file)}`,out=`wave_${asset.id}.wav`;await safeDelete(ff,input);await safeDelete(ff,out);await ff.writeFile(input,new Uint8Array(await asset.file.arrayBuffer()));const code=await ff.exec(['-hide_banner','-loglevel','error','-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);if(code!==0)throw new Error('没有可解码音频');const d=await ff.readFile(out);return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength);}

  function renderInspector(){
    const f=selectedClip();if(!f){els.inspectorEmpty.classList.remove('hidden');els.inspectorContent.classList.add('hidden');return;}
    const c=f.clip,a=assetById(c.assetId);els.inspectorEmpty.classList.add('hidden');els.inspectorContent.classList.remove('hidden');els.fileName.textContent=a?.file?.name||'-';els.clipTrack.textContent=f.kind==='videos'?'视频':f.kind==='images'?'图像覆盖':'外部音频';els.clipStart.value=c.start.toFixed(3);els.clipDuration.value=c.duration.toFixed(3);els.clipIn.value=c.in.toFixed(3);els.clipOut.value=c.out.toFixed(3);els.clipVolume.value=Math.round((c.volume??1)*100);els.clipOpacity.value=Math.round((c.opacity??1)*100);els.imageFields.classList.toggle('hidden',f.kind!=='images');document.querySelector('.audio-only-field')?.classList.toggle('hidden',f.kind==='images');document.querySelector('.visual-only')?.classList.toggle('hidden',f.kind!=='images');if(f.kind==='images'){els.imageX.value=c.x;els.imageY.value=c.y;els.imageScale.value=c.scale;}
    els.clipStart.disabled=f.kind==='videos';
  }

  function applyField(field){
    const f=selectedClip();if(!f)return;snapshot();const c=f.clip,a=assetById(c.assetId);
    if(field==='start'&&f.kind!=='videos')c.start=Math.max(0,Number(els.clipStart.value)||0);
    if(field==='in')c.in=clamp(Number(els.clipIn.value)||0,0,Math.max(0,c.out-.02));
    if(field==='out')c.out=a.kind==='image'?Math.max(c.in+.02,Number(els.clipOut.value)||c.out):clamp(Number(els.clipOut.value)||c.out,c.in+.02,a.duration||c.out);
    if(field==='duration'){const d=Math.max(.05,Number(els.clipDuration.value)||c.duration);c.duration=a.kind==='image'?d:Math.min(d,Math.max(.05,(a.duration||c.out)-c.in));c.out=c.in+c.duration;}else if(['in','out'].includes(field))c.duration=Math.max(.05,c.out-c.in);
    if(field==='volume')c.volume=clamp((Number(els.clipVolume.value)||0)/100,0,2);
    if(field==='opacity')c.opacity=clamp((Number(els.clipOpacity.value)||0)/100,0,1);
    if(field==='x')c.x=clamp(Number(els.imageX.value)||50,0,100);
    if(field==='y')c.y=clamp(Number(els.imageY.value)||50,0,100);
    if(field==='scale')c.scale=clamp(Number(els.imageScale.value)||35,1,200);
    if(f.kind==='videos')reflowVideos(true);renderAll();
  }
  els.clipStart.onchange=()=>applyField('start');els.clipIn.onchange=()=>applyField('in');els.clipOut.onchange=()=>applyField('out');els.clipDuration.onchange=()=>applyField('duration');els.clipVolume.onchange=()=>applyField('volume');els.clipOpacity.onchange=()=>applyField('opacity');els.imageX.onchange=()=>applyField('x');els.imageY.onchange=()=>applyField('y');els.imageScale.onchange=()=>applyField('scale');

  function laneWidth(){return Math.max(900,Math.ceil(projectDuration()*state.zoom)+80)}
  function renderRuler(){const w=laneWidth(),d=projectDuration();els.ruler.style.width=`${HEADER_W+w}px`;let tick=1;if(state.zoom<40)tick=5;else if(state.zoom<70)tick=2;else if(state.zoom>160)tick=.5;let html=`<div class="ruler-head" style="width:${HEADER_W}px"></div><div class="ruler-lane" style="width:${w}px">`;for(let t=0;t<=d+tick;t+=tick)html+=`<span class="tick" style="left:${t*state.zoom}px"><i></i><b>${fmt(t).replace('.000','')}</b></span>`;els.ruler.innerHTML=html+'</div>';}

  function clipHtml(c,kind,label){const a=assetById(c.assetId),left=c.start*state.zoom,width=Math.max(6,c.duration*state.zoom),selected=state.selected?.id===c.id?'selected':'';return `<div class="tl-clip ${kind} ${selected}" data-kind="${kind}" data-id="${c.id}" style="left:${left}px;width:${width}px"><div class="trim-handle left" data-handle="left"></div><span>${label} ${esc(a?.file?.name||'')}</span>${kind==='audio'?'<canvas class="clip-wave"></canvas>':''}<div class="trim-handle right" data-handle="right"></div></div>`;}

  function renderTimeline(){
    const w=laneWidth();renderRuler();for(const lane of [els.videoLane,els.videoAudioLane,els.imageLane,els.audioLane,els.subtitleLane])lane.style.width=`${w}px`;
    els.videoLane.innerHTML=state.videos.map(c=>clipHtml(c,'video','🎬')).join('');
    els.videoAudioLane.innerHTML=state.videos.map(c=>`<div class="tl-clip audio derived" data-derived="${c.id}" style="left:${c.start*state.zoom}px;width:${Math.max(6,c.duration*state.zoom)}px"><span>🎵 原声</span><canvas class="clip-wave"></canvas></div>`).join('');
    els.imageLane.innerHTML=state.images.map(c=>clipHtml(c,'image','🖼️')).join('');
    els.audioLane.innerHTML=state.audios.map(c=>clipHtml(c,'audio','🎵')).join('');
    els.subtitleLane.innerHTML=state.subtitles.map((s,i)=>`<div class="subtitle-block" data-sub="${i}" style="left:${s.start*state.zoom}px;width:${Math.max(6,(s.end-s.start)*state.zoom)}px">${esc(s.text)}</div>`).join('');
    bindTimeline();drawWaveforms();updatePlayheadUI();els.timelineInner.style.width=`${HEADER_W+w}px`;
  }

  function bindTimeline(){
    document.querySelectorAll('.tl-clip[data-id]').forEach(node=>{node.onclick=e=>{e.stopPropagation();state.selected={kind:node.dataset.kind==='video'?'videos':node.dataset.kind==='image'?'images':'audios',id:node.dataset.id};renderTimeline();renderInspector();syncPreview(state.playhead,false);};node.onpointerdown=e=>startDrag(e,node);});
    document.querySelectorAll('.tl-clip[data-derived]').forEach(node=>{node.onclick=e=>{e.stopPropagation();state.selected={kind:'videos',id:node.dataset.derived};renderTimeline();renderInspector();};});
  }

  function startDrag(e,node){
    e.preventDefault();e.stopPropagation();const kind=node.dataset.kind==='video'?'videos':node.dataset.kind==='image'?'images':'audios',c=state[kind].find(x=>x.id===node.dataset.id);if(!c)return;state.selected={kind,id:c.id};snapshot();const x0=e.clientX,orig={start:c.start,in:c.in,out:c.out,duration:c.duration},a=assetById(c.assetId),mode=e.target.dataset.handle||'move';
    const move=ev=>{const dt=(ev.clientX-x0)/state.zoom;if(mode==='move'){if(kind!=='videos')c.start=Math.max(0,orig.start+dt);}else if(mode==='left'){let d=Math.max(dt,-orig.in);d=Math.min(d,orig.duration-.05);if(kind!=='videos')c.start=Math.max(0,orig.start+d);c.in=orig.in+d;c.duration=orig.duration-d;c.out=c.in+c.duration;}else{let dur=Math.max(.05,orig.duration+dt);if(a.kind!=='image')dur=Math.min(dur,Math.max(.05,(a.duration||orig.out)-orig.in));c.duration=dur;c.out=c.in+dur;}if(kind==='videos')reflowVideos(true);renderTimeline();renderInspector();syncPreview(state.playhead,false);};
    const up=()=>window.removeEventListener('pointermove',move);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
  }

  function drawWaveforms(){
    document.querySelectorAll('[data-derived] .clip-wave').forEach(canvas=>{const c=state.videos.find(x=>x.id===canvas.closest('[data-derived]').dataset.derived),a=assetById(c?.assetId);if(a){queueWaveform(a);if(a.peaks)drawCanvas(canvas,a,c);}});
    els.audioLane.querySelectorAll('.clip-wave').forEach(canvas=>{const node=canvas.closest('[data-id]'),c=state.audios.find(x=>x.id===node.dataset.id),a=assetById(c?.assetId);if(a){queueWaveform(a);if(a.peaks)drawCanvas(canvas,a,c);}});
  }
  function drawCanvas(canvas,a,c){if(!a.peaks||!canvas.isConnected)return;const r=canvas.getBoundingClientRect();if(r.width<2)return;const dpr=devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,r.width,r.height);g.strokeStyle='#7158d3';g.lineWidth=1;g.beginPath();const p0=Math.floor((a.duration?c.in/a.duration:0)*a.peaks.length),p1=Math.max(p0+1,Math.ceil((a.duration?c.out/a.duration:1)*a.peaks.length));for(let x=0;x<r.width;x++){const pi=Math.min(p1-1,p0+Math.floor(x/Math.max(1,r.width)*(p1-p0))),p=a.peaks[pi]||[0,0],mid=r.height/2;g.moveTo(x,mid+p[0]*mid*.86);g.lineTo(x,mid+p[1]*mid*.86);}g.stroke();}

  function updatePlayheadUI(){els.playhead.style.left=`${HEADER_W+state.playhead*state.zoom}px`;els.timeText.textContent=`${fmt(state.playhead)} / ${fmt(videoDuration())}`;}
  els.timeline.onclick=e=>{if(e.target.closest('.tl-clip,.track-header,.subtitle-block,button,input'))return;const r=els.timelineInner.getBoundingClientRect(),t=(e.clientX-r.left-HEADER_W+els.timeline.scrollLeft)/state.zoom;seekTo(clamp(t,0,videoDuration()));};
  function setZoom(v,anchor=state.playhead){state.zoom=clamp(Number(v)||90,MIN_ZOOM,MAX_ZOOM);els.zoomRange.value=state.zoom;els.zoomLabel.textContent=`${state.zoom}px/s`;renderTimeline();els.timeline.scrollLeft=Math.max(0,HEADER_W+anchor*state.zoom-els.timeline.clientWidth/2);}
  els.zoomRange.oninput=()=>setZoom(els.zoomRange.value);els.zoomInBtn.onclick=()=>setZoom(state.zoom+15);els.zoomOutBtn.onclick=()=>setZoom(state.zoom-15);els.fitTimelineBtn.onclick=()=>{setZoom(clamp(Math.max(300,els.timeline.clientWidth-HEADER_W-30)/videoDuration(),MIN_ZOOM,MAX_ZOOM),0);els.timeline.scrollLeft=0;};els.timeline.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(state.zoom+(e.deltaY<0?12:-12));},{passive:false});

  function splitSelected(){const f=selectedClip();if(!f)return;const c=f.clip,t=state.playhead;if(t<=c.start+.02||t>=c.start+c.duration-.02)return;snapshot();const offset=t-c.start,right={...c,id:uid('clip'),start:t,in:c.in+offset,duration:c.duration-offset,out:c.out};c.duration=offset;c.out=c.in+offset;state[f.kind].splice(state[f.kind].indexOf(c)+1,0,right);if(f.kind==='videos')reflowVideos(true);state.selected={kind:f.kind,id:right.id};renderAll();}
  function deleteSelected(){const f=selectedClip();if(!f)return;snapshot();state[f.kind]=state[f.kind].filter(c=>c.id!==f.clip.id);if(f.kind==='videos')reflowVideos(true);state.selected=null;seekTo(Math.min(state.playhead,videoDuration()));renderAll();}
  els.splitBtn.onclick=splitSelected;els.deleteClipBtn.onclick=deleteSelected;els.undoBtn.onclick=undo;

  function activeVideo(t){return state.videos.find(c=>t>=c.start&&t<c.start+c.duration)||state.videos.at(-1)||null;}
  function updateOrientation(clip){const a=clip?assetById(clip.assetId):null;document.body.classList.remove('media-portrait','media-landscape','media-square');if(!a)return;const r=(a.width||16)/(a.height||9),mode=r<.86?'media-portrait':r>1.16?'media-landscape':'media-square';document.body.classList.add(mode);els.mediaInfo.textContent=`${mode==='media-portrait'?'竖屏':mode==='media-landscape'?'横屏':'方屏'} ${a.width}×${a.height}`;}

  function syncPreview(t,play){
    const c=activeVideo(t);updateOrientation(c);if(!c){els.emptyPreview.classList.remove('hidden');return;}const a=assetById(c.assetId);els.emptyPreview.classList.add('hidden');if(state.activeVideoAssetId!==a.id){els.previewVideo.src=a.url;state.activeVideoAssetId=a.id;}const local=clamp(c.in+(t-c.start),c.in,Math.max(c.in,c.out-.01));if(Math.abs((els.previewVideo.currentTime||0)-local)>.12)try{els.previewVideo.currentTime=local}catch{};els.previewVideo.volume=clamp(c.volume??1,0,1);els.previewVideo.muted=false;if(play)els.previewVideo.play().catch(()=>{});else els.previewVideo.pause();
    const activeImages=new Set();for(const ic of state.images){let el=state.overlayEls.get(ic.id);if(t>=ic.start&&t<ic.start+ic.duration){const ia=assetById(ic.assetId);if(!el){el=new Image();el.src=ia.url;el.className='overlay-image';els.overlayLayer.appendChild(el);state.overlayEls.set(ic.id,el);}activeImages.add(ic.id);el.style.display='block';el.style.left=`${ic.x}%`;el.style.top=`${ic.y}%`;el.style.width=`${ic.scale}%`;el.style.opacity=String(ic.opacity??1);} }for(const[id,el]of state.overlayEls)if(!activeImages.has(id))el.style.display='none';
    const activeAudio=new Set();for(const ac of state.audios){if(t>=ac.start&&t<ac.start+ac.duration){const aa=assetById(ac.assetId);let el=state.externalAudioEls.get(ac.id);if(!el){el=document.createElement('audio');el.src=aa.url;el.preload='auto';document.body.appendChild(el);state.externalAudioEls.set(ac.id,el);}activeAudio.add(ac.id);const localA=ac.in+(t-ac.start);if(Math.abs((el.currentTime||0)-localA)>.12)try{el.currentTime=localA}catch{};el.volume=clamp(ac.volume??1,0,1);if(play)el.play().catch(()=>{});else el.pause();}}for(const[id,el]of state.externalAudioEls)if(!activeAudio.has(id))el.pause();
  }

  function seekTo(t){state.playhead=clamp(t,0,videoDuration());if(state.playing)state.playStartClock=performance.now()-state.playhead*1000;syncPreview(state.playhead,state.playing);updatePlayheadUI();}
  function startPlayback(){if(state.playing||!state.videos.length)return;state.playing=true;state.playStartClock=performance.now()-state.playhead*1000;els.playBtn.textContent='❚❚';syncPreview(state.playhead,true);tick();}
  function stopPlayback(){state.playing=false;cancelAnimationFrame(state.playbackRaf);els.playBtn.textContent='▶';els.previewVideo.pause();for(const el of state.externalAudioEls.values())el.pause();}
  function tick(){if(!state.playing)return;const t=(performance.now()-state.playStartClock)/1000;if(t>=videoDuration()){seekTo(videoDuration());stopPlayback();return;}state.playhead=t;syncPreview(t,true);updatePlayheadUI();state.playbackRaf=requestAnimationFrame(tick);}
  els.playBtn.onclick=()=>state.playing?stopPlayback():startPlayback();function stepFrame(d){stopPlayback();seekTo(state.playhead+d/Math.max(1,Number(els.fpsInput.value)||30));}els.prevFrameBtn.onclick=()=>stepFrame(-1);els.nextFrameBtn.onclick=()=>stepFrame(1);

  els.storyboardBtn.onclick=()=>els.storyboardDialog.showModal();els.generateStoryboardBtn.onclick=async()=>{const c=selectedClip()?.kind==='videos'?selectedClip().clip:activeVideo(state.playhead);if(!c)return;const a=assetById(c.assetId),interval=Math.max(.1,Number(els.storyInterval.value)||1),v=document.createElement('video');v.src=a.url;v.muted=true;v.preload='auto';await new Promise(r=>{v.onloadedmetadata=r;v.onerror=r});const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.max(120,Math.round(320*(a.height||9)/(a.width||16)));const g=canvas.getContext('2d'),cards=[];els.storyboardGrid.textContent='生成中…';for(let t=c.in,n=0;t<c.out&&n<200;t+=interval,n++){await new Promise(r=>{v.onseeked=r;v.currentTime=Math.min(t,Math.max(0,a.duration-.02))});g.drawImage(v,0,0,canvas.width,canvas.height);cards.push({t,url:canvas.toDataURL('image/jpeg',.72)})}els.storyboardGrid.innerHTML=cards.map(x=>`<div class="story-card" data-t="${x.t}"><img src="${x.url}"><div>${fmt(x.t)}</div></div>`).join('');els.storyboardGrid.querySelectorAll('.story-card').forEach(card=>card.onclick=()=>{seekTo(c.start+(Number(card.dataset.t)-c.in));els.storyboardDialog.close();});};

  els.addSubtitleBtn.onclick=()=>{snapshot();state.subtitles.push({start:state.playhead,end:Math.min(videoDuration(),state.playhead+2),text:'新字幕'});renderTimeline();};els.exportSrtBtn.onclick=()=>{const srt=state.subtitles.map((s,i)=>`${i+1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n');downloadBlob(new Blob([srt],{type:'text/plain;charset=utf-8'}),'webCut.srt');};

  els.asrBtn.onclick=()=>{let cfg={};try{cfg=JSON.parse(localStorage.getItem('webcut.asr')||'{}')}catch{}els.asrUrl.value=cfg.url||'';els.asrToken.value=cfg.token||'';els.asrField.value=cfg.field||'file';els.asrDialog.showModal();};els.saveAsrConfigBtn.onclick=()=>{localStorage.setItem('webcut.asr',JSON.stringify({url:els.asrUrl.value.trim(),token:els.asrToken.value.trim(),field:els.asrField.value.trim()||'file'}));els.asrStatus.textContent='配置已保存';};els.runAsrBtn.onclick=async()=>{if(!state.videos.length)return;const url=els.asrUrl.value.trim();if(!url){els.asrStatus.textContent='请填写 API 地址';return;}try{els.asrStatus.textContent='正在按时间轴合并音频…';const wav=await renderTimelineAudioWav(),fd=new FormData();fd.append(els.asrField.value.trim()||'file',wav,'webcut_timeline.wav');const headers={};if(els.asrToken.value.trim())headers.Authorization=`Bearer ${els.asrToken.value.trim()}`;const res=await fetch(url,{method:'POST',headers,body:fd}),raw=await res.text();if(!res.ok)throw new Error(`${res.status} ${raw.slice(0,300)}`);let data;try{data=JSON.parse(raw)}catch{data={text:raw}}const root=data?.data??data?.result??data,text=root?.text??root?.transcript??data?.text??'';let seg=root?.segments??root?.chunks??root?.words??[];seg=(Array.isArray(seg)?seg:[]).map(x=>({start:Number(x.start??x.start_time??x.timestamp?.[0]??0),end:Number(x.end??x.end_time??x.timestamp?.[1]??0),text:String(x.text??x.word??'')})).filter(x=>x.text);snapshot();state.subtitles=seg.length?seg:[{start:0,end:videoDuration(),text:String(text)}];renderTimeline();els.asrStatus.textContent=`识别完成：${text||''}`;}catch(err){els.asrStatus.textContent='失败：'+String(err?.message||err);}};

  els.exportBtn.onclick=()=>{if(!state.videos.length){alert('请先打开视频');return;}const first=assetById(state.videos[0].assetId);els.canvasWidth.value=first?.width||1920;els.canvasHeight.value=first?.height||1080;els.exportDialog.showModal();};els.canvasPreset.onchange=()=>{const v=els.canvasPreset.value;if(v==='source'){const a=assetById(state.videos[0]?.assetId);if(a){els.canvasWidth.value=a.width;els.canvasHeight.value=a.height;}}else if(v==='1080p'){els.canvasWidth.value=1920;els.canvasHeight.value=1080;}else if(v==='portrait'){els.canvasWidth.value=1080;els.canvasHeight.value=1920;}};els.runExportBtn.onclick=exportProject;

  async function renderTimelineAudioWav(){const ff=await getFFmpeg();const used=[...new Set([...state.videos.map(c=>c.assetId),...state.audios.map(c=>c.assetId)])].map(assetById),index=new Map(),args=[];for(let i=0;i<used.length;i++){const a=used[i],name=`asr_${i}.${ext(a.file)}`;await safeDelete(ff,name);await ff.writeFile(name,new Uint8Array(await a.file.arrayBuffer()));index.set(a.id,i);args.push('-i',name);}const filters=[],labs=[];let n=0;for(const c of state.videos){const a=assetById(c.assetId);if(a.hasAudio===false)continue;const lab=`a${n++}`,delay=Math.round(c.start*1000);filters.push(`[${index.get(a.id)}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`);labs.push(lab);}for(const c of state.audios){const a=assetById(c.assetId),lab=`a${n++}`,delay=Math.round(c.start*1000);filters.push(`[${index.get(a.id)}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`);labs.push(lab);}if(!labs.length)throw new Error('时间轴没有音频');const out='timeline_asr.wav';await safeDelete(ff,out);filters.push(labs.length===1?`[${labs[0]}]anull[aout]`:`${labs.map(x=>`[${x}]`).join('')}amix=inputs=${labs.length}:normalize=0,atrim=duration=${videoDuration()}[aout]`);await ff.exec([...args,'-filter_complex',filters.join(';'),'-map','[aout]','-ac','1','-ar','16000','-c:a','pcm_s16le',out]);const d=await ff.readFile(out);return new Blob([d.buffer],{type:'audio/wav'});}

  async function exportProject(){
    try{
      const type=els.exportType.value;let format=els.exportFormat.value;if(format==='original')format=type==='video'?'mp4':'wav';const W=Math.max(16,Number(els.canvasWidth.value)||1920),H=Math.max(16,Number(els.canvasHeight.value)||1080),fit=els.fitMode.value;
      if(type==='video'&&state.videos.length===1&&!state.images.length&&!state.audios.length&&els.exportFormat.value==='original'&&fit==='contain'){const c=state.videos[0],a=assetById(c.assetId);if(c.in<=.001&&Math.abs(c.out-a.duration)<.02&&W===a.width&&H===a.height){downloadBlob(a.file,`${baseName(a)}_cut.${ext(a.file)}`);els.exportStatus.textContent='导出完成（原始文件）';return;}}
      els.exportStatus.textContent='正在加载 FFmpeg…';const ff=await getFFmpeg(),used=[...new Set([...state.videos.map(c=>c.assetId),...state.images.map(c=>c.assetId),...state.audios.map(c=>c.assetId)])].map(assetById),index=new Map(),args=[];
      for(let i=0;i<used.length;i++){const a=used[i],name=`in_${i}.${ext(a.file)}`;await safeDelete(ff,name);await ff.writeFile(name,new Uint8Array(await a.file.arrayBuffer()));index.set(a.id,i);if(a.kind==='image')args.push('-loop','1');args.push('-i',name);}
      const filters=[],vLabs=[];for(let i=0;i<state.videos.length;i++){const c=state.videos[i],a=assetById(c.assetId),idx=index.get(a.id),lab=`v${i}`,scale=fit==='cover'?`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`:`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`;filters.push(`[${idx}:v]trim=start=${c.in}:end=${c.out},setpts=PTS-STARTPTS,${scale},setsar=1,fps=30[${lab}]`);vLabs.push(lab);}filters.push(`${vLabs.map(x=>`[${x}]`).join('')}concat=n=${vLabs.length}:v=1:a=0[vbase]`);let prev='vbase';for(let i=0;i<state.images.length;i++){const c=state.images[i],a=assetById(c.assetId),idx=index.get(a.id),img=`img${i}`,next=`vo${i}`,w=Math.max(2,Math.round(W*c.scale/100)),x=`${W}*${c.x/100}-overlay_w/2`,y=`${H}*${c.y/100}-overlay_h/2`;filters.push(`[${idx}:v]scale=${w}:-1,format=rgba,colorchannelmixer=aa=${c.opacity??1}[${img}]`);filters.push(`[${prev}][${img}]overlay=x='${x}':y='${y}':enable='between(t,${c.start},${c.start+c.duration})'[${next}]`);prev=next;}
      const aLabs=[];let n=0;for(const c of state.videos){const a=assetById(c.assetId);if(a.hasAudio===false)continue;const lab=`ax${n++}`,delay=Math.round(c.start*1000);filters.push(`[${index.get(a.id)}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`);aLabs.push(lab);}for(const c of state.audios){const a=assetById(c.assetId),lab=`ax${n++}`,delay=Math.round(c.start*1000);filters.push(`[${index.get(a.id)}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${c.volume??1}[${lab}]`);aLabs.push(lab);}let audioLabel='';if(aLabs.length){audioLabel='aout';filters.push(aLabs.length===1?`[${aLabs[0]}]anull[aout]`:`${aLabs.map(x=>`[${x}]`).join('')}amix=inputs=${aLabs.length}:normalize=0,atrim=duration=${videoDuration()}[aout]`);}
      const out=`output.${format}`;await safeDelete(ff,out);const cmd=[...args,'-filter_complex',filters.join(';')];if(type==='video'){cmd.push('-map',`[${prev}]`);if(audioLabel)cmd.push('-map','[aout]');if(format==='webm')cmd.push('-c:v','libvpx-vp9','-crf','32','-b:v','0',...(audioLabel?['-c:a','libopus','-b:a','160k']:[]));else cmd.push('-c:v','libx264','-preset','veryfast','-crf','20',...(audioLabel?['-c:a','aac','-b:a','192k']:[]));}else{if(!audioLabel)throw new Error('没有可导出的音频');cmd.push('-map','[aout]',...audioCodecArgs(format));}cmd.push('-t',videoDuration().toFixed(3),out);els.exportStatus.textContent='正在本机合并 / 转码…';await ff.exec(cmd);const d=await ff.readFile(out);downloadBlob(new Blob([d.buffer]),`webCut_export.${format}`);els.exportStatus.textContent='导出完成';
    }catch(err){els.exportStatus.textContent='导出失败：'+String(err?.message||err);}
  }
  function audioCodecArgs(f){if(f==='wav')return['-c:a','pcm_s16le'];if(f==='mp3')return['-c:a','libmp3lame','-q:a','2'];if(f==='flac')return['-c:a','flac'];return['-c:a','aac','-b:a','192k'];}

  async function getFFmpeg(){if(state.ffmpeg)return state.ffmpeg;if(state.ffmpegPromise)return state.ffmpegPromise;state.ffmpegPromise=(async()=>{const m=await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.15'),u=await import('https://esm.sh/@ffmpeg/util@0.12.2'),ff=new m.FFmpeg();ff.on('progress',({progress})=>{if(els.exportDialog.open)els.exportStatus.textContent=`处理中 ${(Math.max(0,progress)*100).toFixed(1)}%`;});const bootstrap='import "https://esm.sh/@ffmpeg/ffmpeg@0.12.15/es2022/worker.js";',worker=URL.createObjectURL(new Blob([bootstrap],{type:'text/javascript'})),base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';try{await ff.load({classWorkerURL:worker,coreURL:await u.toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),wasmURL:await u.toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')});}finally{setTimeout(()=>URL.revokeObjectURL(worker),1000);}state.ffmpeg=ff;return ff;})();try{return await state.ffmpegPromise;}finally{state.ffmpegPromise=null;}}
  async function safeDelete(ff,name){try{await ff.deleteFile(name)}catch{}}
  function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}

  function renderAll(){renderTimeline();renderInspector();syncPreview(state.playhead,false);}
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.code==='Space'){e.preventDefault();state.playing?stopPlayback():startPlayback();}else if(e.key==='ArrowLeft')stepFrame(-1);else if(e.key==='ArrowRight')stepFrame(1);else if(e.key.toLowerCase()==='s')splitSelected();else if(e.key==='Delete')deleteSelected();});
  window.addEventListener('beforeunload',()=>{for(const a of state.assets)try{URL.revokeObjectURL(a.url)}catch{}});

  els.zoomRange.value=state.zoom;els.zoomLabel.textContent=`${state.zoom}px/s`;renderAll();
})();