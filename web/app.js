import { registerPlugin } from '@capacitor/core';

const Llama=registerPlugin('Llama');
const $=s=>document.querySelector(s);
let chats=JSON.parse(localStorage.getItem('pp_chats')||'[]');
let current=chats[0]||{id:crypto.randomUUID(),title:'New chat',messages:[]};
let model=localStorage.getItem('pp_model')||'';
let generating=false,raw='',thinking='',answer='',thinkingLive=false,generatedTokens=0,generationStarted=0,generationStats='';
let downloadedModels=[];let downloading=false;
let settings=JSON.parse(localStorage.getItem('pp_settings')||'{}');
const cfg={context:4096,threads:4,batchThreads:8,batch:256,maxTokens:1024,topK:40,temperature:.7,topP:.95,minP:.05,systemPrompt:'',enableThinking:true,flashAttention:true,mmap:true,mlock:false,useJinja:true,...settings};

function save(){const i=chats.findIndex(x=>x.id===current.id);if(i>=0)chats[i]=current;else chats.unshift(current);localStorage.setItem('pp_chats',JSON.stringify(chats));localStorage.setItem('pp_settings',JSON.stringify(cfg))}
function esc(s){return String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function md(s){let x=esc(s);x=x.replace(/\*\*(.+?)\*\*/gs,'<strong>$1</strong>').replace(/\*(.+?)\*/gs,'<em>$1</em>').replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');return x.replace(/\n/g,'<br>')}

function messageHtml(){
 if(!current.messages.length)return '<div class="empty"><h1>Local AI, on your phone.</h1><p>Load a GGUF model and chat privately. Thinking, streaming and conversation history stay on-device.</p><button class="load" id="load">Select GGUF model</button></div>';
 return current.messages.map(m=>m.role==='user'?'<div class="msg user"><div class="bubble"><div class="role">You</div>'+md(m.content)+'</div></div>':'<div class="msg"><div class="bubble"><div class="role">Assistant</div>'+md(m.content)+'</div></div>').join('');
}

function updateLiveUI(){
 const statsEl=$('#stats');if(statsEl)statsEl.textContent=generationStats;
 const thinkingEl=document.querySelector('.thinking-body');
 if(thinkingEl&&thinkingLive)thinkingEl.innerHTML=md(thinking);
 const assistant=current.messages[current.messages.length-1];
 const bubbles=document.querySelectorAll('.msg:not(.user) .bubble');
 const bubble=bubbles[bubbles.length-1];
 if(bubble&&assistant){bubble.innerHTML='<div class="role">Assistant</div>'+md(assistant.content||'')}
}
function render(){
 app.innerHTML='<div class="app"><div class="scrim"></div><aside class="drawer"><div class="brand"><b>PocketPal Local</b><span>Local AI assistant</span></div><div class="nav"><button class="active" id="navChats">▣ &nbsp; Chats</button><button id="newChat">＋ &nbsp; New chat</button><button id="models">◈ &nbsp; Models</button><button id="settings">⚙ &nbsp; Settings</button><button id="logs">▤ &nbsp; Logs</button></div><div class="saved">CONVERSATIONS</div><div class="chat-list">'+chats.map(c=>'<button class="chat-row '+(c.id===current.id?'active':'')+'" data-chat="'+c.id+'"><strong>'+esc(c.title)+'</strong><small>'+c.messages.length+' messages</small></button>').join('')+'</div><div class="model-dock"><small>Local model</small><b>'+esc(model||'No model loaded')+'</b></div></aside><main class="shell"><div class="stars" aria-hidden="true"></div><div class="floating-top"><button class="float-btn menu" id="menu" aria-label="Menu">☰</button><div class="float-model">'+esc(model||'No model loaded')+'</div><div class="float-actions"><button class="float-btn" id="edit" aria-label="Focus input">✎</button><button class="float-btn" id="more" aria-label="Settings">⋮</button></div></div><section class="messages" id="messages">'+messageHtml()+'</section><div class="composer-wrap">'+(thinkingLive?'<div class="thinking"><div class="thinking-head"><span class="brain">◉</span><span>Thinking...</span><span style="margin-left:auto">•••</span></div><div class="thinking-body">'+md(thinking)+'</div></div>':'')+'<div class="composer"><div class="input-row"><button class="icon" id="attach">＋</button><textarea class="input" id="input" rows="1" placeholder="Ask assistant..."></textarea><button class="send '+(generating?'stop':'')+'" id="send">'+(generating?'■':'➤')+'</button></div><div class="meta stats" id="stats"></div></div></div></main></div>';
 wire();
 const inp=$('#input');
 if(inp){inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,145)+'px'});inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}})}
}

