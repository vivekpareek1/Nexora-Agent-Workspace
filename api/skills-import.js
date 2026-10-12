import { db, config } from "hatchable";

export const access = "user";
export const methods = ["POST"];
const REPO = "vivekpareek1/Agent-skill";
const MAX_SKILLS = 30;

function titleFromPath(path) {
  const folder = path.split("/")[1] || "Imported Skill";
  return folder.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : "").join(" ").slice(0, 60);
}
function descriptionFrom(content) {
  const frontmatter = String(content || "").match(/^---\s*\n([\s\S]*?)\n---/);
  const match = frontmatter?.[1]?.match(/^description:\s*(.+)$/m);
  if (match) return match[1].trim().slice(0, 280);
  const lines = String(content || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const fence = String.fromCharCode(96).repeat(3);
  const line = lines.find(s => !s.startsWith("#") && !s.startsWith("---") && !s.startsWith(fence) && s.length > 25);
  return (line || "Imported from the Agent-skill GitHub repository.").replace(/^[-*]\s*/, "").slice(0, 280);
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadSkill(path, headers) {
  let lastError = "unknown error";
  const url = "https://api.github.com/repos/" + REPO + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=main";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
      if (!r.ok) {
        lastError = "HTTP " + r.status;
        if (![429, 500, 502, 503, 504].includes(r.status) || attempt === 2) break;
        const retryAfter = Number(r.headers.get("retry-after") || 0);
        await wait(Math.min(1500, retryAfter > 0 ? retryAfter * 1000 : 250 * (attempt + 1)));
        continue;
      }
      const data = await r.json();
      if (data.encoding !== "base64" || typeof data.content !== "string") {
        lastError = "unexpected content format";
        break;
      }
      const binary = atob(data.content.replace(/\s/g, ""));
      const content = new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0))).slice(0, 5000);
      if (!content.trim()) {
        lastError = "empty skill file";
        break;
      }
      return { ok: true, skill: { name: ("Agent-skill: " + titleFromPath(path)).slice(0, 80), description: descriptionFrom(content), instructions: content } };
    } catch (error) {
      lastError = String(error?.message || "network error").slice(0, 180);
      if (attempt < 2) await wait(250 * (attempt + 1));
    }
  }
  return { ok: false, path, error: lastError };
}

export default async function(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "AUTH_REQUIRED", message: "Please sign in." });
  try {
    const token = await config.get("GITHUB_TOKEN").catch(() => null);
    if (!token) return res.status(412).json({ error: "GITHUB_TOKEN_REQUIRED", message: "Connect a GitHub token with read access to the Agent-skill repository in Hatchable Setup." });
    const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Nexora-Agent-Workspace", "Authorization": "Bearer " + token };
    const treeResponse = await fetch("https://api.github.com/repos/" + REPO + "/git/trees/main?recursive=1", {
      headers,
      signal: AbortSignal.timeout(7000)
    });
    if (!treeResponse.ok) {
      const retryable = [429, 500, 502, 503, 504].includes(treeResponse.status);
      return res.status(retryable ? 503 : 502).json({
        error: "SKILL_REPOSITORY_UNAVAILABLE",
        message: retryable ? "GitHub is temporarily busy. Wait briefly and retry." : "Agent-skill repository could not be read (HTTP " + treeResponse.status + ")."
      });
    }
    const tree = await treeResponse.json();
    const paths = (tree.tree || []).filter(x => x.type === "blob" && /^skills\/[a-z0-9-]+\/SKILL\.md$/i.test(x.path)).map(x => x.path).slice(0, MAX_SKILLS);
    if (!paths.length) return res.status(404).json({ error: "NO_SKILLS_FOUND", message: "No skills/SKILL.md files were found in the repository." });

    const results = [];
    for (let i = 0; i < paths.length; i += 4) {
      results.push(...await Promise.all(paths.slice(i, i + 4).map(path => loadSkill(path, headers))));
    }
    const skills = results.filter(x => x.ok).map(x => x.skill);
    const failed = results.filter(x => !x.ok).map(x => ({ path: x.path, error: x.error }));
    if (!skills.length) return res.status(502).json({ error: "SKILL_IMPORT_FAILED", message: "No skills could be downloaded. Check GitHub access and retry.", discovered: paths.length, failed });

    const existing = await db.query("SELECT name FROM workspace_skills WHERE user_id=$1", [userId]);
    const names = new Set(existing.rows.map(x => x.name));
    let imported = 0, skipped = 0;
    const importedNames = [];
    for (const skill of skills) {
      if (names.has(skill.name)) { skipped++; continue; }
      await db.query("INSERT INTO workspace_skills(user_id,name,description,instructions,enabled) SELECT $1,$2,$3,$4,TRUE WHERE NOT EXISTS (SELECT 1 FROM workspace_skills WHERE user_id=$1 AND name=$2)", [userId, skill.name, skill.description, skill.instructions]);
      names.add(skill.name); importedNames.push(skill.name); imported++;
    }
    return res.json({
      ok: true,
      repository: "https://github.com/" + REPO,
      discovered: paths.length,
      downloaded: skills.length,
      failed_count: failed.length,
      failed,
      imported,
      skipped,
      names: importedNames,
      partial: failed.length > 0,
      note: failed.length ? "Some skills could not be fetched. Retry to import any missing skills; already imported skills will be skipped." : "Imported skills are enabled; Nexora selects relevant skills for each task."
    });
  } catch (e) {
    console.error("Agent-skill import failed:", e?.message || "IMPORT_ERROR");
    return res.status(502).json({ error: "SKILL_IMPORT_FAILED", message: "Skills could not be imported. Check the repository and retry." });
  }
}