import { db } from "hatchable";

export const access = "user";
export const methods = ["GET", "POST", "DELETE"];

function asText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function cleanMessages(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(-80).filter(m =>
    m && (m.who === "user" || m.who === "bot") && typeof m.text === "string"
  ).map(m => ({who:m.who, text:m.text.slice(0,8000), meta:asText(m.meta,300)}));
}
function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).filter(m =>
    m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  ).map(m => ({role:m.role,content:m.content.slice(0,3000)}));
}

export default async function(req,res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({error:"AUTH_REQUIRED"});
  try {
    if (req.method === "GET") {
      const q = await db.query(
        "SELECT id,title,messages,history,updated_at FROM workspace_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 30",
        [userId]
      );
      return res.json({ok:true,conversations:q.rows});
    }
    if (req.method === "POST") {
      const messages = cleanMessages(req.body?.messages);
      if (!messages || !messages.length) return res.status(400).json({error:"MESSAGES_REQUIRED"});
      const history = cleanHistory(req.body?.history);
      const title = asText(req.body?.title,80).trim().slice(0,80) || "New chat";
      const id = Number(req.body?.id);
      if (Number.isSafeInteger(id) && id > 0) {
        const q = await db.query(
          "UPDATE workspace_conversations SET title=$1,messages=$2::jsonb,history=$3::jsonb,updated_at=now() WHERE id=$4 AND user_id=$5 RETURNING id,title,messages,history,updated_at",
          [title,JSON.stringify(messages),JSON.stringify(history),id,userId]
        );
        if (!q.rows.length) return res.status(404).json({error:"CONVERSATION_NOT_FOUND"});
        return res.json({ok:true,conversation:q.rows[0]});
      }
      const q = await db.query(
        "INSERT INTO workspace_conversations (user_id,title,messages,history) VALUES ($1,$2,$3::jsonb,$4::jsonb) RETURNING id,title,messages,history,updated_at",
        [userId,title,JSON.stringify(messages),JSON.stringify(history)]
      );
      return res.status(201).json({ok:true,conversation:q.rows[0]});
    }
    if (req.method === "DELETE") {
      const id = Number(req.query?.id ?? req.body?.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({error:"INVALID_CONVERSATION_ID"});
      const q = await db.query("DELETE FROM workspace_conversations WHERE id=$1 AND user_id=$2 RETURNING id",[id,userId]);
      if (!q.rows.length) return res.status(404).json({error:"CONVERSATION_NOT_FOUND"});
      return res.json({ok:true,deleted:true});
    }
    return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  } catch (e) {
    console.error("Conversation storage failed:",e?.code||"DB_ERROR");
    return res.status(500).json({error:"CONVERSATION_STORAGE_FAILED",message:"Chat history could not be saved. Please retry."});
  }
}