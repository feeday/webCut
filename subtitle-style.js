(()=>{
 function init(){
  const api=window.__webCutApi,state=window.__webCutState,R=window.WebCutSubtitleRenderer,$=id=>document.getElementById(id);
  const canvas=document.createElement('canvas');canvas.className='subtitle-styled-preview';$('stage').appendChild(canvas);let key='';
  function syncFields(){const s=R.style(state.subtitleStyle);for(const k of ['font','size','x','y','color'])$('subStyle_'+k).value=s[k];$('subStyle_bold').checked=s.bold;$('subStyle_position').value=s.x===50?({10:'top',50:'middle',90:'bottom'}[s.y]||'custom'):'custom';}
  window.__webCutSubtitlePreview=t=>{
   const s=R.style(state.subtitleStyle),text=state.subtitles.filter(c=>t>=c.start&&t<c.end).map(c=>c.text).join('\n');
   const c=state.videos.find(c=>t>=c.start&&t<c.start+c.duration),a=c&&api.assetById(c.assetId),rect=$('stage').getBoundingClientRect();
   const ratio=a?a.width/a.height:16/9,width=Math.min(rect.width,rect.height*ratio),height=width/ratio;
   canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.hidden=!text;
   const next=JSON.stringify([text,s,width,height]);if(next!==key){key=next;R.paint(canvas,text,s,Math.max(2,Math.round(width)),Math.max(2,Math.round(height)));}
   if(!['subStyle_font','subStyle_size','subStyle_x','subStyle_y','subStyle_color','subStyle_bold'].includes(document.activeElement?.id))syncFields();
  };
  function apply(){api.snapshot();state.subtitleStyle=R.style(Object.fromEntries(['font','size','x','y','color'].map(k=>[k,$('subStyle_'+k).value]).concat([['bold',$('subStyle_bold').checked]])));syncFields();api.syncPreview(state.playhead,false);}
  for(const k of ['font','size','x','y','color','bold'])$('subStyle_'+k).addEventListener('change',apply);
  $('subStyle_position').onchange=()=>{const y={top:10,middle:50,bottom:90}[$('subStyle_position').value];if(y!==undefined){$('subStyle_x').value=50;$('subStyle_y').value=y;apply();}};
  $('subtitleStyleBtn').onclick=()=>{syncFields();$('subtitleStyleDialog').showModal();};
  if(window.ResizeObserver)new ResizeObserver(()=>window.__webCutSubtitlePreview(state.playhead)).observe($('stage'));
  window.addEventListener('resize',()=>window.__webCutSubtitlePreview(state.playhead));syncFields();api.syncPreview(state.playhead,false);
 }
 if(window.__webCutApi)init();else window.addEventListener('webcut:ready',init,{once:true});
})();
