// Browser stand-in for window.hatchable.auth used by the unchanged front-end files.
(function () {
  async function call(url, body) {
    const r = await fetch(url, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.message || "Request failed"); e.status = r.status; throw e; }
    return d;
  }
  window.hatchable = { auth: {
    getSession: () => call("/auth/session").then(d => (d.user ? { user: d.user } : null)).catch(() => null),
    startLogin: async () => ({ has_passkey: false }),
    verifyCode: ({ email, code }) => call("/auth/login", { email, code }),
    signOut: () => call("/auth/logout", {}),
    supportsPasskeys: () => false
  } };
})();
