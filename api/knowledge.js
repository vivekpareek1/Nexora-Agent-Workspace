import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST","PUT","DELETE"];

function asText(v,max){return typeof v==="string"?v.trim().slice(0,max):""}

export default async function(req,res){
  const userId=req.user?.id;
  if(!userId)return res.status(401).json({error:"AUTH_REQUIRED"});
  try{
    if(req.method==="GET"){
      const q=await db.query("SELECT id,filename,content_type,char_length(content)::int AS characters,active,created_at,updated_at FROM workspace_knowledge WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50",[userId]);
      return res.json({ok:true,documents:q.rows,total:q.rows.length});
    }
    if(req.method==="POST"){
      const filename=asText(req.body?.filename,180);
      const contentType=asText(req.body?.content_type,100)||"text/plain";
      const content=typeof req.body?.content==="string"?req.body.content.slice(0,60000):"";
      if(!filename||!content.trim())return res.status(400).json({error:"KNOWLEDGE_CONTENT_REQUIRED",message:"A filename and readable text are required."});
      const count=await db.query("SELECT COUNT(*)::int AS docs,COALESCE(SUM(char_length(content)),0)::int AS chars FROM workspace_knowledge WHERE user_id=$1",[userId]);
      if(Number(count.rows[0]?.docs||0)>=50||Number(count.rows[0]?.chars||0)+content.length>1000000){
        return res.status(413).json({error:"KNOWLEDGE_LIBRARY_LIMIT",message:"Knowledge library limit reached (50 files or 1 million characters). Remove an old file and retry."});
      }
      const q=await db.query("INSERT INTO workspace_knowledge(user_id,filename,content_type,content) VALUES($1,$2,$3,$4) RETURNING id,filename,content_type,char_length(content)::int AS characters,active,created_at,updated_at",[userId,filename,contentType,content]);
      return res.status(201).json({ok:true,document:q.rows[0]});
    }
    const id=Number(req.query?.id??req.body?.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"INVALID_DOCUMENT_ID"});
    if(req.method==="PUT"){
      if(typeof req.body?.active!=="boolean")return res.status(400).json({error:"ACTIVE_BOOLEAN_REQUIRED"});
      const q=await db.query("UPDATE workspace_knowledge SET active=$1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING id,filename,content_type,char_length(content)::int AS characters,active,created_at,updated_at",[req.body.active,id,userId]);
      if(!q.rows.length)return res.status(404).json({error:"DOCUMENT_NOT_FOUND"});
      return res.json({ok:true,document:q.rows[0]});
    }
    const q=await db.query("DELETE FROM workspace_knowledge WHERE id=$1 AND user_id=$2 RETURNING id",[id,userId]);
    if(!q.rows.length)return res.status(404).json({error:"DOCUMENT_NOT_FOUND"});
    return res.json({ok:true,deleted:true});
  }catch(e){
    console.error("Knowledge operation failed:",e?.code||"KNOWLEDGE_ERROR");
    return res.status(500).json({error:"KNOWLEDGE_OPERATION_FAILED",message:"Could not update the knowledge library. Please retry."});
  }
}