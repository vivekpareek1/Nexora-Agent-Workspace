import { db } from "hatchable";

export const access = "user";
export const methods = ["GET","POST","PUT","DELETE"];

function text(value,max) {
  return typeof value==="string" ? value.trim().slice(0,max) : "";
}

export default async function(req,res) {
  const userId=req.user?.id;
  if(!userId)return res.status(401).json({error:"AUTH_REQUIRED"});
  try {
    if(req.method==="GET") {
      const q=await db.query("SELECT id,name,description,instructions,enabled,created_at,updated_at FROM workspace_skills WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50",[userId]);
      return res.json({ok:true,skills:q.rows});
    }
    if(req.method==="POST") {
      const name=text(req.body?.name,80);
      const description=text(req.body?.description,300);
      const instructions=text(req.body?.instructions,5000);
      if(!name||!instructions)return res.status(400).json({error:"SKILL_FIELDS_REQUIRED",message:"Skill name and instructions are required."});
      const q=await db.query("INSERT INTO workspace_skills(user_id,name,description,instructions,enabled) VALUES($1,$2,$3,$4,TRUE) RETURNING id,name,description,instructions,enabled,created_at,updated_at",[userId,name,description,instructions]);
      return res.status(201).json({ok:true,skill:q.rows[0]});
    }
    const id=Number(req.query?.id??req.body?.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"INVALID_SKILL_ID"});
    if(req.method==="PUT") {
      const name=text(req.body?.name,80);
      const description=text(req.body?.description,300);
      const instructions=text(req.body?.instructions,5000);
      const enabled=typeof req.body?.enabled==="boolean"?req.body.enabled:null;
      if(!name||!instructions||enabled===null)return res.status(400).json({error:"SKILL_FIELDS_REQUIRED",message:"Name, instructions and enabled status are required."});
      const q=await db.query("UPDATE workspace_skills SET name=$1,description=$2,instructions=$3,enabled=$4,updated_at=now() WHERE id=$5 AND user_id=$6 RETURNING id,name,description,instructions,enabled,created_at,updated_at",[name,description,instructions,enabled,id,userId]);
      if(!q.rows.length)return res.status(404).json({error:"SKILL_NOT_FOUND"});
      return res.json({ok:true,skill:q.rows[0]});
    }
    const q=await db.query("DELETE FROM workspace_skills WHERE id=$1 AND user_id=$2 RETURNING id",[id,userId]);
    if(!q.rows.length)return res.status(404).json({error:"SKILL_NOT_FOUND"});
    return res.json({ok:true,deleted:true});
  } catch(e) {
    console.error("Workspace skill operation failed:",e?.code||"SKILL_ERROR");
    return res.status(500).json({error:"SKILL_OPERATION_FAILED",message:"Could not save this skill. Please retry."});
  }
}