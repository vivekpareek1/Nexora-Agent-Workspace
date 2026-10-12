import { db } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

export default async function(req,res) {
  if (req.headers["x-hatchable-trigger"] !== "user-deleting") {
    return res.status(403).json({error:"PLATFORM_TRIGGER_REQUIRED"});
  }
  const userId=req.body?.user?.id;
  if(typeof userId!=="string" || !userId) {
    return res.status(400).json({error:"USER_ID_REQUIRED"});
  }
  try {
    await db.query("DELETE FROM workspace_conversations WHERE user_id=$1",[userId]);
    await db.query("DELETE FROM workspace_usage WHERE user_id=$1",[userId]);
    await db.query("DELETE FROM workspace_skills WHERE user_id=$1",[userId]);
    await db.query("DELETE FROM workspace_knowledge WHERE user_id=$1",[userId]);
    await db.query("DELETE FROM workspace_builds WHERE user_id=$1",[userId]);
    return res.json({ok:true,deleted:{conversations:true,usage:true}});
  } catch(e) {
    console.error("User deletion cleanup failed:",e?.code||"CLEANUP_ERROR");
    return res.status(500).json({error:"USER_DATA_CLEANUP_FAILED"});
  }
}