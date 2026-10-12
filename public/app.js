(function(){
'use strict';
const chat=document.querySelector('#chat');
const form=document.querySelector('#form');
const input=document.querySelector('#input');
const statusEl=document.querySelector('#status');
const providerEl=document.querySelector('#provider');
const footer=document.querySelector('#footer');
const sideStatus=document.querySelector('#sideStatus');
const send=document.querySelector('#send');
const charCount=document.querySelector('#charCount');
const historyNav=document.querySelector('#chatHistory');
const newChatButton=document.querySelector('#newChat');
const signOutButton=document.querySelector('#signOut');
const agentSelect=document.querySelector('#agentSelect');
const agentHint=document.querySelector('#agentHint');
const plusButton=document.querySelector('#plusButton');
const plusMenu=document.querySelector('#plusMenu');
const qualityModeButton=document.querySelector('#qualityMode');
const micButton=document.querySelector('#micButton');
const openSettingsButton=document.querySelector('#openSettings');
const openSettingsFromMenu=document.querySelector('#openSettingsFromMenu');
const settingsModal=document.querySelector('#settingsModal');
const modalScrim=document.querySelector('#modalScrim');
const closeSettingsButton=document.querySelector('#closeSettings');
const skillsTab=document.querySelector('#skillsTab');
const builderTab=document.querySelector('#builderTab');
const connectorsTab=document.querySelector('#connectorsTab');
const skillsPanel=document.querySelector('#skillsPanel');
const builderPanel=document.querySelector('#builderPanel');
const connectorsPanel=document.querySelector('#connectorsPanel');
const openBuilderFromMenu=document.querySelector('#openBuilderFromMenu');
const builderForm=document.querySelector('#builderForm');
const builderName=document.querySelector('#builderName');
const builderDescription=document.querySelector('#builderDescription');
const generateAppButton=document.querySelector('#generateApp');
const builderStatus=document.querySelector('#builderStatus');
const buildList=document.querySelector('#buildList');
const renderOwnerSelect=document.querySelector('#renderOwnerSelect');
const refreshRenderOwnersButton=document.querySelector('#refreshRenderOwners');
const skillForm=document.querySelector('#skillForm');
const skillName=document.querySelector('#skillName');
const skillDescription=document.querySelector('#skillDescription');
const skillInstructions=document.querySelector('#skillInstructions');
const skillList=document.querySelector('#skillList');
const knowledgeFile=document.querySelector('#knowledgeFile');
const knowledgeList=document.querySelector('#knowledgeList');
const connectorList=document.querySelector('#connectorList');
const attachImageButton=document.querySelector('#attachImage');
const attachFileButton=document.querySelector('#attachFile');
const imageFiles=document.querySelector('#imageFiles');
const documentFiles=document.querySelector('#documentFiles');
const attachmentTray=document.querySelector('#attachmentTray');
const attachments=[];
const MAX_FILE_BYTES=5*1024*1024;
let history=[];
let messages=[];
let chats=[];
let currentId=null;
let busy=false;
let saveWarning=false;
let deepMode=false;
let recognition=null;
let currentSettingsTab="skills";
let activeController=null;
function setStatus(value){statusEl.textContent=value;sideStatus.textContent=value}
function login(){location.replace('/login?next='+encodeURIComponent('/'))}
function addMessage(text,who,meta){
  const d=document.createElement('article');d.className='msg '+who;
  const head=document.createElement('strong');head.textContent=who==='user'?'You':'Nexora';d.appendChild(head);
  if(meta){const small=document.createElement('small');small.textContent=meta;d.appendChild(small)}
  const p=document.createElement('p');p.textContent=String(text||'');d.appendChild(p);
  chat.appendChild(d);chat.scrollTop=chat.scrollHeight;
  messages.push({text:String(text||''),who:who,meta:meta||''});
  return d;
}
function renderMessages(items){
  chat.replaceChildren();messages=[];
  if(!items.length){showWelcome();return}
  let lastUserPrompt='';
  items.forEach(m=>{
    const d=document.createElement('article');d.className='msg '+m.who;
    const h=document.createElement('strong');h.textContent=m.who==='user'?'You':'Nexora';d.appendChild(h);
    if(m.meta){const s=document.createElement('small');s.textContent=m.meta;d.appendChild(s)}
    const p=document.createElement('p');p.textContent=m.text||'';d.appendChild(p);chat.appendChild(d);
    messages.push({text:m.text||'',who:m.who,meta:m.meta||''});
    if(m.who==='user')lastUserPrompt=m.text||'';
    else if(m.who==='bot'&&m.text){
      addResponseActions(d,m.text,lastUserPrompt);
      const buildMatch=String(m.meta||'').match(/build-id:(\d+)/);
      if(buildMatch)jsonRequest('/api/builds?id='+encodeURIComponent(buildMatch[1])).then(j=>addAppDraftActions(d,j.build)).catch(()=>{});
    }
  });
  chat.scrollTop=chat.scrollHeight;
}
function showWelcome(){
  chat.replaceChildren();const wrap=document.createElement('div');wrap.className='welcome';
  const icon=document.createElement('div');icon.className='welcome-icon';icon.textContent='✦';
  const h=document.createElement('h2');h.textContent='How can I help?';
  const p=document.createElement('p');p.textContent='Describe the task in your own words. Nexora will choose a specialist automatically.';
  const suggestions=document.createElement('div');suggestions.className='suggestions';
  ['Review a Python bug','Plan a secure IT setup','Draft a marketing campaign'].forEach(t=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.addEventListener('click',()=>{input.value=t;updateCount();input.focus()});suggestions.appendChild(b)});
  wrap.append(icon,h,p,suggestions);chat.appendChild(wrap);
}
function renderChatList(){
  historyNav.replaceChildren();
  chats.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).forEach(c=>{
    const row=document.createElement('div');row.className='history-row';
    const b=document.createElement('button');b.type='button';b.className='history-item'+(String(c.id)===String(currentId)?' active':'');b.textContent=c.title||'Untitled chat';b.title=c.title||'Untitled chat';
    b.addEventListener('click',()=>{if(busy)return;currentId=c.id;history=Array.isArray(c.history)?c.history:[];renderMessages(Array.isArray(c.messages)?c.messages:[]);renderChatList()});
    const del=document.createElement('button');del.type='button';del.className='history-delete';del.textContent='×';del.title='Delete chat';del.setAttribute('aria-label','Delete chat');
    del.addEventListener('click',async e=>{e.stopPropagation();if(busy)return;del.disabled=true;try{const r=await fetch('/api/conversations?id='+encodeURIComponent(c.id),{method:'DELETE',credentials:'same-origin'});if(r.status===401){login();return}const j=await r.json();if(!r.ok||!j.ok)throw new Error('Delete failed');chats=chats.filter(x=>String(x.id)!==String(c.id));if(String(currentId)===String(c.id)){currentId=null;history=[];messages=[];showWelcome()}renderChatList()}catch(err){setStatus('Delete failed')}finally{del.disabled=false}});
    row.append(b,del);historyNav.appendChild(row);
  });
}
async function persistChat(){
  if(!messages.length)return true;
  const first=messages.find(m=>m.who==='user');
  const payload={title:(first?first.text:'New chat').slice(0,60),messages:messages.slice(-80),history:history.slice(-10)};
  if(currentId!==null)payload.id=currentId;
  try{
    const r=await fetch('/api/conversations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    if(r.status===401){login();return false}
    const j=await r.json();
    if(!r.ok||!j.ok||!j.conversation)throw new Error(j.message||'Save failed');
    const c=j.conversation;currentId=c.id;
    const item={id:c.id,title:c.title,messages:Array.isArray(c.messages)?c.messages:messages,history:Array.isArray(c.history)?c.history:history,updatedAt:c.updated_at?new Date(c.updated_at).getTime():Date.now()};
    const idx=chats.findIndex(x=>String(x.id)===String(item.id));
    if(idx>=0)chats[idx]=item;else chats.push(item);
    chats=chats.slice(-30);renderChatList();saveWarning=false;return true;
  }catch(e){saveWarning=true;setStatus('History save failed');return false}
}
async function loadConversations(){
  const r=await fetch('/api/conversations',{credentials:'same-origin'});
  if(r.status===401){login();return}
  const j=await r.json();
  if(!r.ok||!j.ok)throw new Error('Conversation history unavailable');
  chats=(j.conversations||[]).map(c=>({id:c.id,title:c.title,messages:Array.isArray(c.messages)?c.messages:[],history:Array.isArray(c.history)?c.history:[],updatedAt:c.updated_at?new Date(c.updated_at).getTime():0}));
  renderChatList();showWelcome();
}
async function loadAgents(){
  const r=await fetch('/api/agents?limit=100',{credentials:'same-origin'});
  if(r.status===401){login();return}
  const j=await r.json();if(!r.ok||!Array.isArray(j.agents))throw new Error('Specialist list unavailable');
  agentSelect.replaceChildren();
  const auto=document.createElement('option');auto.value='';auto.textContent='Auto-select best specialist';agentSelect.appendChild(auto);
  const groups=new Map();
  (j.agents||[]).forEach(a=>{if(!groups.has(a.division)){const g=document.createElement('optgroup');g.label=a.division;groups.set(a.division,g);agentSelect.appendChild(g)}const o=document.createElement('option');o.value=a.path;o.textContent=a.name;groups.get(a.division).appendChild(o)});
  agentHint.textContent=(j.agents||[]).length+' specialists available across '+groups.size+' divisions.';
}
async function loadStatus(){
  const r=await fetch('/api/status',{credentials:'same-origin'});
  if(r.status===401){login();return}
  const j=await r.json();if(!r.ok||!j.ok)throw new Error('Status unavailable');
  const list=j.providers?.configured||[];const configured=list.filter(x=>x.configured);
  providerEl.textContent=configured.length?'Free providers configured: '+configured.map(x=>x.label).join(' · '):'No free AI provider configured';
  providerEl.className=configured.length?'ok':'warn';
  footer.textContent=(j.agents_total||0)+' specialists · '+(j.divisions?.length||0)+' divisions · '+(j.usage?.remaining??40)+' free requests left today';
  setStatus(configured.length?'Ready':'Setup needed');
}
function updateCount(){charCount.textContent=input.value.length+' / 8000'}
function xmlEscape(value){
  return String(value||'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function inlineWordRuns(line){
  const parts=String(line||'').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  if(!parts.length)return '<w:r><w:t></w:t></w:r>';
  return parts.map(part=>{
    let text=part,bold=false,italic=false;
    if(part.startsWith('**')&&part.endsWith('**')){text=part.slice(2,-2);bold=true}
    else if(part.startsWith('*')&&part.endsWith('*')){text=part.slice(1,-1);italic=true}
    const rpr=(bold||italic)?'<w:rPr>'+(bold?'<w:b/>':'')+(italic?'<w:i/>':'')+'</w:rPr>':'';
    return '<w:r>'+rpr+'<w:t xml:space="preserve">'+xmlEscape(text)+'</w:t></w:r>';
  }).join('');
}
function markdownParagraphs(content){
  const paragraphs=[];
  for(const raw of String(content||'').replace(/\r/g,'').split('\n')){
    const line=raw.trimEnd();if(!line.trim()){paragraphs.push('<w:p/>');continue}
    const h=line.match(/^(#{1,3})\s+(.+)$/);
    if(h){paragraphs.push('<w:p><w:pPr><w:pStyle w:val="Heading'+h[1].length+'"/></w:pPr>'+inlineWordRuns(h[2])+'</w:p>');continue}
    const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
    if(bullet){paragraphs.push('<w:p><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr>'+inlineWordRuns('• '+bullet[1])+'</w:p>');continue}
    const ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(ordered){paragraphs.push('<w:p><w:pPr><w:ind w:left="360"/></w:pPr>'+inlineWordRuns(ordered[0].trim())+'</w:p>');continue}
    paragraphs.push('<w:p>'+inlineWordRuns(line.replace(/^>\s?/,'').replace(/\x60/g,''))+'</w:p>');
  }
  return paragraphs.join('');
}
async function buildDocxBlob(title,content){
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','JSZip');
  const zip=new window.JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style></w:styles>');
  const body='<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>'+inlineWordRuns(title)+'</w:p>'+markdownParagraphs(content)+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>');
  return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
function safeFilename(value){
  const base=String(value||'Nexora-Answer').normalize('NFKD').replace(/[^a-zA-Z0-9 _-]/g,'').trim().replace(/\s+/g,'-').slice(0,70);
  return (base||'Nexora-Answer')+'.docx';
}
function requestedWordFile(prompt){
  return /\b(word file|word document|docx|microsoft word|make (?:me )?(?:a )?word|create (?:me )?(?:a )?word|export to word|download as word)\b|\bword file bana|\bword mein bana|\bword me bana|\bword format me\b/i.test(String(prompt||''));
}
function requestedAppBuild(prompt){
  const s=String(prompt||"").toLowerCase();
  return /\b(build|create|make|generate|develop|scaffold)\b[\s\S]{0,90}\b(app|application|website|web app|site|dashboard|tool)\b/i.test(s)
    || /\b(app|application|website|web app|site|dashboard)\b[\s\S]{0,60}\b(bana|banao|banado|bana do|create|build|generate|develop)\b/i.test(s)
    || /\bapp bana do\b|\bwebsite bana do\b|\bapplication bana do\b/i.test(s);
}
function appNameFromPrompt(prompt){
  const s=String(prompt||"");
  const named=s.match(/\b(?:named|called)\s+([A-Za-z0-9][A-Za-z0-9 -]{1,40})/i);
  if(named)return named[1].split(/\b(with|that|which|for|to|and|including)\b/i)[0].trim().slice(0,55)||"Nexora App";
  const match=s.match(/\b(?:a|an|my|our)\s+([A-Za-z0-9][A-Za-z0-9 -]{2,42}?)\s+(?:app|application|website|dashboard|tool)\b/i);
  if(match&&!/^(simple|new|web|mobile|basic|modern|beautiful)$/i.test(match[1].trim()))return match[1].trim().slice(0,55);
  return "Nexora App";
}
function addAppDraftActions(messageNode,build){
  if(messageNode.querySelector('.app-draft-actions'))return;
  const row=document.createElement("div");row.className="response-actions app-draft-actions";
  const download=document.createElement("button");download.type="button";download.className="response-action";download.textContent="Download project ZIP";download.addEventListener("click",()=>downloadBuild(build.id));row.appendChild(download);
  const open=document.createElement("button");open.type="button";open.className="response-action";open.textContent="Review app / publish";open.addEventListener("click",()=>openSettings("builder"));row.appendChild(open);
  if(build.github_url){const repo=document.createElement("a");repo.className="response-action";repo.href=build.github_url;repo.target="_blank";repo.rel="noopener";repo.textContent="Open GitHub ↗";row.appendChild(repo)}
  if(!build.github_url||["draft","push_partial","pushing"].includes(build.status)){
    const push=document.createElement("button");push.type="button";push.className="response-action";push.textContent=build.github_url?"Retry GitHub push":"Approve & push to GitHub";push.addEventListener("click",()=>pushBuildToGitHub({id:build.id,name:build.name,description:build.description,status:build.status||"draft",file_count:build.file_count||(Array.isArray(build.files)?build.files.length:0),github_url:build.github_url||null}));row.appendChild(push);
  }
  messageNode.appendChild(row);
}
function titleFromPrompt(prompt,reply){
  let s=String(prompt||'').replace(/\b(please|kindly|make|create|prepare|generate|download|export|a|the|me|this|above|answer|response|content|as|in|to|word|file|document|docx|bana do|bana|kar do|mein|me|of|from)\b/ig,' ').replace(/[^a-zA-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(s.length<4||s.length>70)s=String(reply||'').split('\n').find(x=>x.trim())?.replace(/^#+\s*/,'').replace(/[*#]/g,'').trim().slice(0,65)||'Nexora Answer';
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function addResponseActions(messageNode,reply,prompt){
  const row=document.createElement('div');row.className='response-actions';
  const word=document.createElement('button');word.type='button';word.className='response-action';word.textContent=requestedWordFile(prompt)?'Preparing Word file…':'Export Word (.docx)';
  word.disabled=requestedWordFile(prompt);
  let blobUrl=null;
  const prepare=async()=>{
    word.disabled=true;word.textContent='Preparing Word file…';
    try{
      const blob=await buildDocxBlob(titleFromPrompt(prompt,reply),reply);
      if(blobUrl)URL.revokeObjectURL(blobUrl);
      blobUrl=URL.createObjectURL(blob);
      const link=document.createElement('a');link.className='response-action download-action';link.href=blobUrl;link.download=safeFilename(titleFromPrompt(prompt,reply));link.textContent='Download Word (.docx)';link.title='Download editable Microsoft Word document';
      word.replaceWith(link);
    }catch(e){word.disabled=false;word.textContent='Retry Word export';setStatus('Word export unavailable')}
  };
  word.addEventListener('click',prepare);row.appendChild(word);messageNode.appendChild(row);
  if(requestedWordFile(prompt))prepare();
}
function renderAttachments(){
  attachmentTray.replaceChildren();
  attachments.forEach((a,index)=>{
    const card=document.createElement('div');card.className='attachment-chip';
    if(a.dataUrl){const img=document.createElement('img');img.src=a.dataUrl;img.alt=a.name;card.appendChild(img)}
    else{const icon=document.createElement('span');icon.className='attachment-file-icon';icon.textContent=a.type==='application/pdf'?'PDF':a.type.includes('wordprocessingml')?'DOCX':'FILE';card.appendChild(icon)}
    const info=document.createElement('span');info.className='attachment-name';info.textContent=a.name;info.title=a.name;card.appendChild(info);
    const remove=document.createElement('button');remove.type='button';remove.className='attachment-remove';remove.textContent='×';remove.title='Remove '+a.name;remove.setAttribute('aria-label','Remove '+a.name);remove.addEventListener('click',()=>{attachments.splice(index,1);renderAttachments()});card.appendChild(remove);attachmentTray.appendChild(card);
  });
  attachImageButton.disabled=busy||attachments.length>=4;
  attachFileButton.disabled=busy||attachments.length>=4;
}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read file'));reader.readAsDataURL(file)})}
function readAsText(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read file'));reader.readAsText(file)})}
function loadScript(src,globalName){
  return new Promise((resolve,reject)=>{
    if(window[globalName])return resolve(window[globalName]);
    const s=document.createElement('script');s.src=src;s.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error('Document reader unavailable'));s.onerror=()=>reject(new Error('Could not load document reader'));document.head.appendChild(s);
  });
}
async function extractDocument(file){
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[];
    for(let n=1;n<=Math.min(pdf.numPages,40);n++){const page=await pdf.getPage(n);const content=await page.getTextContent();pages.push(content.items.map(x=>x.str||'').join(' '))}
    return pages.join('\n').slice(0,60000);
  }
  if(file.name.toLowerCase().endsWith('.docx')){
    const mammoth=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.9.0/mammoth.browser.min.js','mammoth');
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return String(result.value||'').slice(0,60000);
  }
  return readAsText(file);
}
async function addSelectedFiles(fileList,imagesOnly){
  const chosen=Array.from(fileList||[]);
  for(const file of chosen){
    if(attachments.length>=4){setStatus('Maximum 4 attachments');break}
    if(file.size>MAX_FILE_BYTES){setStatus(file.name+' exceeds 5 MB');continue}
    const totalBytes=attachments.reduce((sum,a)=>sum+(a.size||0),0);
    if(totalBytes+file.size>8*1024*1024){setStatus('Total attachments must stay under 8 MB');continue}
    const isImage=file.type.startsWith('image/');
    if(imagesOnly&&!isImage){setStatus('Please choose an image file');continue}
    if(!isImage&&!/\.(txt|md|csv|json|log|html|xml|yaml|yml|py|js|ts|css|sql|sh|pdf|docx)$/i.test(file.name)){setStatus('Unsupported file type: '+file.name);continue}
    if(attachments.some(a=>a.name===file.name&&a.size===file.size)){continue}
    try{
      if(isImage){attachments.push({name:file.name,type:file.type,size:file.size,dataUrl:await readAsDataURL(file)})}
      else{const textContent=await extractDocument(file);if(!textContent.trim()){setStatus(file.name+' has no extractable text');continue}attachments.push({name:file.name,type:file.type||'text/plain',size:file.size,text:textContent})}
    }catch(e){setStatus('Could not read '+file.name+': '+e.message)}
  }
  renderAttachments();if(attachments.length)setStatus(attachments.length+' attachment(s) ready');
}
imageFiles.addEventListener('change',async()=>{await addSelectedFiles(imageFiles.files,true);imageFiles.value=''});
documentFiles.addEventListener('change',async()=>{await addSelectedFiles(documentFiles.files,false);documentFiles.value=''});
function showTyping(){
  const d=document.createElement('article');d.id='typing';d.className='msg bot typing';
  const h=document.createElement('strong');h.textContent='Nexora';const p=document.createElement('p');p.textContent='Selecting specialist and working…';d.append(h,p);chat.appendChild(d);chat.scrollTop=chat.scrollHeight;
}
function removeTyping(){document.querySelector('#typing')?.remove()}
async function boot(){
  try{
    if(!window.hatchable||!window.hatchable.auth)throw new Error('Sign-in client unavailable');
    const session=await window.hatchable.auth.getSession();
    if(!session||!session.user){login();return}
  }catch(e){login();return}
  try{await loadConversations()}catch(e){setStatus('History unavailable');addMessage('Chat history could not be loaded. You can still try a new chat; saving may be unavailable.','bot','Storage warning')}
  try{await loadAgents()}catch(e){agentHint.textContent='Specialist list could not load. Refresh the page to retry.'}
  try{await loadStatus()}catch(e){providerEl.textContent='Provider status unavailable';providerEl.className='warn';setStatus('Check connection')}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy&&activeController){activeController.abort();setStatus('Stopping response…');return}
  const task=input.value.trim();if(!task||busy)return;
  if(task.length>8000){addMessage('Please shorten the task to 8,000 characters or less.','bot','Input limit');return}
  busy=true;saveWarning=false;send.disabled=false;send.textContent='■';send.setAttribute('aria-label','Stop response');input.disabled=true;agentSelect.disabled=true;attachImageButton.disabled=true;attachFileButton.disabled=true;setStatus(deepMode?'Thinking carefully…':'Working…');
  const attachedSnapshot=attachments.map(a=>({...a}));
  const attachmentNames=attachedSnapshot.length?'\n\nAttachments: '+attachedSnapshot.map(a=>a.name).join(', '):'';
  addMessage(task+attachmentNames,'user');input.value='';updateCount();await persistChat();showTyping();
  try{
    if(requestedAppBuild(task)){
      let created;
      try{
        const result=await jsonRequest('/api/builds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',name:appNameFromPrompt(task),description:task,attachments:attachedSnapshot.map(a=>({name:a.name,type:a.type,dataUrl:a.dataUrl||undefined,text:a.text||undefined}))})});
        created=result.build;
      }catch(buildError){
        removeTyping();
        const fail='I could not generate the app draft: '+buildError.message+'. No repository was created and nothing was deployed. Open Build Apps to retry or refine the brief.';
        const failureNode=addMessage(fail,'bot','App Builder · draft not created');
        addResponseActions(failureNode,fail,'');
        history.push({role:'user',content:task},{role:'assistant',content:fail});history=history.slice(-10);await persistChat();
        return;
      }
      removeTyping();
      const replyText='I created a web-app draft named "'+created.name+'" with '+((created.files||[]).length)+' files. The HTML/CSS/JavaScript paths passed basic static checks. It is a front-end static web app; browser testing and the hosting build have not yet run. Nothing has been pushed or published yet.';
      const botNode=addMessage(replyText,'bot','App Builder · '+(created.status||'draft')+' · '+(created.stack||'static site')+' · build-id:'+created.id);
      addResponseActions(botNode,replyText,'');
      addAppDraftActions(botNode,created);
      history.push({role:'user',content:task},{role:'assistant',content:replyText});history=history.slice(-10);
      await persistChat();attachments.splice(0,attachedSnapshot.length);renderAttachments();
      builderStatus.textContent='Draft generated from chat: '+created.name;
      return;
    }
    const body={message:task,history:history.slice(-6),quality_mode:deepMode?'think':'standard',attachments:attachedSnapshot.map(a=>({name:a.name,type:a.type,dataUrl:a.dataUrl||undefined,text:a.text||undefined}))};
    if(agentSelect.value)body.agent_path=agentSelect.value;
    activeController=new AbortController();
    const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:activeController.signal});
    const j=await r.json();removeTyping();
    if(r.status===401){login();return}
    if(!r.ok){addMessage(j.message||'Request failed. Please try again.','bot','Request issue');history.push({role:'user',content:task});await persistChat();return}
    const team=(j.agents||[]).map(a=>a.name).join(' + ');
    const skillMeta=Array.isArray(j.active_skills)&&j.active_skills.length?' · Skills: '+j.active_skills.join(', '):' · Skills: none matched';
    const tokenMeta=j.usage&&Number.isFinite(Number(j.usage.total_tokens))?' · Tokens: '+j.usage.total_tokens:' · Tokens: provider did not report';
    const meta='Specialist: '+(team||'auto-selected')+' · Provider: '+(j.provider||'free')+' · Model: '+(j.model||'unknown')+' · Mode: '+(j.execution_mode||'standard')+skillMeta+tokenMeta+' · External actions: none';
    const replyText=j.reply||'No response returned. Please retry.';
    const botNode=addMessage(replyText,'bot',meta);
    addResponseActions(botNode,replyText,task);
    if(Array.isArray(j.knowledge_sources)&&j.knowledge_sources.length){
      const source=document.createElement('small');source.className='knowledge-source-note';source.textContent='Knowledge used: '+j.knowledge_sources.join(', ');botNode.appendChild(source);
    }
    history.push({role:'user',content:task},{role:'assistant',content:replyText});history=history.slice(-10);
    await persistChat();
    attachments.splice(0,attachedSnapshot.length);renderAttachments();
  }catch(err){
    removeTyping();
    if(err&&err.name==='AbortError'){addMessage('Stopped waiting for this response.','bot','Stopped')}
    else{addMessage('Connection problem. Please retry in a moment.','bot','Temporary error');history.push({role:'user',content:task});await persistChat()}
  }
  finally{activeController=null;busy=false;send.disabled=false;send.textContent='↑';send.setAttribute('aria-label','Send message');input.disabled=false;agentSelect.disabled=false;renderAttachments();input.focus();setStatus(saveWarning?'History save failed':'Ready')}
});
input.addEventListener('input',updateCount);
newChatButton.addEventListener('click',()=>{if(busy)return;currentId=null;history=[];messages=[];showWelcome();renderChatList();input.focus()});
signOutButton.addEventListener('click',async()=>{signOutButton.disabled=true;try{await window.hatchable.auth.signOut()}finally{location.replace('/login')}});
function setSettingsTab(tab){
  currentSettingsTab=tab;
  const skillsOn=tab==='skills',builderOn=tab==='builder',connectorsOn=tab==='connectors';
  skillsTab.classList.toggle('active',skillsOn);builderTab.classList.toggle('active',builderOn);connectorsTab.classList.toggle('active',connectorsOn);
  skillsPanel.hidden=!skillsOn;builderPanel.hidden=!builderOn;connectorsPanel.hidden=!connectorsOn;
  if(skillsOn){loadSkills();loadKnowledge()}else if(builderOn){loadBuilds();loadRenderOwners()}else loadConnectors();
}
function openSettings(tab){
  settingsModal.hidden=false;document.body.classList.add('modal-open');setSettingsTab(tab||currentSettingsTab);
  if(plusMenu){plusMenu.hidden=true;plusButton.setAttribute('aria-expanded','false')}
}
function closeSettings(){settingsModal.hidden=true;document.body.classList.remove('modal-open')}
async function jsonRequest(url,options){
  const r=await fetch(url,{credentials:'same-origin',...options});
  if(r.status===401){login();throw new Error('Please sign in again')}
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw new Error(j.message||j.error||'Request failed');
  return j;
}
document.querySelector('#importAgentSkills')?.addEventListener('click',async()=>{
  const button=document.querySelector('#importAgentSkills');button.disabled=true;button.textContent='Importing…';
  try{const j=await jsonRequest('/api/skills-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});await loadSkills();setStatus('Imported '+j.imported+' skills ('+j.skipped+' already present)');alert('Agent-skill import complete. Imported: '+j.imported+'; already present: '+j.skipped+'.\n\nSkills are enabled and Nexora will choose relevant ones per task.');}
  catch(e){setStatus('Skill import failed');alert('Skill import failed: '+e.message)}
  finally{button.disabled=false;button.textContent='Import Agent-skill from GitHub'}
});
async function loadSkills(){
  skillList.replaceChildren();const loading=document.createElement('p');loading.className='empty-state';loading.textContent='Loading skills…';skillList.appendChild(loading);
  try{
    const j=await jsonRequest('/api/skills');
    skillList.replaceChildren();
    if(!j.skills.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No custom skills yet. Save one above to give Nexora your preferred process and output style.';skillList.appendChild(p);return}
    j.skills.forEach(s=>{
      const card=document.createElement('article');card.className='setting-card';
      const top=document.createElement('div');top.className='setting-card-top';
      const label=document.createElement('label');label.className='toggle-label';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!s.enabled;toggle.addEventListener('change',async()=>{
        toggle.disabled=true;try{await jsonRequest('/api/skills?id='+s.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...s,enabled:toggle.checked})});setStatus(toggle.checked?'Skill enabled':'Skill paused')}catch(e){toggle.checked=!toggle.checked;setStatus('Could not update skill')}finally{toggle.disabled=false}
      });
      const name=document.createElement('strong');name.textContent=s.name;label.append(toggle,name);top.appendChild(label);
      const del=document.createElement('button');del.type='button';del.className='small-danger';del.textContent='Delete';del.addEventListener('click',async()=>{if(!confirm('Delete skill "'+s.name+'"?'))return;del.disabled=true;try{await jsonRequest('/api/skills?id='+s.id,{method:'DELETE'});loadSkills()}catch(e){setStatus('Could not delete skill')}finally{del.disabled=false}});top.appendChild(del);card.appendChild(top);
      const desc=document.createElement('p');desc.textContent=s.description||'Custom instructions';card.appendChild(desc);
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='View instructions';const body=document.createElement('p');body.textContent=s.instructions;details.append(summary,body);card.appendChild(details);skillList.appendChild(card);
    });
  }catch(e){skillList.replaceChildren();const p=document.createElement('p');p.className='empty-state';p.textContent='Skills could not load: '+e.message;skillList.appendChild(p)}
}
skillForm.addEventListener('submit',async e=>{
  e.preventDefault();const submit=skillForm.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='Saving…';
  try{
    await jsonRequest('/api/skills',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:skillName.value,description:skillDescription.value,instructions:skillInstructions.value})});
    skillForm.reset();await loadSkills();setStatus('Skill saved');
  }catch(err){setStatus('Skill save failed');alert(err.message)}
  finally{submit.disabled=false;submit.textContent='Save skill'}
});
async function loadKnowledge(){
  knowledgeList.replaceChildren();const loading=document.createElement('p');loading.className='empty-state';loading.textContent='Loading knowledge…';knowledgeList.appendChild(loading);
  try{
    const j=await jsonRequest('/api/knowledge');knowledgeList.replaceChildren();
    if(!j.documents.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No saved documents. Add a policy, manual or reference file above.';knowledgeList.appendChild(p);return}
    j.documents.forEach(d=>{
      const card=document.createElement('article');card.className='setting-card';
      const top=document.createElement('div');top.className='setting-card-top';
      const label=document.createElement('label');label.className='toggle-label';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!d.active;toggle.addEventListener('change',async()=>{toggle.disabled=true;try{await jsonRequest('/api/knowledge?id='+d.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({active:toggle.checked})});setStatus(toggle.checked?'Knowledge enabled':'Knowledge paused')}catch(e){toggle.checked=!toggle.checked;setStatus('Could not update knowledge')}finally{toggle.disabled=false}});
      const name=document.createElement('strong');name.textContent=d.filename;label.append(toggle,name);top.appendChild(label);
      const del=document.createElement('button');del.type='button';del.className='small-danger';del.textContent='Delete';del.addEventListener('click',async()=>{if(!confirm('Delete "'+d.filename+'" from your knowledge library?'))return;del.disabled=true;try{await jsonRequest('/api/knowledge?id='+d.id,{method:'DELETE'});loadKnowledge()}catch(e){setStatus('Could not delete document')}finally{del.disabled=false}});top.appendChild(del);card.appendChild(top);
      const p=document.createElement('p');p.textContent=d.characters+' characters · '+(d.active?'used when relevant':'paused');card.appendChild(p);knowledgeList.appendChild(card);
    });
  }catch(e){knowledgeList.replaceChildren();const p=document.createElement('p');p.className='empty-state';p.textContent='Knowledge library could not load: '+e.message;knowledgeList.appendChild(p)}
}
knowledgeFile.addEventListener('change',async()=>{
  const file=knowledgeFile.files&&knowledgeFile.files[0];knowledgeFile.value='';if(!file)return;
  if(file.size>MAX_FILE_BYTES){setStatus('Knowledge files must be 5 MB or smaller');return}
  setStatus('Reading '+file.name+'…');
  try{
    const content=await extractDocument(file);if(!content.trim())throw new Error('No readable text found');
    await jsonRequest('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:file.name,content_type:file.type||'text/plain',content})});
    await loadKnowledge();setStatus('Knowledge saved: '+file.name);
  }catch(e){setStatus('Could not save knowledge');alert(e.message)}
});
async function loadConnectors(){
  connectorList.replaceChildren();const loading=document.createElement('p');loading.className='empty-state';loading.textContent='Checking connection status…';connectorList.appendChild(loading);
  try{
    const j=await jsonRequest('/api/connectors');connectorList.replaceChildren();
    j.connectors.forEach(c=>{
      const card=document.createElement('article');card.className='connector-card';
      const top=document.createElement('div');top.className='setting-card-top';
      const name=document.createElement('strong');name.textContent=c.name;
      const badge=document.createElement('span');badge.className='connector-status '+(c.connected?'connected':'not-connected');badge.textContent=c.connected?'Connected':c.status==='not_connected'?'Not connected':'Needs attention';
      top.append(name,badge);card.appendChild(top);
      const desc=document.createElement('p');desc.textContent=c.purpose;card.appendChild(desc);
      const note=document.createElement('p');note.className='connector-message';note.textContent=c.message;card.appendChild(note);connectorList.appendChild(card);
    });
    const refresh=document.createElement('button');refresh.type='button';refresh.className='settings-secondary';refresh.textContent='Refresh connection status';refresh.addEventListener('click',loadConnectors);connectorList.appendChild(refresh);
  }catch(e){connectorList.replaceChildren();const p=document.createElement('p');p.className='empty-state';p.textContent='Connectors could not be checked: '+e.message;connectorList.appendChild(p)}
}
plusButton.addEventListener('click',()=>{
  plusMenu.hidden=!plusMenu.hidden;plusButton.setAttribute('aria-expanded',String(!plusMenu.hidden));
});
attachImageButton.addEventListener('click',()=>{plusMenu.hidden=true;plusButton.setAttribute('aria-expanded','false');imageFiles.click()});
attachFileButton.addEventListener('click',()=>{plusMenu.hidden=true;plusButton.setAttribute('aria-expanded','false');documentFiles.click()});
openSettingsButton.addEventListener('click',()=>openSettings('builder'));
openSettingsFromMenu.addEventListener('click',()=>openSettings('skills'));
closeSettingsButton.addEventListener('click',closeSettings);modalScrim.addEventListener('click',closeSettings);
skillsTab.addEventListener('click',()=>setSettingsTab('skills'));builderTab.addEventListener('click',()=>setSettingsTab('builder'));connectorsTab.addEventListener('click',()=>setSettingsTab('connectors'));
qualityModeButton.addEventListener('click',()=>{
  deepMode=!deepMode;qualityModeButton.setAttribute('aria-pressed',String(deepMode));qualityModeButton.classList.toggle('active',deepMode);
  qualityModeButton.textContent=deepMode?'♧ Think · Deep':'♧ Think';qualityModeButton.title=deepMode?'Careful answer mode is on':'Enable a more careful answer';
});
micButton.addEventListener('click',()=>{
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){setStatus('Voice input is not supported by this browser');return}
  if(recognition){recognition.stop();recognition=null;micButton.classList.remove('recording');return}
  recognition=new Speech();recognition.lang='en-IN';recognition.interimResults=false;recognition.maxAlternatives=1;
  recognition.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||'';input.value=(input.value.trim()?input.value.trim()+' ':'')+transcript;updateCount();input.focus()};
  recognition.onerror=()=>setStatus('Voice input failed; type instead');
  recognition.onend=()=>{recognition=null;micButton.classList.remove('recording');setStatus('Ready')};
  recognition.start();micButton.classList.add('recording');setStatus('Listening…');
});

