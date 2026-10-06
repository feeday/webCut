(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function normalize(crop,width,height){
    const W=Math.floor(width/2)*2,H=Math.floor(height/2)*2;
    if(W<2||H<2)throw new Error('无法取得有效的视频尺寸');
    const c=crop||{x:0,y:0,width:W,height:H};
    if(![c.x,c.y,c.width,c.height].every(Number.isFinite))throw new Error('裁剪参数必须是有效数字');
    const x=clamp(Math.floor(c.x/2)*2,0,W-2),y=clamp(Math.floor(c.y/2)*2,0,H-2);
    return {x,y,width:clamp(Math.round(c.width/2)*2,2,W-x),height:clamp(Math.round(c.height/2)*2,2,H-y)};
  }
  function fromPoints(a,b,W,H){return normalize({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)},W,H);}
  function filter(crop,W,H){if(!crop)return '';const c=normalize(crop,W,H);return `crop=${c.width}:${c.height}:${c.x}:${c.y},`;}
  function dimensions(clip,asset){return clip?.crop?normalize(clip.crop,asset.width,asset.height):{width:asset.width,height:asset.height};}
  const api={normalize,fromPoints,filter,dimensions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WebCutCrop=api;
})(globalThis);
