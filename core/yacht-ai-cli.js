/* AstranoV Yacht AI Booking CLI — Booker agent on Astranov Brain */
window.YachtAiCli = (() => {
  const AGENT = 'booker';
  const BRAIN = 'astranov';
  const STAGES = ['greet', 'collect', 'match', 'refine', 'contact', 'confirm', 'sent'];
  const YACHT_TYPES = ['Motor Yacht', 'Sailing Yacht', 'Catamaran', 'Eco Yacht', 'Superyacht'];
  const MATCH_REQUIRED = ['start_date', 'end_date', 'guests'];
  const CONTACT_REQUIRED = ['client_name', 'client_email', 'client_phone'];

  const esc = (s) => (s ?? '').toString().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const money = (n, c = 'EUR') => n ? `${Number(n).toLocaleString('en-US')} ${c}` : '—';

  function parseDates(text) {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/g) || [];
    if (iso.length >= 2) return { start_date: iso[0], end_date: iso[1] };
    if (iso.length === 1) return { start_date: iso[0], end_date: null };
    const range = text.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/g);
    if (range?.length >= 2) {
      const toIso = (s) => { const p = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/); return p ? `${p[3]}-${p[2].padStart(2, '0')}-${p[1].padStart(2, '0')}` : null; };
      return { start_date: toIso(range[0]), end_date: toIso(range[1]) };
    }
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const m1 = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:\s*[-–to]+\s*(\d{1,2}))?/i);
    if (m1) {
      const y = (text.match(/\b(20\d{2})\b/) || [])[1] || String(new Date().getFullYear());
      const mo = months[m1[1].slice(0, 3).toLowerCase()];
      const d1 = String(m1[2]).padStart(2, '0');
      const d2 = m1[3] ? String(m1[3]).padStart(2, '0') : null;
      return { start_date: `${y}-${String(mo).padStart(2, '0')}-${d1}`, end_date: d2 ? `${y}-${String(mo).padStart(2, '0')}-${d2}` : null };
    }
    if (/\bnext week\b/i.test(text)) return { start_date: plusDays(7), end_date: plusDays(14) };
    if (/\bnext month\b/i.test(text)) return { start_date: plusDays(28), end_date: plusDays(35) };
    return {};
  }

  function parseDemand(text, prev = {}) {
    const d = { ...prev };
    const low = text.toLowerCase();
    Object.assign(d, parseDates(text));
    const guests = text.match(/(\d+)\s*(guests?|people|pax|persons?)/i) || text.match(/party of\s*(\d+)/i) || text.match(/we(?:'re| are)\s*(\d+)/i);
    if (guests) d.guests = +guests[1];
    const cabins = text.match(/(\d+)\s*cabins?/i);
    if (cabins) d.cabins = +cabins[1];
    const budget = text.match(/budget\s*(?:of\s*)?(?:€|eur\s*)?(\d[\d.,]*)\s*(k|m)?/i)
      || text.match(/(?:€|eur\s*)(\d[\d.,]*)\s*(k|m)?/i)
      || text.match(/(\d[\d.,]*)\s*(k|m)\s*(?:eur|€|budget)?/i);
    if (budget) {
      let n = parseFloat(budget[1].replace(/,/g, ''));
      if ((budget[2] || '').toLowerCase() === 'k') n *= 1000;
      if ((budget[2] || '').toLowerCase() === 'm') n *= 1000000;
      d.budget = Math.round(n);
    }
    for (const t of YACHT_TYPES) {
      if (low.includes(t.toLowerCase()) || low.includes(t.split(' ')[0].toLowerCase())) d.yacht_type = t;
    }
    if (/\bmotor\b/.test(low) && !d.yacht_type) d.yacht_type = 'Motor Yacht';
    if (/\bcatamaran\b/.test(low)) d.yacht_type = 'Catamaran';
    if (/\bsail(ing)?\b/.test(low)) d.yacht_type = 'Sailing Yacht';
    if (/\bsuper\s*yacht\b/.test(low)) d.yacht_type = 'Superyacht';
    const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (email) d.client_email = email[0];
    const phone = text.match(/(?:\+?\d[\d\s\-()]{7,}\d)/);
    if (phone) d.client_phone = phone[0].replace(/\s+/g, ' ').trim();
    const name = text.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (name) d.client_name = name[1];
    if (/crew|captain|chef|hostess/.test(low) && !d.crew_notes) d.crew_notes = text.trim();
    if (/\b(jacuzzi|eco|rhodes|kos|mykonos|water toys|privacy)\b/i.test(text)) {
      const traits = (d.traits || '') + ' ' + text;
      d.traits = traits.trim();
    }
    if (/confirm|send|book it|transmit|submit|yes.*(book|send)/i.test(text)) d._confirmIntent = true;
    if (/acknowledge|crew included|mandatory crew/i.test(text)) d.crew_acknowledged = true;
    return d;
  }

  function missingFields(d, phase = 'match') {
    const req = phase === 'contact' ? CONTACT_REQUIRED : MATCH_REQUIRED;
    return req.filter((k) => !d[k]);
  }

  function nextPrompt(missing, d) {
    const map = {
      start_date: 'When does your voyage begin? (e.g. 2026-07-15 or "July 15–22")',
      end_date: 'And when do you return?',
      guests: 'How many guests will be aboard?',
      client_name: 'Your full name for the charter agreement?',
      client_email: 'Best email for the booking officer to reach you?',
      client_phone: 'Mobile or VHF contact number?',
    };
    return map[missing[0]] || 'Tell me more about your ideal charter.';
  }

  function buildSuggestions(demand, result, yachts) {
    const out = [];
    if (result?.best) return out;
    const g = +demand.guests || 0;
    const fits = (yachts || []).filter((y) => !g || y.guest_capacity >= g);
    if (demand.budget && fits.length) {
      const cheapest = fits.reduce((a, y) => (!a || (y.price_week || 999999) < (a.price_week || 999999)) ? y : a, null);
      if (cheapest?.price_week && cheapest.price_week > demand.budget) {
        out.push({
          id: 'raise-budget',
          label: `Raise budget to ${money(cheapest.price_week)}/wk`,
          patch: { budget: cheapest.price_week },
        });
      }
    }
    if (demand.start_date && demand.end_date) {
      const s = new Date(demand.start_date);
      const e = new Date(demand.end_date);
      s.setDate(s.getDate() - 3);
      e.setDate(e.getDate() + 3);
      out.push({
        id: 'flex-dates',
        label: 'Try ±3 flexible days',
        patch: { start_date: s.toISOString().slice(0, 10), end_date: e.toISOString().slice(0, 10) },
      });
    }
    if (demand.yacht_type) {
      out.push({ id: 'any-type', label: 'Search any yacht type', patch: { yacht_type: '' } });
    }
    if (!demand.cabins) out.push({ id: 'drop-cabins', label: 'Drop cabin minimum', patch: { cabins: 0 } });
    return out.slice(0, 4);
  }

  function formatMatchBrief(m) {
    if (!m) return 'No match yet.';
    const y = m.supply?.name || 'Yacht';
    const crew = (m.resources || []).map((r) => (r.display_name || r.role)).join(', ');
    return `${y} · ${m.days}d · ${m.passengers} pax · ${money(Math.round(m.total))} total${crew ? ` · crew: ${crew}` : ''}`;
  }

  class Brain {
    constructor(opts) {
      this.opts = opts;
      this.demand = { guests: 8, crew_acknowledged: false };
      this.stage = 'greet';
      this.messages = [];
      this.matchResult = null;
      this.suggestions = [];
      this.transmitting = false;
    }

    greet() {
      this.brainOnline = !!this.opts.brain;
      this.messages.push({
        role: AGENT,
        text: 'Booker here — charter agent on the Astranov Brain. No form grids: tell me your voyage and I match yachts, crew, and budget, then transmit to your booking officer.',
        kind: 'hero',
      });
      this.messages.push({
        role: AGENT,
        text: this.brainOnline
          ? 'Astranov Brain connected. Try: "Motor yacht Rhodes 15–22 July, 8 guests, budget 45k, Greek-speaking crew."'
          : 'Brain reconnecting — local matcher active. Describe dates, guests, budget.',
        kind: 'hint',
      });
      this.stage = 'collect';
    }

    sayBooker(text, kind = 'default') {
      this.messages.push({ role: AGENT, text, kind });
    }

    applyPatch(patch) {
      if (!patch || typeof patch !== 'object') return;
      Object.keys(patch).forEach((k) => {
        const v = patch[k];
        if (v != null && v !== '') this.demand[k] = v;
      });
    }

    async callAstranovBrain(message) {
      const bridge = this.opts.brain;
      if (!bridge?.chat) return null;
      this.thinking = true;
      try {
        return await bridge.chat({
          config: this.opts.config,
          message,
          demand: this.demand,
          stage: this.stage,
          matchResult: this.matchResult,
          suggestions: this.suggestions,
          history: this.messages.filter((m) => m.role === 'user' || m.role === AGENT).slice(-10)
            .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        });
      } catch (e) {
        this.brainOnline = false;
        return { text: '', action: 'reply', error: e.message };
      } finally {
        this.thinking = false;
      }
    }

    async advance(brainAction) {
      const action = (brainAction || '').toLowerCase();
      if (action === 'transmit' || (this.demand._confirmIntent && this.stage === 'confirm')) {
        await this.transmit();
        return;
      }
      if (action === 'ack_crew') this.demand.crew_acknowledged = true;

      const miss = missingFields(this.demand, 'match');
      if (miss.length && this.stage !== 'contact' && this.stage !== 'confirm' && action !== 'match') {
        this.stage = 'collect';
        if (!this._brainSpoke) this.sayBooker(nextPrompt(miss, this.demand), 'ask');
        return;
      }

      if (action === 'match' || (!miss.length && this.stage !== 'contact' && this.stage !== 'confirm' && this.stage !== 'refine')) {
        await this.runMatch(false);
      }

      if (!this.demand.crew_acknowledged && action !== 'contact' && action !== 'transmit') {
        this.stage = 'refine';
        if (!this._brainSpoke) {
          this.sayBooker('Yachts 13 m+ require minimum 3 crew — included in your quote. Acknowledge below or say "crew acknowledged".', 'policy');
        }
        return;
      }

      const cMiss = missingFields(this.demand, 'contact');
      if (cMiss.length && action !== 'transmit') {
        this.stage = 'contact';
        if (!this._brainSpoke) this.sayBooker(nextPrompt(cMiss, this.demand), 'ask');
        return;
      }

      this.stage = 'confirm';
      if (!this._brainSpoke) {
        const best = this.matchResult?.best;
        this.sayBooker(
          best
            ? `Match locked: ${formatMatchBrief(best)}. Say "transmit to booking officer" when ready.`
            : 'No perfect match yet — use suggestions or I can still forward your request.',
          best ? 'match' : 'warn',
        );
      }
    }

    async ingest(text) {
      const t = (text || '').trim();
      if (!t || t === 'continue') {
        if (t === 'continue') await this.advance('reply');
        return;
      }
      this.messages.push({ role: 'user', text: t });
      this.demand = parseDemand(t, this.demand);
      if (this.stage === 'greet') this.stage = 'collect';
      this._brainSpoke = false;

      if (this.demand._confirmIntent && this.stage === 'confirm') {
        await this.transmit();
        return;
      }

      const brain = await this.callAstranovBrain(t);
      if (brain?.text) {
        this._brainSpoke = true;
        this.brainOnline = true;
        this.sayBooker(brain.text, brain.action === 'match' ? 'brain' : 'default');
        this.applyPatch(brain.patch);
        if (brain.patch?.crew_acknowledged) this.demand.crew_acknowledged = true;
      } else if (brain?.error && !this.messages.some((m) => m.kind === 'warn' && /brain/i.test(m.text))) {
        this.sayBooker('Astranov Brain momentarily offline — Booker local matcher engaged.', 'warn');
      }

      await this.advance(brain?.action);
    }

    async runMatch(announce = true) {
      this.stage = 'match';
      if (announce) this.sayBooker('Scanning fleet · crew pools · availability…', 'scan');
      const run = this.opts.runMatch;
      if (!run) {
        this.matchResult = null;
        if (announce) this.sayBooker('Matcher offline — configure Supabase to enable live matching.', 'warn');
        return;
      }
      try {
        this.matchResult = await run({ ...this.demand });
        this.suggestions = buildSuggestions(this.demand, this.matchResult, this.opts.yachts?.() || []);
        const best = this.matchResult?.best;
        if (best) {
          this.demand.yacht_id = best.supply?.id || best.supply?.metadata?.legacy_yachting_id || null;
          if (announce && !this._brainSpoke) this.sayBooker(`✦ ${formatMatchBrief(best)}`, 'match');
        } else if (announce && !this._brainSpoke) {
          this.sayBooker('No yacht matched all constraints — pick a suggestion chip or tell me what to flex.', 'warn');
        }
      } catch (e) {
        if (announce) this.sayBooker(`Match error: ${e.message}`, 'warn');
      }
    }

    async applySuggestion(id) {
      const s = this.suggestions.find((x) => x.id === id);
      if (!s) return;
      Object.assign(this.demand, s.patch);
      this.messages.push({ role: 'user', text: `[Applied] ${s.label}` });
      await this.runMatch();
    }

    async acknowledgeCrew() {
      this.demand.crew_acknowledged = true;
      this.messages.push({ role: 'user', text: 'Crew policy acknowledged.' });
      this._brainSpoke = false;
      await this.advance('ack_crew');
    }

    async transmit() {
      if (this.transmitting) return;
      this.transmitting = true;
      this.stage = 'sent';
      this.sayBooker('◈ Booker transmitting charter package to Booking Officer via Astranov Brain…', 'transmit');
      try {
        const payload = {
          ...this.demand,
          yacht_id: this.demand.yacht_id || this.matchResult?.best?.supply?.id || null,
          message: this.demand.message || `Booker · Astranov Brain charter: ${formatMatchBrief(this.matchResult?.best)}`,
          crew_ack: this.demand.crew_acknowledged,
          desired_characteristics: this.demand.traits || '',
        };
        await this.opts.submitBooking(payload);
        this.sayBooker('✓ Transmitted. Your booking officer will respond with offers — track status in the Customer tab.', 'success');
      } catch (e) {
        this.sayBooker(`Transmission failed: ${e.message}`, 'warn');
        this.stage = 'confirm';
      } finally {
        this.transmitting = false;
      }
    }

    fieldSnapshot() {
      const d = this.demand;
      return [
        ['Dates', d.start_date && d.end_date ? `${d.start_date} → ${d.end_date}` : '—'],
        ['Guests', d.guests || '—'],
        ['Budget', d.budget ? money(d.budget) : '—'],
        ['Yacht type', d.yacht_type || 'Any'],
        ['Crew notes', d.crew_notes ? '✓' : '—'],
        ['Contact', d.client_name ? d.client_name : '—'],
      ];
    }
  }

  function renderUI(root, brain) {
    if (!root) return;
    const fields = brain.fieldSnapshot();
    const suggestions = brain.suggestions || [];
    const msgs = brain.messages.slice(-12);
    root.innerHTML = `
      <div class="ai-cli-wrap">
        <div class="ai-cli-hero">
          <div class="ai-cli-badge">ASTRANOV BRAIN</div>
          <h2 class="ai-cli-title">Agent Booker</h2>
          <p class="ai-cli-sub">The first AI booking engine · no forms · match · suggest · transmit</p>
          <p class="ai-cli-brain-status ${brain.brainOnline !== false ? 'online' : 'offline'}">${brain.thinking ? 'Booker thinking…' : (brain.brainOnline !== false ? 'Booker · Astranov Brain online' : 'Booker · local matcher')}</p>
        </div>
        <div class="ai-cli-radar">
          ${fields.map(([k, v]) => `<div class="ai-field-chip ${v !== '—' ? 'filled' : ''}"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}
        </div>
        <div class="ai-cli-log" id="aiCliLog">
          ${msgs.map((m) => `<div class="ai-msg ai-msg-${m.role} ai-kind-${m.kind || 'default'}"><span class="ai-msg-label">${m.role === 'user' ? 'YOU' : 'BOOKER'}</span><p>${esc(m.text)}</p></div>`).join('')}
        </div>
        ${suggestions.length ? `<div class="ai-suggestions">${suggestions.map((s) => `<button type="button" class="ai-sug" data-sug="${esc(s.id)}">${esc(s.label)}</button>`).join('')}</div>` : ''}
        <div class="ai-cli-actions">
          ${!brain.demand.crew_acknowledged ? '<button type="button" class="ai-chip-btn" id="aiAckCrew">Acknowledge mandatory crew</button>' : ''}
          ${brain.stage === 'confirm' || brain.stage === 'refine' ? '<button type="button" class="ai-transmit" id="aiTransmit">Transmit to Booking Officer</button>' : ''}
        </div>
        <form class="ai-cli-input-row" id="aiCliForm">
          <textarea id="aiCliInput" rows="2" placeholder="Describe your charter… dates, guests, budget, crew wishes"></textarea>
          <button type="submit">Send</button>
        </form>
      </div>`;
    const log = root.querySelector('#aiCliLog');
    if (log) log.scrollTop = log.scrollHeight;
    root.querySelector('#aiCliForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = root.querySelector('#aiCliInput');
      const v = inp?.value?.trim();
      if (!v) return;
      inp.value = '';
      await brain.ingest(v);
      renderUI(root, brain);
    });
    root.querySelector('#aiAckCrew')?.addEventListener('click', async () => {
      await brain.acknowledgeCrew();
      renderUI(root, brain);
    });
    root.querySelector('#aiTransmit')?.addEventListener('click', async () => {
      brain.demand._confirmIntent = true;
      await brain.transmit();
      renderUI(root, brain);
    });
    root.querySelectorAll('[data-sug]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await brain.applySuggestion(btn.dataset.sug);
        renderUI(root, brain);
      });
    });
  }

  return {
    create(opts) {
      const brain = new Brain(opts);
      brain.greet();
      return brain;
    },
    render(root, brain) { renderUI(root, brain); },
    parseDemand,
    buildSuggestions,
    formatMatchBrief,
  };
})();