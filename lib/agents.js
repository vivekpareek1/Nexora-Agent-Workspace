import { db, config } from "hatchable";

const REPO = "https://raw.githubusercontent.com/Vivekpareek1/agency-agents";
const META = "https://api.github.com/repos/Vivekpareek1/agency-agents";
const CACHE_TTL_HOURS = 24;

function cleanName(s) {
  return s.replace(/^.*\//,"").replace(/\.md$/,"").replace(/^[a-z]+-/,"").replace(/-/g," ");
}
function divisionFromPath(path) { return path.split("/")[0]; }

async function githubToken() {
  try { return await config.get("GITHUB_TOKEN"); } catch { return null; }
}

async function fetchRepoFile(path, ref) {
  const token = await githubToken();
  const headers = token ? {Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json"} : {};
  const r = await fetch(`https://api.github.com/repos/Vivekpareek1/agency-agents/contents/${path}?ref=${encodeURIComponent(ref)}`,{headers,signal:AbortSignal.timeout(8000)});
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      const e = new Error("GitHub token lacks access to the private agent repository.");
      e.code = "GITHUB_SETUP_REQUIRED";
      throw e;
    }
    if (r.status === 404) {
      const e = new Error(`Agent file not found on branch ${ref}: ${path}`);
      e.code = "AGENT_FILE_NOT_FOUND";
      throw e;
    }
    throw new Error(`GitHub agent fetch failed: ${r.status}`);
  }
  const data = await r.json();
  if (data.encoding === "base64") {
    const binary=atob(data.content.replace(/\\s/g,""));
    return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
  }
  if (data.download_url) {
    const raw = await fetch(data.download_url,{headers,signal:AbortSignal.timeout(8000)});
    if (raw.ok) return await raw.text();
  }
  throw new Error("GitHub file content unavailable");
}

