const test=require('node:test'),assert=require('node:assert/strict');
const u=require('../crop-tools.js');
test('reverse drag maps to source coordinates and even pixels',()=>{
 assert.deepEqual(u.fromPoints({x:1500,y:900},{x:300,y:100},1920,1080),{x:300,y:100,width:1200,height:800});
});
test('out-of-bounds and small selections stay valid for encoding',()=>{
 const c=u.normalize({x:1919,y:-2,width:100,height:11},1920,1080);
 assert.deepEqual(c,{x:1918,y:0,width:2,height:12});
 assert.deepEqual(u.normalize(null,721,1281),{x:0,y:0,width:720,height:1280});
 assert.throws(()=>u.normalize({x:NaN,y:0,width:1,height:1},1920,1080));
});
test('export filter and canvas derive from the same crop',()=>{
 const clip={crop:{x:200,y:100,width:960,height:540}},a={width:1920,height:1080};
 assert.equal(u.filter(clip.crop,a.width,a.height),'crop=960:540:200:100,');
 assert.equal(u.dimensions(clip,a).width,960);
 assert.equal(u.filter(null,a.width,a.height),'');
});
