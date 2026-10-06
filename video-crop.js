(() => {
  'use strict';
  function init(){
    const api=window.__webCutApi,state=window.__webCutState,util=window.WebCutCrop,$=id=>document.getElementById(id);
    const dialog=$('cropDialog'),canvas=$('cropCanvas'),surface=$('cropSurface'),box=$('cropBox'),result=$('cropResult');
    let clip,asset,video,crop,ready=false,generation=0,gesture;
    const fields=['x','y','width','height'];
    function draw(){
      if(!ready)return;
      const ratio=asset.width/asset.height,w=Math.min(860,Math.max(180,dialog.clientWidth-48),Math.max(180,innerHeight*.43)*ratio);
      surface.style.width=w+'px';surface.style.height=(w/ratio)+'px';
      canvas.width=Math.round(w);canvas.height=Math.round(w/ratio);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      box.style.left=crop.x/asset.width*100+'%';box.style.top=crop.y/asset.height*100+'%';box.style.width=crop.width/asset.width*100+'%';box.style.height=crop.height/asset.height*100+'%';
      fields.forEach(key=>{$('crop'+key).value=crop[key];});
      result.width=Math.max(2,Math.round(Math.min(300,120*crop.width/crop.height)));result.height=Math.max(2,Math.round(result.width*crop.height/crop.width));
      result.getContext('2d').drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,result.width,result.height);
      $('cropStatus').textContent=`原片 ${asset.width} × ${asset.height} → 保留 ${crop.width} × ${crop.height} 像素。`;
    }
    function eventOnce(target,type,token){return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>done(new Error('视频帧加载超时，请关闭后重试')),15000);
      function done(error){clearTimeout(timer);target.removeEventListener(type,ok);target.removeEventListener('error',fail);error?reject(error):resolve();}
      function ok(){done(token===generation?null:new Error('操作已取消'));}function fail(){done(new Error('无法读取视频画面，可能是浏览器不支持此视频编码'));}
      target.addEventListener(type,ok,{once:true});target.addEventListener('error',fail,{once:true});
    });}
    $('cropVideoBtn').onclick=async()=>{
      const selected=api.selectedClip();clip=selected?.kind==='videos'?selected.clip:state.videos.find(c=>state.playhead>=c.start&&state.playhead<c.start+c.duration);
      if(!clip){alert('请先导入视频，并在时间轴选择要裁剪的视频片段');return;}
      asset=api.assetById(clip.assetId);if(!asset?.width||!asset?.height){alert('视频尺寸尚未加载，请稍后重试');return;}
      api.stopPlayback();ready=false;const token=++generation;gesture=null;
      $('applyCropBtn').disabled=true;$('resetCropBtn').disabled=true;surface.hidden=true;result.hidden=true;
      $('cropStatus').textContent='正在读取当前视频帧…';dialog.showModal();
      video=document.createElement('video');video.muted=true;video.preload='auto';
      const v=video;
      try{
        const loaded=eventOnce(v,'loadeddata',token);v.src=asset.url;v.load();await loaded;
        const time=Math.min(Math.max(clip.in+(state.playhead-clip.start),clip.in),Math.max(clip.in,clip.out-.04));
        if(Math.abs(v.currentTime-time)>.001){const seeked=eventOnce(v,'seeked',token);v.currentTime=time;await seeked;}
        if(token!==generation||!dialog.open)return;
        crop=util.normalize(clip.crop,asset.width,asset.height);ready=true;surface.hidden=false;result.hidden=false;
        $('applyCropBtn').disabled=false;$('resetCropBtn').disabled=false;draw();
      }catch(e){if(token===generation)$('cropStatus').textContent=e.message;}
    };
    function point(e){const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(asset.width,(e.clientX-r.left)/r.width*asset.width)),y:Math.max(0,Math.min(asset.height,(e.clientY-r.top)/r.height*asset.height))};}
    surface.addEventListener('pointerdown',e=>{
      if(!ready||e.button!==0)return;e.preventDefault();
      gesture={id:e.pointerId,start:point(e),original:{...crop},handle:e.target.dataset.corner,move:e.target===box&&!fields.every(k=>crop[k]===util.normalize(null,asset.width,asset.height)[k])};surface.setPointerCapture(e.pointerId);
    });
    surface.addEventListener('pointermove',e=>{
      if(!gesture||gesture.id!==e.pointerId)return;
      const p=point(e),g=gesture,o=g.original;
      if(g.move){crop=util.normalize({...o,x:Math.max(0,Math.min(asset.width-o.width,o.x+p.x-g.start.x)),y:Math.max(0,Math.min(asset.height-o.height,o.y+p.y-g.start.y))},asset.width,asset.height);}
      else if(g.handle){const opposite={x:g.handle.includes('w')?o.x+o.width:o.x,y:g.handle.includes('n')?o.y+o.height:o.y};crop=util.fromPoints(opposite,p,asset.width,asset.height);}
      else crop=util.fromPoints(g.start,p,asset.width,asset.height);
      draw();
    });
    surface.addEventListener('pointerup',()=>{gesture=null;});
    surface.addEventListener('pointercancel',()=>{if(gesture){crop=gesture.original;gesture=null;draw();}});
    fields.forEach(key=>$('crop'+key).addEventListener('change',()=>{
      if(!ready)return;
      const draft=Object.fromEntries(fields.map(k=>[k,Number($('crop'+k).value)]));
      if(draft.width<=0||draft.height<=0){$('cropStatus').textContent='宽、高必须大于 0';return;}
      try{crop=util.normalize(draft,asset.width,asset.height);draw();}catch(e){$('cropStatus').textContent=e.message;}
    }));
    $('resetCropBtn').onclick=()=>{crop=util.normalize(null,asset.width,asset.height);draw();};
    $('applyCropBtn').onclick=()=>{
      if(!ready||!state.videos.includes(clip))return;
      api.snapshot();const full=util.normalize(null,asset.width,asset.height);
      if(fields.every(k=>crop[k]===full[k]))delete clip.crop;else clip.crop={...crop};
      api.renderAll();dialog.close();
    };
    dialog.addEventListener('close',()=>{generation++;ready=false;gesture=null;if(video){video.pause();video.removeAttribute('src');video.load();video=null;}});
    window.addEventListener('resize',()=>{if(dialog.open)draw();});
  }
  if(window.__webCutApi)init();else window.addEventListener('webcut:ready',init,{once:true});
})();
