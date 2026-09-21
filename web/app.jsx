import React,{memo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {registerPlugin} from '@capacitor/core';

const Llama=registerPlugin('Llama');
const DEFAULT_ENGINE={context:4096,threads:4,batchThreads:4,batch:256,flashAttention:true,mmap:true,mlock:false,offloadKQV:false};
const DEFAULT_CHAT={maxTokens:1024,topK:40,temperature:.7,topP:.95,minP:.05,repeatPenalty:1.1,repeatLastN:64,systemPrompt:'',enableThinking:true,useJinja:true};
const CATALOG=[
 {name:'Qwen3 0.6B · Q4_0',file:'Qwen3-0.6B-Q4_0.gguf',size:'429 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true'},
 {name:'Qwen3 0.6B · Q8_0',file:'Qwen3-0.6B-Q8_0.gguf',size:'805 MB',url:'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true'},
 {name:'Qwen3 1.7B · Q4_K_M',file:'Qwen3-1.7B-Q4_K_M.gguf',size:'1.28 GB',url:'https://huggingface.co/tensorblock/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf?download=true'}
];
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'')}catch{return f}};
const makeChat=()=>({id:crypto.randomUUID(),title:'New chat',messages:[]});
const fmtBytes=n=>{const x0=Number(n);if(!Number.isFinite(x0)||x0<=0)return'0 B';const u=['B','KB','MB','GB','TB'];let x=x0,i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return x.toFixed(i?1:0)+' '+u[i]};
const escapeHtml=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderMarkdown(src=''){
 const lines=String(src??'').replace(/\r/g,'').split('\n'),out=[];let inCode=false,code=[];
 const inline=x=>escapeHtml(x).replace(/\*\*(.+?)\*\*/gs,'<strong>$1</strong>').replace(/__(.+?)__/gs,'<strong>$1</strong>').replace(/\*(.+?)\*/gs,'<em>$1</em>').replace(/_(.+?)_/gs,'<em>$1</em>').replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>');
 for(let i=0;i<lines.length;i++){const line=lines[i];
  if(line.trim().startsWith('\x60\x60\x60')){if(inCode){out.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');code=[];inCode=false}else inCode=true;continue}
  if(inCode){code.push(line);continue}
  if(/^\s*\|/.test(line)&&i+1<lines.length&&/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i+1])){const row=x=>x.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>inline(c.trim()));const h=row(line);i++;const rs=[];while(i+1<lines.length&&/^\s*\|/.test(lines[i+1])){i++;rs.push(row(lines[i]))}out.push('<div class="md-table-wrap"><table><thead><tr>'+h.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+rs.map(r=>'<tr>'+h.map((_,j)=>'<td>'+(r[j]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue}
  if(/^#{1,6}\s/.test(line)){const m=line.match(/^(#{1,6})\s+(.*)$/);out.push('<h'+m[1].length+'>'+inline(m[2])+'</h'+m[1].length+'>');continue}
  if(/^\s*>/.test(line)){out.push('<blockquote>'+inline(line.replace(/^\s*>\s?/,'') )+'</blockquote>');continue}
  if(/^\s*[-*+]\s+/.test(line)){let a=[];while(i<lines.length&&/^\s*[-*+]\s+/.test(lines[i])){a.push('<li>'+inline(lines[i].replace(/^\s*[-*+]\s+/,''))+'</li>');i++}i--;out.push('<ul>'+a.join('')+'</ul>');continue}
  if(/^\s*\d+[.)]\s+/.test(line)){let a=[];while(i<lines.length&&/^\s*\d+[.)]\s+/.test(lines[i])){a.push('<li>'+inline(lines[i].replace(/^\s*\d+[.)]\s+/,''))+'</li>');i++}i--;out.push('<ol>'+a.join('')+'</ol>');continue}
  if(!line.trim()){out.push('<br>');continue}out.push('<p>'+inline(line)+'</p>');
 }
 if(inCode)out.push('<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>');return out.join('');
}
function Markdown({text=''}){return <div className="markdown" dangerouslySetInnerHTML={{__html:renderMarkdown(text)}}/>}
function parseThinking(s){const tags=[['<think>','</think>'],['<thinking>','</thinking>'],['<|thinking|>','<|end_thinking|>'],['<|begin_of_thought|>','<|end_of_thought|>'],['<|begin_of_thinking|>','<|end_of_thinking|>'],['<｜begin▁of▁thinking｜>','<｜end▁of▁thinking｜>']];let best=-1,o='',c='';for(const[a,b]of tags){const i=s.indexOf(a);if(i>=0&&(best<0||i<best)){best=i;o=a;c=b}}if(best>=0){const st=best+o.length,e=s.indexOf(c,st);if(e>=0)return{thinking:s.slice(st,e).trim(),answer:s.slice(e+c.length).trim(),active:false};return{thinking:s.slice(st).trim(),answer:'',active:true}}for(const[a,b]of tags){const e=s.indexOf(b);if(e>=0)return{thinking:s.slice(0,e).trim(),answer:s.slice(e+b.length).trim(),active:false}}return{thinking:'',answer:s,active:false}}

function Icon({name}){const paths={menu:'M4 7h16M4 12h16M4 17h16',edit:'M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20z',more:'M12 6v.01M12 12v.01M12 18v.01',plus:'M12 5v14M5 12h14',send:'M5 12h13M13 6l6 6-6 6',stop:'M7 7h10v10H7z',back:'M15 18l-6-6 6-6',chat:'M5 5h14v10H8l-3 3V5z',models:'M5 7h14M5 12h14M5 17h14',settings:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M15.5 12a3.5 3.5 0 1 1-7 0',log:'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4',upload:'M12 16V5M8 9l4-4 4 4',close:'M6 6l12 12M18 6L6 18',spark:'M12 3l1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z'};return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.spark}/></svg>}

const MessageRow=memo(function MessageRow({message,streaming=false,flash=''}){const base=flash&&message.content.endsWith(flash)?message.content.slice(0,-flash.length):message.content;return <article className={'message-row '+(message.role==='user'?'user':'assistant')}><div className="message-role">{message.role==='user'?'You':'Assistant'}</div><div className="message-content"><Markdown text={base}/>{streaming&&flash&&<span className="generation-flash" aria-hidden="true">{flash}</span>}</div></article>});

function App(){
 const seedRef=useRef(null);if(!seedRef.current){const saved=readJSON('pp_chats',[]);seedRef.current=saved.length?saved: [makeChat()]}
 const [chats,setChats]=useState(seedRef.current),[chatId,setChatId]=useState(seedRef.current[0].id);
 const [model,setModel]=useState(localStorage.getItem('pp_model')||'');
 const [engineCfg,setEngineCfg]=useState(()=>({...DEFAULT_ENGINE,...readJSON('pp_engine_settings',{})}));
 const [chatCfg,setChatCfg]=useState(()=>({...DEFAULT_CHAT,...readJSON('pp_chat_settings',{})}));
 const [drawer,setDrawer]=useState(false),[screen,setScreen]=useState('chat'),[settingsOpen,setSettingsOpen]=useState(false),[chatSettingsOpen,setChatSettingsOpen]=useState(false),[loading,setLoading]=useState(true),[attachment,setAttachment]=useState(null);
 const [generating,setGenerating]=useState(false),[stream,setStream]=useState({answer:'',thinking:'',thinkingLive:false,stats:'',flash:'',flashKey:0});
 const messagesRef=useRef(null),thinkingRef=useRef(null);
 const [input,setInput]=useState(''),[downloaded,setDownloaded]=useState([]),[downloading,setDownloading]=useState(null);
 const genRef=useRef({count:0,start:0,raw:''}),genLiveRef=useRef(false),chatIdRef=useRef(chatId),streamRef=useRef(stream),rafRef=useRef(null);
 const current=useMemo(()=>chats.find(c=>c.id===chatId)||chats[0],[chats,chatId]);
 useEffect(()=>{chatIdRef.current=chatId},[chatId]);useEffect(()=>{streamRef.current=stream},[stream]);
 useEffect(()=>{
   const el=messagesRef.current;if(!el)return;
   const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<220;
   if(nearBottom||generating)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});
 },[current?.messages?.length,stream.answer,generating,chatId]);
 useEffect(()=>{
   const el=thinkingRef.current;if(!el)return;
   el.scrollTop=el.scrollHeight;
 },[stream.thinking]);
 useEffect(()=>{localStorage.setItem('pp_chats',JSON.stringify(chats));localStorage.setItem('pp_engine_settings',JSON.stringify(engineCfg));localStorage.setItem('pp_chat_settings',JSON.stringify(chatCfg))},[chats,engineCfg,chatCfg]);
 useEffect(()=>{const t=setTimeout(()=>setLoading(false),520);return()=>clearTimeout(t)},[]);
 const patchCurrent=useCallback(fn=>setChats(prev=>prev.map(c=>c.id===chatIdRef.current?fn(c):c)),[]);
 const refreshModels=useCallback(async()=>{try{const r=await Llama.listModels();setDownloaded(r?.models||[])}catch{}},[]);
 useEffect(()=>{if(screen==='models')refreshModels()},[screen,refreshModels]);

 const commitStream=useCallback(()=>{const s=streamRef.current;patchCurrent(c=>{const messages=c.messages.slice();const last=messages[messages.length-1];if(!last)return c;messages[messages.length-1]={...last,content:s.answer,thinking:s.thinking};return{...c,messages}})},[patchCurrent]);
 const scheduleCommit=useCallback(()=>{if(rafRef.current)return;rafRef.current=requestAnimationFrame(()=>{rafRef.current=null;commitStream()})},[commitStream]);

 useEffect(()=>{
   const tokenListener=Llama.addListener('token',ev=>{
     if(!ev?.text)return;const g=genRef.current;g.count++;g.raw+=ev.text;const p=parseThinking(g.raw);
     const elapsed=Math.max(.001,(performance.now()-g.start)/1000);
     const prev=streamRef.current.answer||'';const delta=p.answer.startsWith(prev)?p.answer.slice(prev.length):p.answer;const next={answer:p.answer,thinking:p.thinking,thinkingLive:p.active,flash:delta,stats:g.count+' tokens · '+(g.count/elapsed).toFixed(1)+' tok/s'};
     streamRef.current=next;setStream(next);scheduleCommit();
   });
   const doneListener=Llama.addListener('generationDone',()=>{const g=genRef.current,p=parseThinking(g.raw);const elapsed=Math.max(.001,(performance.now()-g.start)/1000);const next={answer:p.answer,thinking:p.thinking,thinkingLive:false,flash:'',stats:g.count+' tokens · '+(g.count/elapsed).toFixed(1)+' tok/s'};streamRef.current=next;setStream(next);commitStream();setGenerating(false);genLiveRef.current=false});
   return()=>{tokenListener.then(x=>x.remove());doneListener.then(x=>x.remove());if(rafRef.current)cancelAnimationFrame(rafRef.current)}
 },[commitStream,scheduleCommit]);

 async function loadPath(path,name){try{const r=await Llama.loadModel({path,...engineCfg});if(r.ok){const n=name||path.split('/').pop();setModel(n);localStorage.setItem('pp_model',n);localStorage.setItem('pp_model_path',path);setScreen('chat')}}catch(e){console.error(e);alert('Model load error. Export Logs for diagnosis.')}}
 async function pickAndLoad(){try{const p=await Llama.pickModel();if(p?.path)await loadPath(p.path,p.name||p.path.split('/').pop())}catch(e){console.error(e);alert('Could not load the model.')}} 
 async function send(){if(genLiveRef.current)return;const text=input.trim();if(!text)return;if(!model){setScreen('models');return}const title=current.title==='New chat'?text.slice(0,42):current.title;const msgs=[...current.messages,{role:'user',content:text},{role:'assistant',content:'',thinking:''}];setChats(prev=>prev.map(c=>c.id===current.id?{...c,title,messages:msgs}:c));setInput('');const g={count:0,start:performance.now(),raw:''};genRef.current=g;const empty={answer:'',thinking:'',thinkingLive:false,flash:'',stats:'0 tokens · 0.0 tok/s'};streamRef.current=empty;setStream(empty);setGenerating(true);genLiveRef.current=true;try{await Llama.generate({roles:msgs.slice(0,-1).map(x=>x.role),contents:msgs.slice(0,-1).map(x=>x.content),...chatCfg})}catch(e){console.error(e);setGenerating(false);genLiveRef.current=false;commitStream()}}
 async function pickText(){try{const r=await Llama.pickText();if(r?.text){setAttachment({name:r.name||'text.txt',text:r.text});setInput(prev=>prev?'[Arquivo: '+(r.name||'text.txt')+']\n'+r.text:r.text)}}catch(e){console.error(e);alert('Could not read the TXT file.')}}
 function newChat(){const c=makeChat();setChats(p=>[c,...p]);setChatId(c.id);setScreen('chat');setDrawer(false);setInput('');setStream({answer:'',thinking:'',thinkingLive:false,flash:'',stats:''})}
 async function unload(){try{await Llama.unloadModel()}finally{setModel('');localStorage.removeItem('pp_model');localStorage.removeItem('pp_model_path');refreshModels()}}
 async function download(item){if(downloading)return;setDownloading(item.file);try{await Llama.downloadModel({url:item.url,name:item.file});await refreshModels()}catch(e){alert(String(e))}finally{setDownloading(null)}}
 const openSettings=useCallback(()=>{setSettingsOpen(true);setDrawer(false)},[]);

 if(loading)return <Splash/>;

 return <div className="app">
  <div className={'scrim '+(drawer?'open':'')} onClick={()=>setDrawer(false)}/>
  <aside className={'drawer '+(drawer?'open':'')}>
   <div className="brand"><b>VYRA</b><span>Local AI assistant</span></div>
   <nav className="nav">
    <button className={screen==='chat'?'active':''} onClick={()=>{setScreen('chat');setDrawer(false)}}><Icon name="chat"/>Chats</button>
    <button onClick={newChat}><Icon name="plus"/>New chat</button>
    <button className={screen==='models'?'active':''} onClick={()=>{setScreen('models');setDrawer(false)}}><Icon name="models"/>Models</button>
   </nav>
   <div className="saved">CONVERSATIONS</div>
   <div className="chat-list">{chats.map(c=><button key={c.id} className={'chat-row '+(c.id===current.id?'active':'')} onClick={()=>{setChatId(c.id);setScreen('chat');setDrawer(false)}}><strong>{c.title}</strong><small>{c.messages.length} messages</small></button>)}</div>
   <button className="drawer-settings" onClick={openSettings}><Icon name="settings"/><span>Settings</span></button>
  </aside>

  {screen==='models'?<ModelsPage downloaded={downloaded} model={model} downloading={downloading} onBack={()=>setScreen('chat')} onImport={pickAndLoad} onDownload={download} onLoad={loadPath} onUnload={unload}/>:<main className="shell">
   <div className="stars" aria-hidden="true"/>
   <header className="floating-top"><button className="float-btn" onClick={()=>setDrawer(true)} aria-label="Menu"><Icon name="menu"/></button><div className="float-model">{model||'No model loaded'}</div><div className="float-actions"><button className="float-btn" onClick={newChat} aria-label="New chat"><Icon name="edit"/></button><button className="float-btn" onClick={()=>setChatSettingsOpen(true)} aria-label="Chat settings"><Icon name="settings"/></button></div></header>
   <section ref={messagesRef} className="messages">{current.messages.length?<>{current.messages.map((m,i)=>{const last=i===current.messages.length-1;const shown=last&&generating&&m.role==='assistant'?{...m,content:stream.answer}:m;return <MessageRow key={i} message={shown} streaming={last&&generating&&m.role==='assistant'} flash={last&&generating&&m.role==='assistant'?stream.flash:''} flashKey={stream.flashKey}/>})}</>:<div className="empty"><div className="empty-mark"><Icon name="spark"/></div><h1>Local AI, on your phone.</h1><p>Load a GGUF model and chat privately. Thinking, streaming and conversation history stay on-device.</p><button className="load" onClick={()=>setScreen('models')}>Select GGUF model</button></div>}</section>
   <div className="composer-wrap">
    {stream.thinkingLive&&<div className="thinking"><div className="thinking-head"><span className="brain"><Icon name="spark"/></span><span>Thinking...</span><span className="thinking-dots">•••</span></div><div ref={thinkingRef} className="thinking-body">{stream.thinking||' '}</div></div>}
    <div className="composer"><div className="input-row"><button className="icon" onClick={pickText} aria-label="Attach TXT file"><Icon name="plus"/></button><textarea className="input" rows="1" value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,145)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask assistant..."/><button className={'send '+(generating?'stop':'')} onClick={()=>generating?Llama.stop():send()} aria-label={generating?'Stop':'Send'}><Icon name={generating?'stop':'send'}/></button></div><div className="meta stats">{stream.stats}</div></div>
   </div>
  </main>}
  {settingsOpen&&<EngineSettings cfg={engineCfg} onClose={()=>setSettingsOpen(false)} onApply={next=>{setEngineCfg(next);setSettingsOpen(false)}} onLogs={()=>Llama.exportLog()}/>} {chatSettingsOpen&&<ChatSettings cfg={chatCfg} onClose={()=>setChatSettingsOpen(false)} onApply={next=>{setChatCfg(next);setChatSettingsOpen(false)}}/>}
 </div>
}