export async function ensureCatalog() {
  const q = await db.query("SELECT COUNT(*)::int AS count, MAX(updated_at) AS latest, MAX(catalog_checked_at) AS checked, COUNT(*) FILTER (WHERE COALESCE(source_ref,'')='')::int AS missing_ref FROM agent_catalog");
  const count = Number(q.rows[0].count || 0);
  const latest = q.rows[0].latest ? new Date(q.rows[0].latest).getTime() : 0;
  const checked = q.rows[0].checked ? new Date(q.rows[0].checked).getTime() : 0;
  const now = Date.now();
  if (count > 0 && Number(q.rows[0].missing_ref||0)===0 && now-latest < CACHE_TTL_HOURS*3600*1000) return count;
  // If GitHub was checked recently, keep serving the database snapshot rather than
  // repeatedly hammering the API during a transient rate limit or outage.
  if (count > 0 && checked > 0 && now-checked < 5*60*1000) return count;

  const markChecked = async () => {
    if (count > 0) await db.query("UPDATE agent_catalog SET catalog_checked_at=now()");
  };
  const cachedOrThrow = async (error) => {
    await markChecked();
    if (count > 0) {
      console.warn("Agent catalogue refresh deferred; using cached catalogue.");
      return count;
    }
    throw error;
  };

  const token = await githubToken();
  let metaResp;
  try {
    metaResp = await fetch(META,{headers:token?{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json"}:{},signal:AbortSignal.timeout(8000)});
  } catch (error) {
    return await cachedOrThrow(error);
  }
  if (!metaResp.ok) {
    const e = new Error("GitHub private repository access is not configured (HTTP " + metaResp.status + ").");
    e.code = "GITHUB_SETUP_REQUIRED";
    return await cachedOrThrow(e);
  }
  let meta;
  try { meta = await metaResp.json(); }
  catch (error) { return await cachedOrThrow(error); }
  const ref = meta.default_branch;
  let raw;
  try { raw = await fetchRepoFile("README.md", ref); }
  catch (error) { return await cachedOrThrow(error); }
  const found = new Map();
  const re = /\[[^\]]+\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = re.exec(raw))) {
    const path = m[1];
    if (/^[a-z0-9-]+\/[a-z0-9-]+\.md$/i.test(path) && !path.startsWith("strategy/")) {
      found.set(path, {path, division:divisionFromPath(path), name:cleanName(path)});
    }
  }
  if (!found.size) return await cachedOrThrow(new Error("No agency agents found in GitHub README"));

  const agents=[...found.values()];
  await db.query(
    `INSERT INTO agent_catalog (division,name,path,description,source_ref,updated_at,catalog_checked_at)
     SELECT x.division,x.name,x.path,x.description,x.source_ref,now(),now()
     FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[])
       AS x(division,name,path,description,source_ref)
     ON CONFLICT (path) DO UPDATE SET name=EXCLUDED.name, division=EXCLUDED.division, source_ref=EXCLUDED.source_ref, updated_at=now(), catalog_checked_at=now()`,
    [
      agents.map(a=>a.division),
      agents.map(a=>a.name),
      agents.map(a=>a.path),
      agents.map(()=>"Specialist from Vivekpareek1/agency-agents"),
      agents.map(()=>ref)
    ]
  );
  await db.query("DELETE FROM agent_catalog WHERE NOT (path = ANY($1::text[]))",[[...found.keys()]]);
  await db.query("UPDATE agent_catalog SET catalog_checked_at=now()");
  return found.size;
}

export async function listAgents(search = "", limit = 300) {
  await ensureCatalog();
  if (!search) {
    const r = await db.query("SELECT division,name,path FROM agent_catalog ORDER BY division,name LIMIT $1",[limit]);
    return r.rows;
  }
  const q = `%${search.toLowerCase()}%`;
  const r = await db.query(
    "SELECT division,name,path FROM agent_catalog WHERE lower(name) LIKE $1 OR lower(path) LIKE $1 ORDER BY division,name LIMIT $2",
    [q,limit]
  );
  return r.rows;
}

export async function candidateAgents(task) {
  await ensureCatalog();
  const stop = new Set(["the","and","for","with","how","what","why","can","you","give","tell","please","from","this","that","into","one","short","make","write","need","want","my","is","are","to","of","in","on","a","an","help","me"]);
  const words = String(task||"").toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!stop.has(w));
  const intentRules = [
    {test:/\b(news digest|news|geopolitical|current events|situational awareness|market context|commodity|gold|silver|sanctions|breaking developments)\b/i,names:["x twitter intelligence analyst"]},
    {test:/\b(dns|wifi|wi-fi|internet|router|switch|firewall|vpn|dhcp|network|lan|wan)\b/i,names:["network engineer"]},
    {test:/\b(python|javascript|typescript|bug|debug|refactor|coding|programming|function|code|api|backend|frontend)\b/i,names:["senior developer","code reviewer"]},
    {test:/\b(database|postgres|postgresql|sql|query|index|replication)\b/i,names:["database optimizer","database reliability engineer"]},
    {test:/\b(security|identity|access|mfa|2fa|authentication|password|phishing|privacy)\b/i,names:["identity access engineer","privacy engineer"]},
    {test:/\b(logo|brand|visual|poster|thumbnail|illustration|image|design)\b/i,names:["image prompt engineer","brand guardian","ui designer"]},
    {test:/\b(marketing|campaign|content|social|reel|instagram|tiktok)\b/i,names:["content creator","growth hacker","instagram curator"]},
    {test:/\b(sales|prospect|pipeline|crm|lead|closing)\b/i,names:["account strategist","sales coach"]},
    {test:/\b(deploy|docker|ci|cd|release|server|infrastructure|cloud|monitoring)\b/i,names:["devops automator","sre","platform engineer"]}
  ];
  const rules = intentRules.filter(rule=>rule.test.test(String(task||""))).flatMap(rule=>rule.names);
  const r = await db.query("SELECT division,name,path FROM agent_catalog ORDER BY division,name LIMIT 400");
  const scored = r.rows.map(a => {
    const name=a.name.toLowerCase();
    const tokens=new Set((a.name+" "+a.path.replace(/\.md$/,"").replace(/\//g," ")).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    let score=0;
    for(const w of words) if(tokens.has(w)) score+=w.length>=6?4:2;
    if(rules.includes(name)) score+=name==="x twitter intelligence analyst"?30:20;
    if(String(task||"").toLowerCase().includes(name)) score+=30;
    return {...a,score};
  }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  return scored;
}

export async function loadAgent(path) {
  // Cached specialist instructions avoid repeated GitHub API calls and reduce rate-limit failures.
  const cached = await db.query("SELECT instructions,source_ref,instructions_updated_at FROM agent_catalog WHERE path=$1",[path]);
  if(!cached.rows.length) throw new Error("Specialist is not present in the catalogue.");
  const cachedContent=typeof cached.rows[0].instructions==="string"?cached.rows[0].instructions:"";
  const cachedAt=cached.rows[0].instructions_updated_at?new Date(cached.rows[0].instructions_updated_at).getTime():0;
  if(cachedContent.trim() && Date.now()-cachedAt<24*3600*1000) return cachedContent;
  try {
    const content = await fetchRepoFile(path, cached.rows[0].source_ref || "main");
    await db.query("UPDATE agent_catalog SET instructions=$1,instructions_updated_at=now() WHERE path=$2",[content,path]);
    return content;
  } catch(error) {
    // A stale instruction cache is better than failing the whole chat during a GitHub outage.
    if(cachedContent.trim()) {
      console.warn("Using cached specialist instructions after source refresh failed.");
      return cachedContent;
    }
    throw error;
  }
}