function previewBuild(card,id){
  const existing=card.querySelector('.preview-app-frame');if(existing){existing.remove();return}
  card.querySelectorAll('.preview-app-frame').forEach(x=>x.remove());
  const frame=document.createElement('iframe');frame.className='preview-app-frame';frame.title='Isolated generated app preview';frame.setAttribute('sandbox','allow-scripts');frame.loading='lazy';
  const loading=document.createElement('p');loading.className='empty-state';loading.textContent='Preparing isolated preview…';card.appendChild(loading);
  jsonRequest('/api/builds?id='+encodeURIComponent(id)).then(j=>{
    const files=j.build.files||[];
    const htmlFile=files.find(f=>f.path==='public/index.html'),cssFile=files.find(f=>f.path==='public/style.css'),jsFile=files.find(f=>f.path==='public/app.js');
    if(!htmlFile||!cssFile||!jsFile)throw new Error('Preview files are incomplete.');
    let html=htmlFile.content;
    const styleTag='<style>'+cssFile.content+'</style>';
    if(/<link\b[^>]*href=["']\/style\.css["'][^>]*>/i.test(html))html=html.replace(/<link\b[^>]*href=["']\/style\.css["'][^>]*>/i,styleTag);
    else html=html.replace(/<\/head>/i,styleTag+'</head>');
    const safeJS=jsFile.content.replace(/<\/script/gi,'<\\/script');
    const scriptTag='<script>'+safeJS+'</script>';
    if(/<script\b[^>]*src=["']\/app\.js["'][^>]*>\s*<\/script>/i.test(html))html=html.replace(/<script\b[^>]*src=["']\/app\.js["'][^>]*>\s*<\/script>/i,scriptTag);
    else html=html.replace(/<\/body>/i,scriptTag+'</body>');
    frame.srcdoc=html;loading.remove();card.appendChild(frame);
  }).catch(e=>{loading.textContent='Preview unavailable: '+e.message});
}
function renderBuilds(items){
  buildList.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No app drafts yet. Describe your app above to generate the first version.';buildList.appendChild(p);return}
  items.forEach(b=>{
    const card=document.createElement('article');card.className='build-card';
    const head=document.createElement('div');head.className='setting-card-top';
    const title=document.createElement('strong');title.textContent=b.name;head.appendChild(title);
    const badge=document.createElement('span');badge.className='build-status';badge.textContent=(b.status||'draft').replace(/_/g,' ');head.appendChild(badge);card.appendChild(head);
    const desc=document.createElement('p');desc.textContent=b.description;card.appendChild(desc);
    const meta=document.createElement('p');meta.className='build-meta';meta.textContent=(b.file_count||0)+' files · Created '+(b.created_at?new Date(b.created_at).toLocaleDateString():'recently');card.appendChild(meta);
    const actions=document.createElement('div');actions.className='build-actions';
    const download=document.createElement('button');download.type='button';download.className='settings-secondary';download.textContent='Download ZIP';download.addEventListener('click',()=>downloadBuild(b.id));actions.appendChild(download);
    const preview=document.createElement('button');preview.type='button';preview.className='settings-secondary';preview.textContent='Preview';preview.addEventListener('click',()=>previewBuild(card,b.id));actions.appendChild(preview);
    const inspect=document.createElement('button');inspect.type='button';inspect.className='settings-secondary';inspect.textContent='View files';inspect.addEventListener('click',async()=>{inspect.disabled=true;try{const j=await jsonRequest('/api/builds?id='+encodeURIComponent(b.id));showBuildFiles(card,j.build)}catch(e){builderStatus.textContent=e.message}finally{inspect.disabled=false}});actions.appendChild(inspect);
    if(b.github_url){
      const link=document.createElement('a');link.className='response-action';link.href=b.github_url;link.target='_blank';link.rel='noopener';link.textContent='Open GitHub ↗';actions.appendChild(link);
    }
    if(!b.render_service_id&&b.github_url){
      const deploy=document.createElement('button');deploy.type='button';deploy.className='settings-secondary';deploy.textContent='Deploy Render';deploy.addEventListener('click',()=>deployBuildToRender(b));actions.appendChild(deploy);
    }
    if(!b.render_service_id){
      const push=document.createElement('button');push.type='button';push.className='settings-secondary';push.textContent=b.github_url?'Retry GitHub push':'Approve & push GitHub';push.addEventListener('click',()=>pushBuildToGitHub(b));actions.appendChild(push);
    }
    if(b.render_url){
      const link=document.createElement('a');link.className='response-action download-action';link.href=b.render_url;link.target='_blank';link.rel='noopener';link.textContent='Open live app ↗';actions.appendChild(link);
    }
    card.appendChild(actions);
    if(b.github_url){const p=document.createElement('p');p.className='build-meta';p.textContent=b.github_url;card.appendChild(p)}
    if(b.render_url){const p=document.createElement('p');p.className='build-meta';p.textContent='Render URL: '+b.render_url;card.appendChild(p)}
    if(!b.github_url&&!b.render_service_id){
      const remove=document.createElement('button');remove.type='button';remove.className='small-danger';remove.textContent='Delete draft';remove.addEventListener('click',async()=>{if(!confirm('Permanently delete the draft "'+b.name+'"? This cannot be undone.'))return;remove.disabled=true;try{await jsonRequest('/api/builds?id='+encodeURIComponent(b.id),{method:'DELETE'});builderStatus.textContent='Draft deleted.';await loadBuilds()}catch(e){builderStatus.textContent='Could not delete draft: '+e.message;remove.disabled=false}});actions.appendChild(remove);
    }
    if(b.last_error){const p=document.createElement('p');p.className='build-error';p.textContent='Last issue: '+b.last_error;card.appendChild(p)}
    buildList.appendChild(card);
  });
}
async function loadBuilds(){
  buildList.replaceChildren();const p=document.createElement('p');p.className='empty-state';p.textContent='Loading app drafts…';buildList.appendChild(p);
  try{const j=await jsonRequest('/api/builds');renderBuilds(j.builds||[])}
  catch(e){buildList.replaceChildren();const q=document.createElement('p');q.className='empty-state';q.textContent='Could not load projects: '+e.message;buildList.appendChild(q)}
}
async function downloadBuild(id){
  builderStatus.textContent='Preparing project ZIP…';
  try{
    const j=await jsonRequest('/api/builds?id='+encodeURIComponent(id));const b=j.build;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','JSZip');
    const zip=new window.JSZip();(b.files||[]).forEach(f=>zip.file(f.path,f.content));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=safeFilename(b.name).replace(/\.docx$/i,'')+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    builderStatus.textContent='ZIP created for '+b.name+'. The project is still a draft until you publish it.';
  }catch(e){builderStatus.textContent='ZIP creation failed: '+e.message}
}
function showBuildFiles(card,build){
  let details=card.querySelector('.build-file-details');
  if(details){details.remove();return}
  details=document.createElement('div');details.className='build-file-details';
  (build.files||[]).forEach(f=>{
    const d=document.createElement('details');const s=document.createElement('summary');s.textContent=f.path+' · '+String(f.content||'').length+' characters';
    const pre=document.createElement('pre');pre.textContent=f.content||'';d.append(s,pre);details.appendChild(d);
  });
  card.appendChild(details);
}
async function pushBuildToGitHub(build){
  const verb=build.github_url?'retry pushing':'create a new PRIVATE GitHub repository and push '+(build.file_count||'the generated')+' project files';
  if(!confirm('APPROVAL REQUIRED\n\nNexora will '+verb+' for "'+build.name+'".\n\nThis will create/modify an external GitHub repository. Continue?'))return;
  builderStatus.textContent='Waiting for GitHub…';
  try{
    const j=await jsonRequest('/api/builds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'push',id:build.id,repo_name:build.name,approved:true})});
    builderStatus.textContent='GitHub push succeeded: '+j.github_url+' ('+j.files_pushed+' files).';
    await loadBuilds();
  }catch(e){builderStatus.textContent='GitHub push did not complete: '+e.message;await loadBuilds()}
}
async function loadRenderOwners(){
  renderOwnerSelect.replaceChildren();const first=document.createElement('option');first.value='';first.textContent='Loading Render workspaces…';renderOwnerSelect.appendChild(first);
  try{
    const j=await jsonRequest('/api/builds?action=render_owners');renderOwnerSelect.replaceChildren();
    if(!(j.owners||[]).length){const o=document.createElement('option');o.value='';o.textContent='No Render workspace returned';renderOwnerSelect.appendChild(o);builderStatus.textContent='Render connection is present but returned no workspaces.';return}
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose Render workspace';renderOwnerSelect.appendChild(placeholder);
    j.owners.forEach(owner=>{const o=document.createElement('option');o.value=owner.id;o.textContent=owner.name+' ('+owner.type+')';renderOwnerSelect.appendChild(o)});
    builderStatus.textContent='Loaded '+j.owners.length+' Render workspace(s).';
  }catch(e){renderOwnerSelect.replaceChildren();const o=document.createElement('option');o.value='';o.textContent='Connect Render in Setup first';renderOwnerSelect.appendChild(o);builderStatus.textContent='Render is not verified: '+e.message}
}
async function deployBuildToRender(build){
  const ownerId=renderOwnerSelect.value;
  if(!ownerId){builderStatus.textContent='Choose a Render workspace first, and confirm Render is connected.';return}
  if(!confirm('APPROVAL REQUIRED\n\nCreate a new FREE Render static-site service named "'+build.name+'" from '+build.github_url+' in the selected Render workspace? This will publish the current GitHub main branch. Continue?'))return;
  builderStatus.textContent='Creating Render service…';
  try{
    const j=await jsonRequest('/api/builds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'deploy_render',id:build.id,owner_id:ownerId,approved:true})});
    builderStatus.textContent='Render service created. URL: '+(j.render_url||'See Render dashboard; URL is not yet available.');
    await loadBuilds();
  }catch(e){builderStatus.textContent='Render deployment was not completed: '+e.message;await loadBuilds()}
}
builderForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy)return;
  const name=builderName.value.trim(),description=builderDescription.value.trim();
  if(name.length<2||description.length<20){builderStatus.textContent='Add an app name and at least 20 characters describing the app.';return}
  generateAppButton.disabled=true;generateAppButton.textContent='Generating…';builderStatus.textContent='Designing UI and generating three app files…';
  try{
    const j=await jsonRequest('/api/builds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',name,description})});
    builderStatus.textContent='Draft generated with '+j.quality_gate.file_count+' files by '+j.provider+'. Static checks passed; hosting build/browser tests remain to be run.';
    builderForm.reset();await loadBuilds();
  }catch(err){builderStatus.textContent='App generation did not complete: '+err.message}
  finally{generateAppButton.disabled=false;generateAppButton.textContent='✦ Generate web app'}
});
refreshRenderOwnersButton.addEventListener('click',loadRenderOwners);
openBuilderFromMenu.addEventListener('click',()=>openSettings('builder'));

boot();updateCount();
})();