function Splash(){return <div className="splash"><div className="splash-mark"><span className="splash-logo" aria-hidden="true"/></div><div className="splash-name">VYRA</div><div className="splash-line"><span/></div></div>}

function ModelsPage({downloaded,model,downloading,onBack,onImport,onDownload,onLoad,onUnload}){return <div className="models-page"><div className="models-head"><button className="float-btn" onClick={onBack}><Icon name="back"/></button><div><b>Models</b><small>Download, import and manage GGUF files</small></div></div><div className="import-box"><button className="import-model" onClick={onImport}><Icon name="upload"/>Import GGUF</button><small>Choose a .gguf file from your device</small></div><section><h3>Models to download</h3><div className="model-list">{CATALOG.map(x=><div className="model-card" key={x.file}><div className="model-info"><b>{x.name}</b><small>{x.size}</small></div><button className="model-btn" disabled={!!downloading} onClick={()=>onDownload(x)}>{downloading===x.file?'Downloading...':'Download'}</button></div>)}</div></section><div className="section-line"/><section><h3>Downloaded models</h3><div className="model-list">{downloaded.length?downloaded.map(x=>{const size=CATALOG.find(c=>c.file===x.name)?.size||fmtBytes(x.bytes);return <div className="model-card" key={x.path}><div className="model-info"><b>{x.name}</b><small>{size}</small></div>{x.name===model?<button className="model-btn active-model" onClick={onUnload}>Loaded · Unload</button>:<button className="model-btn" onClick={()=>onLoad(x.path,x.name)}>Load</button>}</div>}):<div className="no-models">No downloaded models yet.</div>}</div></section></div>}

