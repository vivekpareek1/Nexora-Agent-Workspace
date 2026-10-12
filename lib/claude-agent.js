import { config } from "hatchable";

const BRIDGE_URL_KEY="CLAUDE_CODE_BRIDGE_URL";
const BRIDGE_TOKEN_KEY="CLAUDE_CODE_BRIDGE_TOKEN";

async function getConfig(name){
  try{return await config.get(name)}catch{return null}
}

export function isClaudeAgentTask(task){
  return /\b(fix|debug|refactor|implement|code|coding|program|programming|repository|repo|github|pull request|pr|commit|deploy|docker|fastapi|python|javascript|typescript|react|api|backend|frontend|migration|test|bug)\b/i.test(String(task||""));
}

export async function claudeBridgeStatus(){
  const url=await getConfig(BRIDGE_URL_KEY);
  const token=await getConfig(BRIDGE_TOKEN_KEY);
  return {configured:Boolean(url&&token),url: url ? String(url).replace(/^(https?:\/\/[^/]+).*/,"$1") : null};
}

export async function runClaudeAgent({task,history=[],agent=null}){
  const url=await getConfig(BRIDGE_URL_KEY);
  const token=await getConfig(BRIDGE_TOKEN_KEY);
  if(!url || !token){
    const e=new Error("CLAUDE_CODE_BRIDGE_NOT_CONFIGURED");
    e.code="CLAUDE_CODE_BRIDGE_NOT_CONFIGURED";
    throw e;
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const r=await fetch(String(url).replace(/\/$/,"")+"/run",{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":`Bearer ${token}`
      },
      body:JSON.stringify({
        task:String(task),
        history:Array.isArray(history)?history.slice(-2):[],
        specialist:agent?{name:agent.name,division:agent.division,path:agent.path}:null
      }),
      signal:controller.signal
    });
    const body=await r.json().catch(()=>({}));
    if(!r.ok){
      const e=new Error(body?.error||`Claude Code bridge HTTP ${r.status}`);
      e.code="CLAUDE_CODE_BRIDGE_ERROR";
      e.status=r.status;
      throw e;
    }
    if(!body?.reply && !body?.text){
      const e=new Error("Claude Code bridge returned no final reply");
      e.code="CLAUDE_CODE_BRIDGE_INVALID";
      throw e;
    }
    return {
      provider:"Claude Code subscription bridge",
      model:body.model||"Claude Code",
      text:String(body.reply||body.text),
      worker:true
    };
  }finally{
    clearTimeout(timer);
  }
}