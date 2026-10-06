(function(root){
'use strict';
function logBin(x,width,rate,n){const max=rate/2,min=Math.min(20,max);return Math.max(0,Math.min(n/2-1,Math.round(min*(max/min)**(x/Math.max(1,width-1))*n/rate)));}
function color(db,floor,ceil,theme){const t=Math.max(0,Math.min(1,(db-floor)/(ceil-floor)));if(theme==='purple')return [Math.round(240*t**1.3),Math.round(100*t**3),Math.round(30+225*t)];if(theme==='heat')return [Math.round(255*Math.min(1,t*2)),Math.round(255*Math.max(0,t*2-1)),Math.round(90*Math.max(0,t*4-3))];return [Math.round(30*t),Math.round(165*t**1.4),Math.round(20+235*t)];}
function metrics(samples,db,rate,n){let sum=0,peak=0;for(const v of samples){sum+=v*v;peak=Math.max(peak,Math.abs(v));}const rms=Math.sqrt(sum/Math.max(1,samples.length));let k=0;for(let i=1;i<db.length;i++)if(db[i]>db[k])k=i;return {rms:20*Math.log10(Math.max(1e-8,rms)),peak:20*Math.log10(Math.max(1e-8,peak)),frequency:peak>1e-7?k*rate/n:0,crest:peak&&rms?20*Math.log10(peak/rms):0};}
const api={logBin,color,metrics};if(typeof module==='object')module.exports=api;else root.AudioViz=api;
})(globalThis);
