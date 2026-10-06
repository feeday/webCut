const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../subtitle-renderer.js');
test('styles validate fonts, positions, sizes and colors',()=>{
 const s=R.style({font:'not-a-font',x:-20,y:150,size:99,color:'invalid',bold:false});
 assert.deepEqual(s,{font:'sans',x:0,y:100,size:15,color:'#ffffff',bold:false});
});
test('subtitle timeline preserves gaps, clips boundaries and merges overlaps',()=>{
 const s=R.segments([{start:-1,end:1,text:'A'},{start:.5,end:2,text:'B'},{start:3,end:5,text:'C'}],4);
 assert.deepEqual(s,[{start:0,end:.5,text:'A'},{start:.5,end:1,text:'A\nB'},{start:1,end:2,text:'B'},{start:2,end:3,text:''},{start:3,end:4,text:'C'}]);
});
test('empty/invalid/outside cues do not leave stale text',()=>{
 assert.deepEqual(R.segments([{start:1,end:1,text:'x'},{start:3,end:4,text:'x'}],2),[{start:0,end:2,text:''}]);
});
