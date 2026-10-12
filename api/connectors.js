import { api } from "hatchable";

export const access="user";
export const methods=["GET"];

const CONNECTORS=[
  {id:"github",name:"GitHub",kind:"developer",purpose:"Search repos/issues and read repositories the user authorizes.",probe:"/user"},
  {id:"google_drive",name:"Google Drive",kind:"files",purpose:"Create and manage files created or explicitly opened with Nexora.",probe:"/files",query:{pageSize:1,fields:"files(id,name)"}},
  {id:"notion",name:"Notion",kind:"knowledge",purpose:"Search the user's connected Notion workspace and read pages.",probe:"/users/me"},
  {id:"render",name:"Render",kind:"deployment",purpose:"Create and manage Render web services after explicit approval.",probe:"/owners",query:{limit:1}}
];

export default async function(req,res) {
  const userId=req.user?.id;
  if(!userId)return res.status(401).json({error:"AUTH_REQUIRED"});
  const results=await Promise.all(CONNECTORS.map(async c=>{
    try{
      const r=await api.call(c.id,{method:"GET",path:c.probe,query:c.query,asUser:userId});
      const connected=r&&Number(r.status)>=200&&Number(r.status)<300;
      return {...c,status:connected?"connected":"needs_attention",connected,message:connected?"Connection verified":"Provider did not verify this connection"};
    }catch(e){
      const detail=String(e?.message||"");
      const setup=e?.code==="SetupRequired"||e?.name==="SetupRequired"||/\b412\b|not connected|setup required/i.test(detail);
      return {...c,status:setup?"not_connected":"error",connected:false,message:setup?"Not connected yet. Project owner must connect this API in Hatchable Console → Setup.":"Connection check failed; refresh after confirming API permissions."};
    }
  }));
  return res.json({ok:true,connectors:results,actions_require_approval:true});
}