function wire(){
 const statsEl=$('#stats');if(statsEl)statsEl.textContent=generationStats;
 document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{current=chats.find(c=>c.id===b.dataset.chat)||current;render()});
 $('#menu').onclick=()=>{$('.drawer').classList.add('open');$('.scrim').classList.add('open')};
 $('.scrim').onclick=()=>{$('.drawer').classList.remove('open');$('.scrim').classList.remove('open')};
 $('#newChat').onclick=()=>{current={id:crypto.randomUUID(),title:'New chat',messages:[]};save();render()};
 $('#settings').onclick=showSettings;$('#models').onclick=showModels;$('#logs').onclick=()=>Llama.exportLog();$('#more').onclick=showSettings;$('#edit').onclick=()=>$('#input')?.focus();
 $('#load')?.addEventListener('click',loadModel);$('#attach').onclick=loadModel;$('#send').onclick=()=>generating?Llama.stop():send();
}

async function loadModel(){
 try{const p=await Llama.pickModel();if(!p?.path)return;await loadModelPath(p.path,p.name||p.path.split('/').pop())}
 catch(e){console.error(e);alert('Native model error. Export Logs for diagnosis.')}
}
async function loadModelPath(path,name){
 try{const r=await Llama.loadModel({path,...cfg});if(r.ok){model=name||path.split('/').pop();localStorage.setItem('pp_model',model);localStorage.setItem('pp_model_path',path);render()}else alert('Model failed to load. Export the diagnostic log for details.')}
 catch(e){console.error(e);alert('Model load error. Export Logs for diagnosis.')}
}
async function refreshModels(){try{const r=await Llama.listModels();downloadedModels=r?.models||[];return downloadedModels}catch(e){console.error(e);return []}}
function fmtBytes(n){
 const x0=Number(n);
 if(!Number.isFinite(x0)||x0<=0)return '0 B';
 const u=['B','KB','MB','GB','TB'];let x=x0,i=0;
 while(x>=1024&&i<u.length-1){x/=1024;i++}
 return x.toFixed(i?1:0)+' '+u[i];
}

async function showModels(){
 const list=await refreshModels();
 const catalog=[
  {name:'Qwen3 0.6B · Q4_0',file:'Qwen3-0.6B-Q4_0.gguf',size:'429 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true'},
  {name:'Qwen3 0.6B · Q8_0',file:'Qwen3-0.6B-Q8_0.gguf',size:'805 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true'},
  {name:'Qwen3 1.7B · Q4_K_M',file:'Qwen3-1.7B-Q4_K_M.gguf',size:'1.28 GB',url:'https://huggingface.co/tensorblock/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf?download=true'}
 ];
 const card=m=>{const catalogSize=catalog.find(x=>x.file===m.name)?.size;return '<div class="model-card"><div class="model-info"><b>'+esc(m.name)+'</b><small>'+esc(m.size||catalogSize||fmtBytes(m.bytes))+'</small></div>'+(m.downloading?'<div class="download-progress"><span style="width:'+Math.max(0,m.percent||0)+'%"></span></div><small class="progress-text">'+(m.percent>=0?m.percent+'%':'Downloading...')+'</small>':(m.loaded?'<button class="model-btn active-model" data-unload="1">Loaded · Unload</button>':'<button class="model-btn" data-load-path="'+esc(m.path||'')+'">'+(m.path?'Load':'Download')+'</button>'))+'</div>';};
 document.body.insertAdjacentHTML('beforeend','<div class="models-page"><div class="models-head"><button class="float-btn" id="closeModels">‹</button><div><b>Models</b><small>Download, import and manage GGUF files</small></div></div><div class="import-box"><button class="import-model" id="importModel">＋ Import GGUF</button><small>Choose a .gguf file from your device</small></div><section><h3>Models to download</h3><div class="model-list" id="catalog">'+catalog.map(x=>card(x)).join('')+'</div></section><div class="section-line"></div><section><h3>Downloaded models</h3><div class="model-list" id="downloaded">'+(list.length?list.map(x=>card({...x,loaded:x.name===model})).join(''):'<div class="no-models">No downloaded models yet.</div>')+'</div></section></div>');
 const close=()=>document.querySelector('.models-page')?.remove();$('#closeModels').onclick=close;$('#importModel').onclick=async()=>{close();await loadModel()};
 document.querySelectorAll('[data-load-path]').forEach(b=>b.onclick=()=>loadModelPath(b.dataset.loadPath,b.dataset.loadPath.split('/').pop()));
 document.querySelectorAll('[data-unload]').forEach(b=>b.onclick=async()=>{await Llama.unloadModel();model='';localStorage.removeItem('pp_model');localStorage.removeItem('pp_model_path');close();showModels()});
 document.querySelectorAll('#catalog .model-btn').forEach((b,i)=>b.onclick=async()=>{if(downloading)return;downloading=true;const item=catalog[i];b.disabled=true;b.textContent='Downloading...';try{await Llama.downloadModel({url:item.url,name:item.file});await refreshModels();close();showModels()}catch(e){alert(String(e));b.disabled=false;b.textContent='Download'}finally{downloading=false}});
}


