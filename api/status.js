import { providerStatus } from "../lib/providers.js";
import { ensureCatalog } from "../lib/agents.js";
import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  try{
    const count=await ensureCatalog();
    const q=await db.query("SELECT division,COUNT(*)::int AS count FROM agent_catalog GROUP BY division ORDER BY division");
    const userId=req.user?.id;
    const usageQ=userId?await db.query("SELECT request_count FROM workspace_usage WHERE user_id=$1 AND usage_date=CURRENT_DATE",[userId]):{rows:[]};
    const used=Number(usageQ.rows[0]?.request_count||0);
    res.json({ok:true,agents_total:count,divisions:q.rows,providers:await providerStatus(),claude_code_bridge:{configured:false,enabled:false,reason:"External execution remains disabled until a server-side approval workflow is implemented."},free_mode:true,usage:{daily_limit:40,used,remaining:Math.max(0,40-used)}});
  }catch(e){
    if(e.code==="GITHUB_SETUP_REQUIRED") return res.json({ok:true,agents_total:0,divisions:[],agents_setup_required:true,providers:await providerStatus(),claude_code_bridge:{configured:false,enabled:false},free_mode:true,usage:{daily_limit:40,used:0,remaining:40}});
    console.error("Nexora status check failed:",e?.code||"STATUS_ERROR");
    res.status(500).json({ok:false,error:"STATUS_UNAVAILABLE",message:"Status check failed. Please retry."})
  }
}