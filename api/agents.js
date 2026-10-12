import { listAgents } from "../lib/agents.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  try{
    const search=String(req.query?.q||"").trim().slice(0,100);
    const requested=Number(req.query?.limit??100);
    const limit=Math.min(Math.max(Number.isFinite(requested)?requested:100,1),300);
    res.json({agents:await listAgents(search,limit)});
  }catch(e){console.error("Nexora agent catalogue failed:",e?.code||"CATALOGUE_ERROR");res.status(500).json({error:"AGENT_CATALOGUE_UNAVAILABLE",message:"Specialist catalogue could not load. Please retry."})}
}