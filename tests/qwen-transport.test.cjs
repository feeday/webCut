const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(fetch, desktop) {
  const context = { window: {WebCutSubtitles:require('../subtitle-tools.js'),__TAURI__:desktop}, location: {protocol:'https:'}, fetch, Blob, Request, FormData, TextEncoder, AbortController, AbortSignal, DOMException, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../qwen-transport.js'),'utf8'),context);
  return context.window.WebCutQwen;
}
test('SSE parser handles heartbeat, CRLF and reports errors',()=>{
 const api=setup();
 assert.equal(api.resultFromSse('event: heartbeat\r\ndata: null\r\n\r\nevent: complete\r\ndata: ["你好", "zh"]\r\n\r\n')[0],'你好');
 assert.throws(()=>api.resultFromSse('event: error\ndata: "failed"\n\n'));
 assert.throws(()=>api.resultFromSse('event: heartbeat\ndata: null\n\n'));
});
test('auto mode chooses same-origin relay and completes three-step protocol',async()=>{
 const calls=[];const api=setup(async(url,options)=>{
  calls.push([url,options]);
  if(url==='/api/qwen/status')return {ok:true,json:async()=>({webcut_qwen_proxy:true})};
  return {status:200,text:async()=>url.endsWith('/upload')?'["/tmp/audio.wav"]':url.endsWith('/call/asr_inference')?'{"event_id":"abc123"}':'event: complete\ndata: ["识别成功", "zh"]\n\n'};
 });
 const client=await api.create({token:'hf_test'});
 assert.equal(client.label,'Python 转发');
 assert.equal(await client.recognize(new Blob(['audio']),{context:'',language:'auto',enable_itn:false}),'识别成功');
 assert.equal(calls[1][1].headers.Authorization,'Bearer hf_test');
 assert.equal(calls[2][0],'/api/qwen/call/asr_inference');
 assert.equal(JSON.parse(calls[2][1].body).data[0].meta._type,'gradio.FileData');
});
test('static fallback contacts hf.space only, and explains network failures',async()=>{
 const calls=[];const api=setup(async url=>{calls.push(url);if(url==='/api/qwen/status')return {ok:false};throw new TypeError('Failed to fetch');});
 const client=await api.create();await assert.rejects(()=>client.recognize(new Blob(['x']),{}),/上传音频网络连接失败/);
 assert.equal(calls[1],'https://qwen-qwen3-asr-demo.hf.space/gradio_api/upload');
});
test('desktop uses native command and handles cancellation',async()=>{
 const abort=new AbortController();let called;
 const api=setup(null,{core:{invoke:async(name,args)=>{called={name,args};abort.abort();return new Promise(()=>{});}}});
 const client=await api.create({signal:abort.signal});await assert.rejects(()=>client.recognize(new Blob(['x']),{}),/已取消/);
 assert.equal(called.name,'qwen_request');assert.equal(called.args.path,'/upload');assert.ok(called.args.contentType.includes('multipart/form-data'));
});
