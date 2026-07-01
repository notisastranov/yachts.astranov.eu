/* AstranoV Yacht AI Booking CLI — conversational match engine */
window.YachtAiCli = (() => {
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
      this.messages.push({
        role: 'navigator',
        text: 'AstranoV NAVIGATOR online. Forget form grids — tell me your voyage in plain language. I match yachts, crew, and budget in real time, then transmit to your booking officer.',
        kind: 'hero',
      });
      this.messages.push({
        role: 'navigator',
        text: 'Try: "Motor yacht Rhodes 15–22 July, 8 guests, budget 45k, need Greek-speaking crew."',
        kind: 'hint',
      });
      this.stage = 'collect';
    }

    async ingest(text) {
      const t = (text || '').trim();
      if (!t) return;
      this.messages.push({ role: 'user', text: t });
      this.demand = parseDemand(t, this.demand);
      if (this.stage === 'greet') this.stage = 'collect';

      if (this.demand._confirmIntent && this.stage === 'confirm') {
        await this.transmit();
        return;
      }

      const miss = missingFields(this.demand, 'match');
      if (miss.length && this.stage !== 'contact' && this.stage !== 'confirm') {
        this.stage = 'collect';
        this.messages.push({ role: 'navigator', text: nextPrompt(miss, this.demand), kind: 'ask' });
        return;
      }

      if (this.stage !== 'contact' && this.stage !== 'confirm' && this.stage !== 'refine') {
        await this.runMatch();
      }

      if (!this.demand.crew_acknowledged) {
        this.stage = 'refine';
        this.messages.push({
          role: 'navigator',
          text: 'Yachts 13 m+ require minimum 3 crew — your quote includes crew costs. Reply "crew acknowledged" or tap the chip below.',
          kind: 'policy',
        });
        return;
      }

      const cMiss = missingFields(this.demand, 'contact');
      if (cMiss.length) {
        this.stage = 'contact';
        this.messages.push({ role: 'navigator', text: nextPrompt(cMiss, this.demand), kind: 'ask' });
        return;
      }

      this.stage = 'confirm';
      const best = this.matchResult?.best;
      this.messages.push({
        role: 'navigator',
        text: best
          ? `Match locked: ${formatMatchBrief(best)}. Say "transmit to booking officer" to send.`
          : 'No perfect match — adjust with suggestions below, or I can still forward your request to the officer.',
        kind: best ? 'match' : 'warn',
      });
    }

    async runMatch() {
      this.stage = 'match';
      this.messages.push({ role: 'navigator', text: 'Scanning fleet · crew pools · availability…', kind: 'scan' });
      const run = this.opts.runMatch;
      if (!run) {
        this.matchResult = null;
        this.messages.push({ role: 'navigator', text: 'Matcher offline — configure Supabase to enable live matching.', kind: 'warn' });
        return;
      }
      try {
        this.matchResult = await run({ ...this.demand });
        this.suggestions = buildSuggestions(this.demand, this.matchResult, this.opts.yachts?.() || []);
        const best = this.matchResult?.best;
        if (best) {
          this.demand.yacht_id = best.supply?.id || best.supply?.metadata?.legacy_yachting_id || null;
          this.messages.push({ role: 'navigator', text: `✦ ${formatMatchBrief(best)}`, kind: 'match' });
        } else {
          this.messages.push({
            role: 'navigator',
            text: 'No yacht matched all constraints. I can suggest changes — pick a chip or describe what to flex.',
            kind: 'warn',
          });
        }
      } catch (e) {
        this.messages.push({ role: 'navigator', text: `Match error: ${e.message}`, kind: 'warn' });
      }
    }

    async applySuggestion(id) {
      const s = this.suggestions.find((x) => x.id === id);
      if (!s) return;
      Object.assign(this.demand, s.patch);
      this.messages.push({ role: 'user', text: `[Applied] ${s.label}` });
      await this.runMatch();
    }

    acknowledgeCrew() {
      this.demand.crew_acknowledged = true;
      this.messages.push({ role: 'user', text: 'Crew policy acknowledged.' });
      this.ingest('continue');
    }

    async transmit() {
      if (this.transmitting) return;
      this.transmitting = true;
      this.stage = 'sent';
      this.messages.push({ role: 'navigator', text: '◈ Transmitting charter package to Booking Officer…', kind: 'transmit' });
      try {
        const payload = {
          ...this.demand,
          yacht_id: this.demand.yacht_id || this.matchResult?.best?.supply?.id || null,
          message: this.demand.message || `AI charter request: ${formatMatchBrief(this.matchResult?.best)}`,
          crew_ack: this.demand.crew_acknowledged,
          desired_characteristics: this.demand.traits || '',
        };
        await this.opts.submitBooking(payload);
        this.messages.push({
          role: 'navigator',
          text: '✓ Request transmitted. Your booking officer will respond with offers. Track status in the Customer tab.',
          kind: 'success',
        });
      } catch (e) {
        this.messages.push({ role: 'navigator', text: `Transmission failed: ${e.message}`, kind: 'warn' });
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
          <div class="ai-cli-badge">WORLD FIRST</div>
          <h2 class="ai-cli-title">AstranoV AI Booking Engine</h2>
          <p class="ai-cli-sub">No forms. Speak your voyage. We match · suggest · transmit.</p>
        </div>
        <div class="ai-cli-radar">
          ${fields.map(([k, v]) => `<div class="ai-field-chip ${v !== '—' ? 'filled' : ''}"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}
        </div>
        <div class="ai-cli-log" id="aiCliLog">
          ${msgs.map((m) => `<div class="ai-msg ai-msg-${m.role} ai-kind-${m.kind || 'default'}"><span class="ai-msg-label">${m.role === 'user' ? 'YOU' : 'NAVIGATOR'}</span><p>${esc(m.text)}</p></div>`).join('')}
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
      brain.acknowledgeCrew();
      await brain.ingest('continue');
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