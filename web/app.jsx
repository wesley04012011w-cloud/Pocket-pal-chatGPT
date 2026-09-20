import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {registerPlugin} from '@capacitor/core';

const Llama=registerPlugin('Llama');

const DEFAULT_CFG={context:4096,threads:4,batchThreads:8,batch:256,maxTokens:1024,topK:40,temperature:.7,topP:.95,minP:.05,systemPrompt:'',enableThinking:true,flashAttention:true,mmap:true,mlock:false,useJinja:true};
const CATALOG=[
 {name:'Qwen3 0.6B · Q4_0',file:'Qwen3-0.6B-Q4_0.gguf',size:'429 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true'},
 {name:'Qwen3 0.6B · Q8_0',file:'Qwen3-0.6B-Q8_0.gguf',size:'805 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true'},
 {name:'Qwen3 1.7B · Q4_K_M',file:'Qwen3-1.7B-Q4_K_M.gguf',size:'1.28 GB',url:'https://huggingface.co/tensorblock/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf?download=true'}
];

function readJSON(k,f){try{return JSON.parse(localStorage.getItem(k)||'')}catch{return f}}
function makeChat(){return{id:crypto.randomUUID(),title:'New chat',messages:[]}}
function fmtBytes(n){const x0=Number(n);if(!Number.isFinite(x0)||x0<=0)return'0 B';const u=['B','KB','MB','GB','TB'];let x=x0,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return x.toFixed(i?1:0)+' '+u[i]}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function Markdown({text=''}){const safe=escapeHtml(text).replace(/\*\*(.+?)\*\*/gs,'<strong>$1</strong>').replace(/\*(.+?)\*/gs,'<em>$1</em>').replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>').replace(/\n/g,'<br>');return <span dangerouslySetInnerHTML={{__html:safe}}/>}
function parseThinking(s){const tags=[['<think>','</think>'],['<thinking>','</thinking>'],['<|thinking|>','<|end_thinking|>'],['<|begin_of_thought|>','<|end_of_thought|>'],['<|begin_of_thinking|>','<|end_of_thinking|>'],['<｜begin▁of▁thinking｜>','<｜end▁of▁thinking｜>']];let best=-1,o='',c='';for(const[a,b]of tags){const i=s.indexOf(a);if(i>=0&&(best<0||i<best)){best=i;o=a;c=b}}if(best>=0){const st=best+o.length,e=s.indexOf(c,st);if(e>=0)return{thinking:s.slice(st,e).trim(),answer:s.slice(e+c.length).trim(),active:false};return{thinking:s.slice(st).trim(),answer:'',active:true}}for(const[a,b]of tags){const e=s.indexOf(b);if(e>=0)return{thinking:s.slice(0,e).trim(),answer:s.slice(e+b.length).trim(),active:false}}return{thinking:'',answer:s,active:false}}

function Icon({name}){const paths={menu:'M4 7h16M4 12h16M4 17h16',edit:'M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20z',more:'M12 6v.01M12 12v.01M12 18v.01',plus:'M12 5v14M5 12h14',send:'M5 12h13M13 6l6 6-6 6',stop:'M7 7h10v10H7z',back:'M15 18l-6-6 6-6',chat:'M5 5h14v10H8l-3 3V5z',models:'M5 7h14M5 12h14M5 17h14',settings:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',log:'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4',upload:'M12 16V5M8 9l4-4 4 4',download:'M12 5v11M8 12l4 4 4-4',close:'M6 6l12 12M18 6L6 18',spark:'M12 3l1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z'};return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.spark}/></svg>}

function App(){
 const initialChats=readJSON('pp_chats',[]);const seedChat=initialChats[0]||makeChat();const [chats,setChats]=useState(initialChats.length?initialChats:[seedChat]);
 const [chatId,setChatId]=useState(seedChat.id);
 const [model,setModel]=useState(localStorage.getItem('pp_model')||'');
 const [modelPath,setModelPath]=useState(localStorage.getItem('pp_model_path')||'');
 const [cfg,setCfg]=useState({...DEFAULT_CFG,...readJSON('pp_settings',{})});
 const [drawer,setDrawer]=useState(false),[screen,setScreen]=useState('chat'),[settingsOpen,setSettingsOpen]=useState(false);
 const [generating,setGenerating]=useState(false),[raw,setRaw]=useState(''),[thinking,setThinking]=useState(''),[thinkingLive,setThinkingLive]=useState(false),[stats,setStats]=useState('');
 const [input,setInput]=useState('');const [downloaded,setDownloaded]=useState([]);const [downloading,setDownloading]=useState(null);
 const generationRef=useRef({count:0,start:0,raw:''});const generatingRef=useRef(false);const chatIdRef=useRef(chatId);const chatsRef=useRef(chats);
 const current=useMemo(()=>chats.find(c=>c.id===chatId)||chats[0]||makeChat(),[chats,chatId]);
 useEffect(()=>{chatIdRef.current=chatId},[chatId]);useEffect(()=>{chatsRef.current=chats},[chats]);
 useEffect(()=>{localStorage.setItem('pp_chats',JSON.stringify(chats));localStorage.setItem('pp_settings',JSON.stringify(cfg))},[chats,cfg]);
 const patchCurrent=useCallback(fn=>setChats(prev=>prev.map(c=>c.id===chatIdRef.current?fn({...c,messages:[...c.messages]}):c)),[]);
 const refreshModels=useCallback(async()=>{try{const r=await Llama.listModels();setDownloaded(r?.models||[])}catch(e){console.error(e)}},[]);
 useEffect(()=>{if(screen==='models')refreshModels()},[screen,refreshModels]);

 useEffect(()=>{
   const tokenListener=Llama.addListener('token',ev=>{
     if(!ev?.text)return;const g=generationRef.current;g.count++;g.raw+=ev.text;
     const p=parseThinking(g.raw);setRaw(g.raw);setThinking(p.thinking);setThinkingLive(p.active);
     const elapsed=Math.max(.001,(performance.now()-g.start)/1000);setStats(g.count+' tokens · '+(g.count/elapsed).toFixed(1)+' tok/s');
     patchCurrent(c=>{const m=[...c.messages];const a={...(m[m.length-1]||{role:'assistant',content:'',thinking:''})};a.content=p.answer;a.thinking=p.thinking;m[m.length-1]=a;return{...c,messages:m}});
   });
   const doneListener=Llama.addListener('generationDone',()=>{
     const g=generationRef.current,p=parseThinking(g.raw);setThinking(p.thinking);setThinkingLive(false);setGenerating(false);generatingRef.current=false;
     const elapsed=Math.max(.001,(performance.now()-g.start)/1000);setStats(g.count+' tokens · '+(g.count/elapsed).toFixed(1)+' tok/s');
     patchCurrent(c=>{const m=[...c.messages];if(m.length){m[m.length-1]={...m[m.length-1],content:p.answer,thinking:p.thinking}}return{...c,messages:m}});
   });
   return()=>{tokenListener.then(x=>x.remove());doneListener.then(x=>x.remove())};
 },[patchCurrent]);

 async function pickAndLoad(){try{const p=await Llama.pickModel();if(p?.path)await loadPath(p.path,p.name||p.path.split('/').pop())}catch(e){console.error(e);alert('Could not load the model. Export Logs for diagnosis.')}} 
 async function loadPath(path,name){try{const r=await Llama.loadModel({path,...cfg});if(r.ok){setModel(name||path.split('/').pop());setModelPath(path);localStorage.setItem('pp_model',name||path.split('/').pop());localStorage.setItem('pp_model_path',path);setScreen('chat')}}catch(e){console.error(e);alert('Model load error. Export Logs for diagnosis.')}}
 async function send(){
   if(generatingRef.current)return;const text=input.trim();if(!text)return;if(!model){await pickAndLoad();return}
   const title=current.title==='New chat'?text.slice(0,42):current.title;
   const msgs=[...current.messages,{role:'user',content:text},{role:'assistant',content:'',thinking:''}];
   setChats(prev=>prev.map(c=>c.id===current.id?{...c,title,messages:msgs}:c));setInput('');
   generationRef.current={count:0,start:performance.now(),raw:''};setRaw('');setThinking('');setThinkingLive(false);setStats('0 tokens · 0.0 tok/s');setGenerating(true);generatingRef.current=true;
   try{await Llama.generate({roles:msgs.slice(0,-1).map(x=>x.role),contents:msgs.slice(0,-1).map(x=>x.content),...cfg})}catch(e){console.error(e);setGenerating(false);generatingRef.current=false}
 }
 function newChat(){const c=makeChat();setChats(p=>[c,...p]);setChatId(c.id);setDrawer(false);setScreen('chat');setInput('')}
 async function unload(){try{await Llama.unloadModel()}finally{setModel('');setModelPath('');localStorage.removeItem('pp_model');localStorage.removeItem('pp_model_path');refreshModels()}}
 async function importModel(){await pickAndLoad()}
 async function download(item){if(downloading)return;setDownloading(item.file);try{await Llama.downloadModel({url:item.url,name:item.file});await refreshModels()}catch(e){alert(String(e))}finally{setDownloading(null)}}

 return <div className="app">
   <div className={'scrim '+(drawer?'open':'')} onClick={()=>setDrawer(false)}/>
   <aside className={'drawer '+(drawer?'open':'')}>
    <div className="brand"><b>PocketPal Local</b><span>Local AI assistant</span></div>
    <nav className="nav">
      <button className={screen==='chat'?'active':''} onClick={()=>{setScreen('chat');setDrawer(false)}}><Icon name="chat"/>Chats</button>
      <button onClick={newChat}><Icon name="plus"/>New chat</button>
      <button className={screen==='models'?'active':''} onClick={()=>{setScreen('models');setDrawer(false)}}><Icon name="models"/>Models</button>
      <button onClick={()=>{setSettingsOpen(true);setDrawer(false)}}><Icon name="settings"/>Settings</button>
      <button onClick={()=>Llama.exportLog()}><Icon name="log"/>Logs</button>
    </nav>
    <div className="saved">CONVERSATIONS</div>
    <div className="chat-list">{chats.map(c=><button key={c.id} className={'chat-row '+(c.id===current.id?'active':'')} onClick={()=>{setChatId(c.id);setScreen('chat');setDrawer(false)}}><strong>{c.title}</strong><small>{c.messages.length} messages</small></button>)}</div>
    <div className="model-dock"><small>Local model</small><b>{model||'No model loaded'}</b></div>
   </aside>

   {screen==='models'?<ModelsPage downloaded={downloaded} model={model} downloading={downloading} onBack={()=>setScreen('chat')} onImport={importModel} onDownload={download} onLoad={loadPath} onUnload={unload}/>:<main className="shell">
     <div className="stars" aria-hidden="true"/>
     <div className="floating-top"><button className="float-btn" onClick={()=>setDrawer(true)} aria-label="Menu"><Icon name="menu"/></button><div className="float-model">{model||'No model loaded'}</div><div className="float-actions"><button className="float-btn" onClick={()=>document.querySelector('.input')?.focus()} aria-label="Focus input"><Icon name="edit"/></button><button className="float-btn" onClick={()=>setSettingsOpen(true)} aria-label="Settings"><Icon name="more"/></button></div></div>
     <section className="messages" id="messages">
       {!current.messages.length?<div className="empty"><div className="empty-mark"><Icon name="spark"/></div><h1>Local AI, on your phone.</h1><p>Load a GGUF model and chat privately. Thinking, streaming and conversation history stay on-device.</p><button className="load" onClick={pickAndLoad}>Select GGUF model</button></div>:
       current.messages.map((m,i)=><div className={'msg '+(m.role==='user'?'user':'')} key={i}><div className="bubble"><div className="role">{m.role==='user'?'You':'Assistant'}</div><Markdown text={m.content}/></div></div>)}
     </section>
     <div className="composer-wrap">
       {thinkingLive&&<div className="thinking"><div className="thinking-head"><span className="brain"><Icon name="spark"/></span><span>Thinking...</span><span className="thinking-dots">•••</span></div><div className="thinking-body">{thinking||' '}</div></div>}
       <div className="composer"><div className="input-row"><button className="icon" onClick={pickAndLoad} aria-label="Load model"><Icon name="plus"/></button><textarea className="input" rows="1" value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,145)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask assistant..."/><button className={'send '+(generating?'stop':'')} onClick={()=>generating?Llama.stop():send()} aria-label={generating?'Stop':'Send'}><Icon name={generating?'stop':'send'}/></button></div><div className="meta stats">{stats}</div></div>
     </div>
   </main>}
   {settingsOpen&&<Settings cfg={cfg} onClose={()=>setSettingsOpen(false)} onApply={next=>{setCfg(next);setSettingsOpen(false)}}/>}
 </div>
}

function ModelsPage({downloaded,model,downloading,onBack,onImport,onDownload,onLoad,onUnload}){
 return <div className="models-page"><div className="models-head"><button className="float-btn" onClick={onBack}><Icon name="back"/></button><div><b>Models</b><small>Download, import and manage GGUF files</small></div></div>
  <div className="import-box"><button className="import-model" onClick={onImport}><Icon name="upload"/>Import GGUF</button><small>Choose a .gguf file from your device</small></div>
  <section><h3>Models to download</h3><div className="model-list">{CATALOG.map(x=><div className="model-card" key={x.file}><div className="model-info"><b>{x.name}</b><small>{x.size}</small></div><button className="model-btn" disabled={!!downloading} onClick={()=>onDownload(x)}>{downloading===x.file?'Downloading...':'Download'}</button></div>)}</div></section>
  <div className="section-line"/>
  <section><h3>Downloaded models</h3><div className="model-list">{downloaded.length?downloaded.map(x=>{const size=CATALOG.find(c=>c.file===x.name)?.size||fmtBytes(x.bytes);return <div className="model-card" key={x.path}><div className="model-info"><b>{x.name}</b><small>{size}</small></div>{x.name===model?<button className="model-btn active-model" onClick={onUnload}>Loaded · Unload</button>:<button className="model-btn" onClick={()=>onLoad(x.path,x.name)}>Load</button>}</div>}):<div className="no-models">No downloaded models yet.</div>}</div></section>
 </div>
}

function Settings({cfg,onClose,onApply}){
 const [v,setV]=useState({...cfg});const fields=[['context','Context'],['threads','Generation threads'],['batchThreads','Prompt threads'],['batch','Batch size'],['maxTokens','Max output tokens'],['topK','Top K'],['temperature','Temperature'],['topP','Top P'],['minP','Min P']];
 return <div className="modal"><div className="modal-card"><div className="modal-head"><b>Local model settings</b><button onClick={onClose}><Icon name="close"/></button></div><div className="settings">{fields.map(([k,l])=><div className="field" key={k}><label>{l}</label><input value={v[k]} onChange={e=>setV({...v,[k]:Number(e.target.value)})}/></div>)}<div className="field"><label>System prompt</label><textarea rows="3" value={v.systemPrompt} onChange={e=>setV({...v,systemPrompt:e.target.value})}/></div>{[['enableThinking','Enable thinking / reasoning'],['flashAttention','Flash Attention'],['mmap','Memory map model'],['mlock','Lock model in RAM'],['useJinja','Use Jinja chat templates']].map(([k,l])=><label className="check" key={k}><input type="checkbox" checked={!!v[k]} onChange={e=>setV({...v,[k]:e.target.checked})}/>{l}</label>)}</div><div className="actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onApply(v)}>Apply</button></div></div></div>
}

createRoot(document.getElementById('app')).render(<App/>);
