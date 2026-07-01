/* AstranoV Yacht — role portals: shipowner, crew, customer, officer */
window.YachtPortals = {
  CREW_ROLES: ['captain', 'vice_captain', 'cadet', 'chef', 'hostess', 'engineer'],
  CREW_ROLE_LABELS: {
    captain: 'Captain',
    vice_captain: 'Vice Captain',
    cadet: 'Deck / Cadet',
    chef: 'Chef',
    hostess: 'Hostess',
    engineer: 'Engineer',
  },

  async listCrewProfiles(supa, table) {
    if (!supa) return [];
    const { data, error } = await supa.from(table).select('*').eq('active', true).order('display_name');
    if (error) throw error;
    return data || [];
  },

  async upsertCrewProfile(supa, table, data, userId) {
    if (!supa) throw new Error('Database not configured.');
    const row = {
      id: data.id || undefined,
      user_id: userId || null,
      display_name: data.display_name,
      role: data.role,
      rank: data.rank || null,
      cv_text: data.cv_text || null,
      cv_url: data.cv_url || null,
      languages: Array.isArray(data.languages) ? data.languages : String(data.languages || '').split(',').map((x) => x.trim()).filter(Boolean),
      certifications: Array.isArray(data.certifications) ? data.certifications : [],
      rate_per_day_eur: data.rate_per_day_eur != null ? +data.rate_per_day_eur : null,
      available_from: data.available_from || null,
      available_to: data.available_to || null,
      active: true,
    };
    const { error } = await supa.from(table).upsert(row);
    if (error) throw error;
    return row;
  },

  crewCard(c, esc) {
    const langs = (c.languages || []).join(', ');
    const avail = c.available_from && c.available_to
      ? `${c.available_from} → ${c.available_to}`
      : c.available_from ? `from ${c.available_from}` : 'Flexible';
    return `<article class="card"><div class="head"><div><h3>${esc(c.display_name)}</h3><div class="muted">${esc(this.CREW_ROLE_LABELS[c.role] || c.role)}${c.rank ? ` · ${esc(c.rank)}` : ''}</div></div>${c.rate_per_day_eur ? `<div class="price">${c.rate_per_day_eur}€/d</div>` : ''}</div><div class="chips"><span class="chip gold">${esc(avail)}</span>${langs ? `<span class="chip">${esc(langs)}</span>` : ''}</div>${c.cv_text ? `<p class="muted">${esc(c.cv_text.slice(0, 220))}${c.cv_text.length > 220 ? '…' : ''}</p>` : ''}</article>`;
  },

  shipownerFleetCard(y, esc, effectiveMinCrew, money, chars, availabilityLabel) {
    const minC = effectiveMinCrew(y);
    return `<article class="card"><div class="head"><div><h3>${esc(y.name)}</h3><div class="muted">${esc(y.yacht_type || 'Yacht')}${y.length_m ? ` · ${y.length_m} m` : ''} · min crew ${minC}</div></div><div class="price">${money(y.price_week, y.currency)}/wk</div></div><div class="chips"><span class="chip gold">${availabilityLabel(y)}</span>${chars(y.characteristics).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></article>`;
  },
};