function parseThinking(s){
 const tags=[['<think>','</think>'],['<thinking>','</thinking>'],['<|thinking|>','<|end_thinking|>'],['<|begin_of_thought|>','<|end_of_thought|>'],['<|begin_of_thinking|>','<|end_of_thinking|>'],['<｜begin▁of▁thinking｜>','<｜end▁of▁thinking｜>']];
 let best=-1,o='',c='';
 for(const [a,b] of tags){const i=s.indexOf(a);if(i>=0&&(best<0||i<best)){best=i;o=a;c=b}}
 if(best>=0){const st=best+o.length,e=s.indexOf(c,st);if(e>=0)return {thinking:s.slice(st,e).trim(),answer:s.slice(e+c.length).trim(),active:false};return {thinking:s.slice(st).trim(),answer:'',active:true}}
 for(const [a,b] of tags){const e=s.indexOf(b);if(e>=0)return {thinking:s.slice(0,e).trim(),answer:s.slice(e+b.length).trim(),active:false}}
 return {thinking:'',answer:s,active:false};
}

async function send(){
 if(generating)return;
 const inp=$('#input');const text=inp?.value.trim();if(!text)return;
 if(!model){await loadModel();return}
 if(current.title==='New chat')current.title=text.slice(0,42);
 current.messages.push({role:'user',content:text});current.messages.push({role:'assistant',content:'',thinking:''});
 save();raw='';thinking='';answer='';thinkingLive=false;generatedTokens=0;generationStarted=performance.now();generationStats='0 tokens · 0.0 tok/s';generating=true;render();
 const roles=current.messages.slice(0,-1).map(x=>x.role),contents=current.messages.slice(0,-1).map(x=>x.content);
 try{await Llama.generate({roles,contents,...cfg})}catch(e){console.error(e);generating=false;render()}
}

Llama.addListener('token',ev=>{
 if(!ev.text)return;
 generatedTokens++;const elapsed=Math.max(.001,(performance.now()-generationStarted)/1000);generationStats=generatedTokens+' tokens · '+(generatedTokens/elapsed).toFixed(1)+' tok/s';
 raw+=ev.text;const p=parseThinking(raw);thinking=p.thinking;answer=p.answer;
 const wasThinkingLive=thinkingLive;thinkingLive=p.active;
 const a=current.messages[current.messages.length-1];a.thinking=thinking;a.content=answer;save();
 if(thinkingLive && !wasThinkingLive){
   render();
 }else if(!thinkingLive && wasThinkingLive){
   render();
 }else{
   updateLiveUI();
 }
 const m=$('#messages');
 if(m){
   const nearBottom=m.scrollHeight-m.scrollTop-m.clientHeight<120;
   if(nearBottom)m.scrollTop=m.scrollHeight;
 }
});
Llama.addListener('generationDone',()=>{
 const p=parseThinking(raw);const a=current.messages[current.messages.length-1];a.thinking=p.thinking;a.content=p.answer;thinkingLive=false;generating=false;const elapsed=Math.max(.001,(performance.now()-generationStarted)/1000);generationStats=generatedTokens+' tokens · '+(generatedTokens/elapsed).toFixed(1)+' tok/s';save();render();
});
Llama.addListener('nativeError',e=>console.error('nativeError',e));

function showSettings(){
 const fields=[['context','Context',cfg.context],['threads','Generation threads',cfg.threads],['batchThreads','Prompt threads',cfg.batchThreads],['batch','Batch size',cfg.batch],['maxTokens','Max output tokens',cfg.maxTokens],['topK','Top K',cfg.topK],['temperature','Temperature',cfg.temperature],['topP','Top P',cfg.topP],['minP','Min P',cfg.minP]];
 document.body.insertAdjacentHTML('beforeend','<div class="modal"><div class="modal-card"><div class="modal-head"><b>Local model settings</b><button id="closeSettings">✕</button></div><div class="settings">'+fields.map(f=>'<div class="field"><label>'+f[1]+'</label><input id="s_'+f[0]+'" value="'+f[2]+'"></div>').join('')+'<div class="field"><label>System prompt</label><textarea id="s_systemPrompt" rows="3">'+esc(cfg.systemPrompt)+'</textarea></div><div class="field"><label><input type="checkbox" id="s_enableThinking" '+(cfg.enableThinking?'checked':'')+'> Enable thinking / reasoning</label></div><div class="field"><label><input type="checkbox" id="s_flashAttention" '+(cfg.flashAttention?'checked':'')+'> Flash Attention</label></div><div class="field"><label><input type="checkbox" id="s_mmap" '+(cfg.mmap?'checked':'')+'> Memory map model</label></div><div class="field"><label><input type="checkbox" id="s_mlock" '+(cfg.mlock?'checked':'')+'> Lock model in RAM</label></div><div class="field"><label><input type="checkbox" id="s_useJinja" '+(cfg.useJinja?'checked':'')+'> Use Jinja chat templates</label></div></div><div class="actions"><button id="cancelSettings">Cancel</button><button class="primary" id="applySettings">Apply</button></div></div></div>');
 const close=()=>document.querySelector('.modal')?.remove();$('#closeSettings').onclick=close;$('#cancelSettings').onclick=close;
 $('#applySettings').onclick=()=>{for(const f of fields)cfg[f[0]]=Number($('#s_'+f[0]).value);cfg.systemPrompt=$('#s_systemPrompt').value;for(const k of ['enableThinking','flashAttention','mmap','mlock','useJinja'])cfg[k]=$('#s_'+k).checked;save();close()}
}

render();