import { config } from "hatchable";

const PROVIDERS = [
  // Anthropic Platform API intentionally excluded: this workspace is configured for ₹0-only usage.
  { id:"groq-free", registryId:"groq", label:"Groq Free Tier", key:"GROQ_API_KEY", type:"openai", url:"https://api.groq.com/openai/v1/chat/completions", model:"qwen/qwen3.8-27b" },
  { id:"openrouter-free", registryId:"openrouter", label:"OpenRouter Free", key:"OPENROUTER_API_KEY", type:"openai", url:"https://openrouter.ai/api/v1/chat/completions", model:"nvidia/nemotron-3-ultra-550b-a55b:free" },
];

let registryCache = null;
let registryAt = 0;

async function loadFreeRegistry(){
  const now = Date.now();
  if(registryCache && now - registryAt < 300000) return registryCache;
  try{
    const r = await fetch("https://raw.githubusercontent.com/surendranb/free-inference/main/data/providers.json",{signal:AbortSignal.timeout(3000)});
    if(!r.ok) throw new Error(`Free Inference registry HTTP ${r.status}`);
    registryCache = await r.json();
    registryAt = now;
    return registryCache;
  }catch(e){
    try{
      const key = await getKey("GITHUB_TOKEN");
      const headers = {"Accept":"application/vnd.github.raw+json"};
      if(key) headers.Authorization = `Bearer ${key}`;
      const r = await fetch("https://api.github.com/repos/Vivekpareek1/free-llm-api/contents/data/providers.json?ref=main",{headers,signal:AbortSignal.timeout(3000)});
      if(!r.ok) throw new Error(`Legacy registry HTTP ${r.status}`);
      registryCache = await r.json();
      registryAt = now;
      return registryCache;
    }catch(e2){
      registryCache = {providers:[],renewable_credits:[],error:e.message+"; "+e2.message};
      registryAt = now;
      return registryCache;
    }
  }
}

function openRouterCandidates(registry){
  const fromRegistry=(registry?.providers||[]).find(x=>x.name==="OpenRouter");
  // Hard gate: never send requests to an OpenRouter model without the explicit :free suffix.
  const models=(fromRegistry?.models||[]).map(x=>x.name)
    .filter(name=>typeof name==="string" && name.toLowerCase().endsWith(":free"))
    .filter(name=>!name.toLowerCase().includes("content-safety"));
  return [...new Set(["nvidia/nemotron-3-ultra-550b-a55b:free",...models])];
}

async function getKey(name){ try{return await config.get(name)}catch{return null} }

export async function providerStatus(){
  const registry=await loadFreeRegistry();
  const out=[];
  for(const p of PROVIDERS){
    const meta=(registry.providers||[]).find(x=>
      x.id===p.registryId ||
      (p.registryId==="google-gemini" && x.name==="Google AI Studio (Gemini API)") ||
      (p.registryId==="mistral" && x.name==="Mistral") ||
      (p.registryId==="cerebras" && x.name==="Cerebras") ||
      (p.registryId==="openrouter" && x.name==="OpenRouter") ||
      (p.registryId==="groq" && x.name==="Groq")
    ) || (registry.renewable_credits||[]).find(x=>x.id===p.registryId);
    out.push({
      id:p.id,label:p.label,configured:!!(await getKey(p.key)),model:p.model,
      registry_name:meta?.name||null,
      free_models:Array.isArray(meta?.models)?meta.models.length:(meta?.free_models||0),
      max_context:meta?.max_context||null,
      registry_last_verified:registry.verified||registry.last_verified||null
    });
  }
  return {
    configured:out,
    registry_source:registry.website||"Vivekpareek1/free-llm-api",
    registry_verified:registry.verified||registry.last_verified||null,
    registry_providers:(registry.providers||[]).length,
    registry_renewable:(registry.renewable_credits||[]).length,
    registry_error:registry.error||null
  };
}

function timeoutFor(options){
  const remaining=(options.deadline||Date.now()+50000)-Date.now();
  return Math.max(2000,Math.min(options.timeout_ms??25000,remaining));
}

function toGemini(messages){
  const system=messages.filter(m=>m.role==="system").map(m=>m.content).join("\n\n");
  const contents=messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:String(m.content)}]}));
  if(system) contents.unshift({role:"user",parts:[{text:"System instructions:\n"+system}]});
  return contents;
}