function Toggle({value,onChange,label}){return <button type="button" className={'toggle '+(value?'on':'')} onClick={()=>onChange(!value)} aria-label={label}><span/></button>}
function Range({value,min,max,step,onChange,suffix=''}){return <div className="range-wrap"><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/><output>{value}{suffix}</output></div>}

function ChatSettings({cfg,onClose,onApply}){
 const [v,setV]=useState({...cfg});
 return <div className="settings-page"><header className="settings-head"><button className="float-btn" onClick={onClose}><Icon name="back"/></button><div><b>Chat settings</b><small>How the model responds</small></div></header>
 <div className="settings-content"><section className="settings-section"><h3>Generation</h3>
  <div className="slider-field"><label>Temperature <b>{v.temperature.toFixed(2)}</b></label><Range value={v.temperature} min={0} max={2} step={.05} onChange={x=>setV({...v,temperature:x})}/></div>
  <div className="slider-field"><label>Top P <b>{v.topP.toFixed(2)}</b></label><Range value={v.topP} min={0} max={1} step={.01} onChange={x=>setV({...v,topP:x})}/></div>
  <div className="slider-field"><label>Min P <b>{v.minP.toFixed(2)}</b></label><Range value={v.minP} min={0} max={1} step={.01} onChange={x=>setV({...v,minP:x})}/></div>
  <div className="slider-field"><label>Top K <b>{v.topK}</b></label><Range value={v.topK} min={0} max={100} step={1} onChange={x=>setV({...v,topK:x})}/></div>
  <div className="slider-field"><label>Max output <b>{v.maxTokens}</b></label><Range value={v.maxTokens} min={64} max={4096} step={64} onChange={x=>setV({...v,maxTokens:x})}/></div>
  <div className="slider-field"><label>Repetition penalty <b>{v.repeatPenalty.toFixed(2)}</b></label><Range value={v.repeatPenalty} min={1} max={1.5} step={.01} onChange={x=>setV({...v,repeatPenalty:x})}/></div>
  <div className="slider-field"><label>Repeat window <b>{v.repeatLastN}</b></label><Range value={v.repeatLastN} min={0} max={256} step={8} onChange={x=>setV({...v,repeatLastN:x})}/></div>
  <div className="field"><label>System prompt</label><textarea rows="5" value={v.systemPrompt} onChange={e=>setV({...v,systemPrompt:e.target.value})} placeholder="Optional instructions for every chat"/></div>
  <div className="setting-row"><span><b>Thinking / reasoning</b><small>Allow supported models to use a thinking section</small></span><Toggle value={!!v.enableThinking} onChange={x=>setV({...v,enableThinking:x})} label="Thinking"/></div>
  <div className="setting-row"><span><b>Jinja chat template</b><small>Use the model's chat template when available</small></span><Toggle value={!!v.useJinja} onChange={x=>setV({...v,useJinja:x})} label="Jinja"/></div>
 </section></div>
 <footer className="settings-footer"><button onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onApply(v)}>Apply changes</button></footer></div>
}

