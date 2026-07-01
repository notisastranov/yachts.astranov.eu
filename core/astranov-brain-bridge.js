/* Astranov Brain bridge — Booker agent on central ACI edge function */
window.AstranovBrainBridge = {
  agentId: 'booker',
  brainId: 'astranov',

  config(cfg) {
    const c = cfg || {};
    return {
      supabaseUrl: c.supabaseUrl || window.ASTRANOV_CENTRAL_DB?.supabaseUrl,
      supabaseAnonKey: c.supabaseAnonKey || window.ASTRANOV_CENTRAL_DB?.supabaseAnonKey,
      siteId: c.siteId || 'yachts',
    };
  },

  async authHeaders(cfg) {
    const key = cfg.supabaseAnonKey;
    if (!key) throw new Error('Supabase anon key missing');
    const headers = { 'Content-Type': 'application/json', apikey: key };
    const bridge = window.AstranovAuthBridge;
    if (bridge?.ensureSession) {
      const session = await bridge.ensureSession();
      headers.Authorization = 'Bearer ' + (session?.access_token || key);
    } else {
      headers.Authorization = 'Bearer ' + key;
    }
    return headers;
  },

  matchSummary(matchResult) {
    const best = matchResult?.best;
    if (!best) return null;
    return {
      best_name: best.supply?.name || best.supply?.title || 'Yacht',
      total: Math.round(best.total || 0),
      days: best.days,
      minimum_crew: best.minimum_crew,
      passengers: best.passengers,
    };
  },

  async chat(opts = {}) {
    const cfg = this.config(opts.config);
    if (!cfg.supabaseUrl) throw new Error('Astranov Brain URL not configured');
    const url = cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/aci';
    const headers = await this.authHeaders(cfg);
    const body = {
      mode: 'booker_chat',
      message: opts.message,
      site_id: cfg.siteId,
      stage: opts.stage || 'collect',
      demand: opts.demand || {},
      match: this.matchSummary(opts.matchResult),
      suggestions: (opts.suggestions || []).map((s) => ({ id: s.id, label: s.label })),
      history: (opts.history || []).slice(-10),
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 45000);
    try {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.text) throw new Error(j.error || `Brain HTTP ${r.status}`);
      return {
        text: j.text || j.response || '',
        patch: j.patch || null,
        action: j.action || 'reply',
        agent: j.agent || this.agentId,
        brain: j.brain || this.brainId,
        via: j.via || 'astranov',
        ok: j.ok !== false,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};