async function callProvider(p,key,messages,options){
  if(p.type==="anthropic"){
    const system=messages.filter(m=>m.role==="system").map(m=>String(m.content)).join("\n\n");
    const body={model:p.model,max_tokens:options.max_tokens??2500,messages:messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content)}))};
    if(system) body.system=system;
    const r=await fetch(p.url,{method:"POST",signal:AbortSignal.timeout(timeoutFor(options)),headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||`HTTP ${r.status}`);
    const text=data?.content?.filter(x=>x.type==="text").map(x=>x.text).join("")||"";
    if(!text) throw new Error("Provider returned no text");
    return {text,provider:p.id,model:data.model||p.model,usage:data.usage||null};
  }
  if(p.type==="gemini"){
    const r=await fetch(`${p.url}/${p.model}:generateContent?key=${encodeURIComponent(key)}`,{
      method:"POST",signal:AbortSignal.timeout(timeoutFor(options)),headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:toGemini(messages),generationConfig:{temperature:options.temperature??0.2,maxOutputTokens:options.max_tokens??2500}})
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||`HTTP ${r.status}`);
    const text=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"";
    if(!text) throw new Error("Provider returned no text");
    return {text,provider:p.id,model:p.model,usage:data?.usageMetadata||null};
  }
  const r=await fetch(p.url,{
    method:"POST",
    signal:AbortSignal.timeout(timeoutFor(options)),
    headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":"https://nexora-agent.hatchable.site","X-Title":"Nexora Agent Workspace"},
    body:JSON.stringify({model:p.model,messages,temperature:options.temperature??0.2,max_tokens:options.max_tokens??2500})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||`HTTP ${r.status}`);
  const text=data?.choices?.[0]?.message?.content;
  if(!text) throw new Error("Provider returned no text");
  return {text,provider:p.id,model:data.model||p.model,usage:data.usage||null};
}

export async function llm(messages,options={}){
  const errors=[];
  // Keep the whole call under the platform's ~60s synchronous HTTP limit.
  options={...options,deadline:Date.now()+(options.budget_ms??48000)};
  const registry=await loadFreeRegistry();
  const openRouterMeta=(registry?.providers||[]).find(x=>x.name==="OpenRouter");
  const registryVision=(openRouterMeta?.models||[]).map(x=>x.name).filter(name=>
    typeof name==="string" && name.toLowerCase().endsWith(":free") &&
    !name.toLowerCase().includes("content-safety") &&
    /(vision|\bvl\b|gemma-3|gemma-4|llama-3\.2.*vision|omni|flash-vl)/i.test(name)
  );
  // Only explicit, general-purpose free vision models are allowed; exclude random routing
  // because it can select a safety classifier that cannot answer normal visual questions.
  const visionCandidates=[...new Set([
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "inclusionai/ling-3.0-flash-vl:free",
    ...registryVision
  ])].slice(0,5);
  if(options.vision && !(await getKey("OPENROUTER_API_KEY"))){
    const err=new Error("OpenRouter API key is required for free vision inference.");
    err.code="NO_FREE_VISION_MODEL";
    throw err;
  }
  if(options.vision && !visionCandidates.length){
    const err=new Error("No free vision-capable OpenRouter model is listed in the current registry.");
    err.code="NO_FREE_VISION_MODEL";
    throw err;
  }
  for(const p of PROVIDERS){
    const key=await getKey(p.key);
    if(!key) continue;
    if(options.vision && p.id!=="openrouter-free") continue;
    const candidates=options.vision ? visionCandidates : (p.id==="openrouter-free" ? openRouterCandidates(registry).slice(0,3) : [p.model]);
    for(const model of candidates){
      if(options.deadline-Date.now()<3000){errors.push({provider:p.id,model,error:"time budget exhausted"});break}
      const candidate={...p,model};
      try{return await callProvider(candidate,key,messages,options)}
      catch(e){
        const msg=String(e.message||"");
        const m=msg.match(/try again in ([0-9.]+)s/i);
        if(m && Number(m[1])<=1.5 && /rate limit|rate_limit|OTPM|TPM/i.test(msg)){
          await new Promise(r=>setTimeout(r,Math.ceil(Number(m[1])*1000)+250));
          try{return await callProvider(candidate,key,messages,options)}
          catch(e2){errors.push({provider:p.id,model,error:e2.message})}
        }else{
          errors.push({provider:p.id,model,error:msg})
        }
      }
    }
  }
  const err=new Error(options.vision ? "No working free vision model is currently available." : "No working free LLM provider is configured.");
  err.code=options.vision ? "NO_FREE_VISION_MODEL" : "NO_FREE_LLM"; err.details=errors; throw err;
}