function EngineSettings({cfg,onClose,onApply,onLogs}){
 const [v,setV]=useState({...cfg});
 return <div className="settings-page"><header className="settings-head"><button className="float-btn" onClick={onClose}><Icon name="back"/></button><div><b>Settings</b><small>Engine, memory and CPU</small></div></header>
 <div className="settings-content">
  <section className="settings-section"><h3>Engine</h3>
   <div className="slider-field"><label>Context / KV cache <b>{v.context}</b></label><Range value={v.context} min={512} max={8192} step={512} onChange={x=>setV({...v,context:x})}/></div>
   <div className="slider-field"><label>Generation cores <b>{v.threads}</b></label><Range value={v.threads} min={1} max={8} step={1} onChange={x=>setV({...v,threads:x})}/></div>
   <div className="slider-field"><label>Prompt cores <b>{v.batchThreads}</b></label><Range value={v.batchThreads} min={1} max={8} step={1} onChange={x=>setV({...v,batchThreads:x})}/></div>
   <div className="slider-field"><label>Batch size <b>{v.batch}</b></label><Range value={v.batch} min={32} max={512} step={32} onChange={x=>setV({...v,batch:x})}/></div>
   <div className="setting-row"><span><b>Flash Attention</b><small>Use the optimized attention path</small></span><Toggle value={!!v.flashAttention} onChange={x=>setV({...v,flashAttention:x})} label="Flash Attention"/></div>
   <div className="setting-row"><span><b>Memory map (mmap)</b><small>Map model pages instead of copying them</small></span><Toggle value={!!v.mmap} onChange={x=>setV({...v,mmap:x})} label="Memory map"/></div>
   <div className="setting-row"><span><b>Lock model in RAM</b><small>Keep mapped model pages resident when possible</small></span><Toggle value={!!v.mlock} onChange={x=>setV({...v,mlock:x})} label="Lock RAM"/></div>
   <div className="setting-row"><span><b>Offload KQV</b><small>Allow K/Q/V work to use the backend when available</small></span><Toggle value={!!v.offloadKQV} onChange={x=>setV({...v,offloadKQV:x})} label="Offload KQV"/></div>
  </section>
  <section className="settings-section diagnostics"><h3>Diagnostics</h3><button className="log-button" onClick={onLogs}><Icon name="log"/><span><b>Export diagnostic logs</b><small>Save a log file for troubleshooting</small></span></button></section>
 </div>
 <footer className="settings-footer"><button onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onApply(v)}>Apply changes</button></footer></div>
}
createRoot(document.getElementById('app')).render(<App/>);
