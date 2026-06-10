(() => {
  'use strict';

  const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
  const CACHE_KEY = 'vm2026:data:v1';
  const FAVORITE_TEAMS_KEY = 'vm2026:favTeams:v1';
  const FAVORITE_MATCHES_KEY = 'vm2026:favMatches:v1';
  const DEFAULT_TZ = 'Europe/Copenhagen';

  const FALLBACK_DATA = {
    name: 'World Cup 2026',
    fallback: true,
    matches: [
      { round: 'Matchday 1', date: '2026-06-11', time: '13:00 UTC-6', team1: 'Mexico', team2: 'South Africa', group: 'Group A', ground: 'Mexico City' },
      { round: 'Matchday 1', date: '2026-06-11', time: '20:00 UTC-6', team1: 'South Korea', team2: 'Czech Republic', group: 'Group A', ground: 'Guadalajara (Zapopan)' },
      { round: 'Matchday 2', date: '2026-06-12', time: '15:00 UTC-4', team1: 'Canada', team2: 'Bosnia & Herzegovina', group: 'Group B', ground: 'Toronto' },
      { round: 'Matchday 2', date: '2026-06-12', time: '18:00 UTC-7', team1: 'USA', team2: 'Paraguay', group: 'Group D', ground: 'Los Angeles (Inglewood)' },
      { round: 'Final', date: '2026-07-19', time: '15:00 UTC-4', team1: 'W101', team2: 'W102', ground: 'New York/New Jersey (East Rutherford)' }
    ]
  };

  const TEAM_FLAGS = {
    'Algeria': '🇩🇿', 'Argentina': '🇦🇷', 'Australia': '🇦🇺', 'Austria': '🇦🇹', 'Belgium': '🇧🇪',
    'Bosnia & Herzegovina': '🇧🇦', 'Brazil': '🇧🇷', 'Canada': '🇨🇦', 'Cape Verde': '🇨🇻',
    'Colombia': '🇨🇴', 'Croatia': '🇭🇷', 'Curaçao': '🇨🇼', 'Czech Republic': '🇨🇿', 'DR Congo': '🇨🇩',
    'Ecuador': '🇪🇨', 'Egypt': '🇪🇬', 'England': '🏴', 'France': '🇫🇷', 'Germany': '🇩🇪',
    'Ghana': '🇬🇭', 'Haiti': '🇭🇹', 'Iran': '🇮🇷', 'Iraq': '🇮🇶', 'Ivory Coast': '🇨🇮',
    'Japan': '🇯🇵', 'Jordan': '🇯🇴', 'Mexico': '🇲🇽', 'Morocco': '🇲🇦', 'Netherlands': '🇳🇱',
    'New Zealand': '🇳🇿', 'Norway': '🇳🇴', 'Panama': '🇵🇦', 'Paraguay': '🇵🇾', 'Portugal': '🇵🇹',
    'Qatar': '🇶🇦', 'Saudi Arabia': '🇸🇦', 'Scotland': '🏴', 'Senegal': '🇸🇳', 'South Africa': '🇿🇦',
    'South Korea': '🇰🇷', 'Spain': '🇪🇸', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Tunisia': '🇹🇳',
    'Turkey': '🇹🇷', 'Uruguay': '🇺🇾', 'USA': '🇺🇸', 'Uzbekistan': '🇺🇿'
  };

  const ROUND_DA = {
    'Matchday': 'Gruppekamp',
    'Round of 32': '1/16-finale',
    'Round of 16': '1/8-finale',
    'Quarter-final': 'Kvartfinale',
    'Semi-final': 'Semifinale',
    'Match for third place': 'Bronzekamp',
    'Final': 'Finale'
  };

  const els = {
    app: document.getElementById('app'),
    refreshBtn: document.getElementById('refreshBtn'),
    toast: document.getElementById('toast')
  };

  const state = {
    view: 'home',
    data: null,
    matches: [],
    lastUpdated: null,
    dataSource: 'fallback',
    error: null,
    matchFilter: 'all',
    query: '',
    roundFilter: 'all',
    favoriteTeams: new Set(JSON.parse(localStorage.getItem(FAVORITE_TEAMS_KEY) || '[]')),
    favoriteMatches: new Set(JSON.parse(localStorage.getItem(FAVORITE_MATCHES_KEY) || '[]'))
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindNavigation();
    els.refreshBtn.addEventListener('click', () => refreshData(true));
    window.addEventListener('online', () => toast('Du er online igen.'));
    window.addEventListener('offline', () => toast('Offline. Viser gemte data hvis muligt.'));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
    refreshData(false);
  }

  function bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        state.view = button.dataset.view;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === button));
        render();
        els.app.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  async function refreshData(manual) {
    setRefreshLoading(true);
    state.error = null;
    try {
      const bustedUrl = `${DATA_URL}?t=${Date.now()}`;
      const response = await fetch(bustedUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      useData(data, 'OpenFootball');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, lastUpdated: new Date().toISOString(), source: 'OpenFootball' }));
      if (manual) toast('Data opdateret.');
    } catch (error) {
      const cached = readCache();
      if (cached) {
        useData(cached.data, 'gemt cache', cached.lastUpdated);
        state.error = 'Kunne ikke hente nye data. Viser seneste gemte version.';
        if (manual) toast('Kunne ikke hente nye data. Viser gemt version.');
      } else {
        useData(FALLBACK_DATA, 'indbygget fallback');
        state.error = 'Kunne ikke hente data. Viser begrænset fallback.';
        if (manual) toast('Kunne ikke hente data.');
      }
    } finally {
      setRefreshLoading(false);
      render();
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !Array.isArray(parsed.data.matches)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function useData(data, source, lastUpdated = new Date().toISOString()) {
    state.data = data;
    state.matches = (data.matches || []).map((match, index) => normalizeMatch(match, index));
    state.lastUpdated = lastUpdated;
    state.dataSource = source;
  }

  function normalizeMatch(match, index) {
    const kickoff = parseKickoff(match.date, match.time);
    const id = match.num ? String(match.num) : `${match.date}-${match.time || ''}-${match.team1}-${match.team2}-${index}`;
    const score = extractScore(match);
    const isGroup = Boolean(match.group);
    const now = new Date();
    const status = score ? 'result' : kickoff && isSameCopenhagenDate(kickoff, now) ? 'today' : 'scheduled';
    return {
      ...match,
      id,
      index,
      kickoff,
      score,
      isGroup,
      status,
      roundDa: translateRound(match.round),
      groupDa: match.group ? match.group.replace('Group', 'Gruppe') : null
    };
  }

  function parseKickoff(date, time) {
    if (!date) return null;
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return null;
    if (!time) return new Date(Date.UTC(year, month - 1, day, 12, 0));
    const match = String(time).match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return new Date(`${date}T${String(time).slice(0,5)}:00Z`);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const offsetHour = Number(match[3]);
    const sign = offsetHour < 0 ? -1 : 1;
    const offsetMinute = Number(match[4] || 0) * sign;
    return new Date(Date.UTC(year, month - 1, day, hour - offsetHour, minute - offsetMinute));
  }

  function extractScore(match) {
    const candidates = [
      [match.score1, match.score2],
      [match.goals1, match.goals2],
      [match.team1_score, match.team2_score],
      [match.home_score, match.away_score],
      [match.ft1, match.ft2]
    ];

    for (const [a, b] of candidates) {
      if (isNumberLike(a) && isNumberLike(b)) return { a: Number(a), b: Number(b), label: `${a}-${b}` };
    }

    if (Array.isArray(match.score) && match.score.length >= 2 && isNumberLike(match.score[0]) && isNumberLike(match.score[1])) {
      return { a: Number(match.score[0]), b: Number(match.score[1]), label: `${match.score[0]}-${match.score[1]}` };
    }

    if (match.score && typeof match.score === 'object') {
      const ft = match.score.ft || match.score.fulltime || match.score.full_time || match.score.final;
      if (Array.isArray(ft) && ft.length >= 2 && isNumberLike(ft[0]) && isNumberLike(ft[1])) {
        return { a: Number(ft[0]), b: Number(ft[1]), label: `${ft[0]}-${ft[1]}` };
      }
    }

    for (const key of ['score', 'result', 'ft']) {
      if (typeof match[key] === 'string') {
        const found = match[key].match(/(\d+)\s*[-:–]\s*(\d+)/);
        if (found) return { a: Number(found[1]), b: Number(found[2]), label: `${found[1]}-${found[2]}` };
      }
    }
    return null;
  }

  function isNumberLike(value) {
    return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
  }

  function translateRound(round = '') {
    if (round.startsWith('Matchday')) return round.replace('Matchday', ROUND_DA.Matchday);
    return ROUND_DA[round] || round || 'Kamp';
  }

  function render() {
    if (!state.data) return;
    const views = {
      home: renderHome,
      matches: renderMatches,
      groups: renderGroups,
      knockout: renderKnockout,
      favorites: renderFavorites
    };
    els.app.innerHTML = views[state.view] ? views[state.view]() : renderHome();
    bindDynamicEvents();
  }

  function bindDynamicEvents() {
    document.querySelectorAll('[data-go-view]').forEach(el => {
      el.addEventListener('click', () => setView(el.dataset.goView));
    });
    document.querySelectorAll('[data-fav-match]').forEach(el => {
      el.addEventListener('click', () => toggleFavoriteMatch(el.dataset.favMatch));
    });
    document.querySelectorAll('[data-team-chip]').forEach(el => {
      el.addEventListener('click', () => toggleFavoriteTeam(el.dataset.teamChip));
    });
    const search = document.getElementById('matchSearch');
    if (search) {
      search.value = state.query;
      search.addEventListener('input', event => {
        state.query = event.target.value;
        render();
      });
    }
    const round = document.getElementById('roundFilter');
    if (round) {
      round.value = state.roundFilter;
      round.addEventListener('change', event => {
        state.roundFilter = event.target.value;
        render();
      });
    }
    document.querySelectorAll('[data-match-filter]').forEach(el => {
      el.addEventListener('click', () => {
        state.matchFilter = el.dataset.matchFilter;
        render();
      });
    });
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHome() {
    const sorted = sortedMatches();
    const today = sorted.filter(match => match.kickoff && isSameCopenhagenDate(match.kickoff, new Date()));
    const next = sorted.find(match => !match.score && match.kickoff && match.kickoff >= startOfTodayCph()) || sorted.find(match => !match.score);
    const recent = sorted.filter(match => match.score).slice(-3).reverse();
    const favoriteUpcoming = sorted.filter(match => isFavoriteRelated(match) && !match.score).slice(0, 3);
    const groupCount = new Set(state.matches.filter(m => m.group).map(m => m.group)).size;

    return `
      <section class="hero">
        <p class="eyebrow">Kampprogram & resultater</p>
        <h2>VM i Nordamerika – uden bøvl</h2>
        <p>Henter åbne data fra OpenFootball. Ikke livescore, men kampe, grupper og resultater når datakilden bliver opdateret.</p>
        <div class="hero-meta">
          <span class="pill">${state.matches.length} kampe</span>
          <span class="pill">${groupCount || 12} grupper</span>
          <span class="pill">Dansk tid</span>
        </div>
      </section>

      ${state.error ? `<section class="card" style="margin-top:14px"><h3>Data-advarsel</h3><p>${escapeHtml(state.error)}</p></section>` : ''}

      <section class="grid two">
        <div class="stat-card"><span class="stat-value">${today.length}</span><span class="stat-label">kampe i dag</span></div>
        <div class="stat-card"><span class="stat-value">${state.matches.filter(m => m.score).length}</span><span class="stat-label">registrerede resultater</span></div>
      </section>

      <section class="section-head">
        <div><h2>Næste kamp</h2><p>${formatDateLong(next?.kickoff) || 'Afventer data'}</p></div>
        <button class="link-button" data-go-view="matches">Alle kampe</button>
      </section>
      <div class="grid">${next ? renderMatchCard(next) : emptyState('Ingen kamp fundet', 'Datakilden indeholder ingen kommende kampe endnu.')}</div>

      <section class="section-head">
        <div><h2>I dag</h2><p>${formatCopenhagenToday()}</p></div>
      </section>
      <div class="grid">${today.length ? today.map(renderMatchCard).join('') : emptyState('Ingen kampe i dag', 'Der er ikke registreret VM-kampe på dagens dato.')}</div>

      <section class="section-head">
        <div><h2>Seneste resultater</h2><p>Vises når datakilden får resultater</p></div>
      </section>
      <div class="grid">${recent.length ? recent.map(renderMatchCard).join('') : emptyState('Ingen resultater endnu', 'Når kampene er spillet og data opdateres, lander resultaterne her.')}</div>

      <section class="section-head">
        <div><h2>Favoritter</h2><p>Dine valgte hold/kampe</p></div>
        <button class="link-button" data-go-view="favorites">Vælg</button>
      </section>
      <div class="grid">${favoriteUpcoming.length ? favoriteUpcoming.map(renderMatchCard).join('') : emptyState('Ingen favoritter valgt', 'Tryk på stjernen ved en kamp eller vælg favorithold.')}</div>

      ${renderDataCard()}
    `;
  }

  function renderMatches() {
    const rounds = Array.from(new Set(state.matches.map(match => match.round).filter(Boolean)));
    let list = sortedMatches();
    if (state.matchFilter === 'upcoming') list = list.filter(match => !match.score);
    if (state.matchFilter === 'results') list = list.filter(match => match.score);
    if (state.matchFilter === 'today') list = list.filter(match => match.kickoff && isSameCopenhagenDate(match.kickoff, new Date()));
    if (state.roundFilter !== 'all') list = list.filter(match => match.round === state.roundFilter);
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      list = list.filter(match => [match.team1, match.team2, match.group, match.ground, match.round].join(' ').toLowerCase().includes(q));
    }
    return `
      <section class="section-head">
        <div><h2>Kampe</h2><p>Søg på hold, by, gruppe eller runde.</p></div>
      </section>
      <section class="controls">
        <input id="matchSearch" class="search-input" type="search" placeholder="Søg fx Danmark, Mexico eller finale…" autocomplete="off">
        <select id="roundFilter" class="select" aria-label="Vælg runde">
          <option value="all">Alle runder</option>
          ${rounds.map(round => `<option value="${escapeAttr(round)}">${escapeHtml(translateRound(round))}</option>`).join('')}
        </select>
        <div class="segmented" role="tablist" aria-label="Kampfilter">
          ${filterButton('all', 'Alle')}
          ${filterButton('today', 'I dag')}
          ${filterButton('upcoming', 'Kommende')}
          ${filterButton('results', 'Resultater')}
        </div>
      </section>
      ${renderDateGroupedMatches(list)}
    `;
  }

  function filterButton(value, label) {
    return `<button type="button" class="${state.matchFilter === value ? 'active' : ''}" data-match-filter="${value}">${label}</button>`;
  }

  function renderGroups() {
    const groups = buildGroups();
    return `
      <section class="section-head">
        <div><h2>Grupper</h2><p>Tabeller beregnes automatisk ud fra registrerede resultater.</p></div>
      </section>
      <div class="grid">
        ${groups.length ? groups.map(renderGroupCard).join('') : emptyState('Ingen grupper fundet', 'Datakilden indeholder ikke gruppedata endnu.')}
      </div>
    `;
  }

  function renderKnockout() {
    const matches = sortedMatches().filter(match => !match.group);
    const byRound = groupBy(matches, match => match.round || 'Slutspil');
    const order = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'];
    const rounds = order.filter(round => byRound[round]).concat(Object.keys(byRound).filter(round => !order.includes(round)));
    return `
      <section class="section-head">
        <div><h2>Slutspil</h2><p>Opdateres med holdnavne, når de bliver kendt i datakilden.</p></div>
      </section>
      ${rounds.length ? rounds.map(round => `
        <section class="date-group">
          <h3 class="date-title">${escapeHtml(translateRound(round))}</h3>
          <div class="grid match-grid">${byRound[round].map(renderMatchCard).join('')}</div>
        </section>
      `).join('') : emptyState('Slutspillet mangler', 'Datakilden indeholder endnu ikke slutspilskampe.')}
    `;
  }

  function renderFavorites() {
    const teams = Array.from(new Set(state.matches.flatMap(match => [match.team1, match.team2]).filter(isRealTeam))).sort(localeSort);
    const favoriteMatches = sortedMatches().filter(isFavoriteRelated);
    return `
      <section class="section-head">
        <div><h2>Favoritter</h2><p>Vælg hold. Så samles deres kampe her.</p></div>
      </section>
      <section class="card flat">
        <h3>Favorithold</h3>
        <p>Tryk på de hold du vil følge. Gemmes kun på denne enhed.</p>
        <div class="team-chip-wrap">
          ${teams.map(team => `<button type="button" class="team-chip ${state.favoriteTeams.has(team) ? 'active' : ''}" data-team-chip="${escapeAttr(team)}">${flag(team)} ${escapeHtml(team)}</button>`).join('')}
        </div>
      </section>
      <section class="section-head">
        <div><h2>Dine kampe</h2><p>Både favorithold og stjernemarkerede kampe.</p></div>
      </section>
      <div class="grid match-grid">${favoriteMatches.length ? favoriteMatches.map(renderMatchCard).join('') : emptyState('Ingen favoritter endnu', 'Vælg et hold eller tryk på stjernen ved en kamp.')}</div>
      ${renderDataCard()}
    `;
  }

  function renderDateGroupedMatches(matches) {
    if (!matches.length) return emptyState('Ingen kampe matcher', 'Prøv at nulstille søgning eller filter.');
    const byDate = groupBy(matches, match => match.kickoff ? dateKeyCph(match.kickoff) : match.date || 'ukendt');
    return Object.keys(byDate).sort().map(key => `
      <section class="date-group">
        <h3 class="date-title">${formatDateKeyLong(key)}</h3>
        <div class="grid match-grid">${byDate[key].map(renderMatchCard).join('')}</div>
      </section>
    `).join('');
  }

  function renderMatchCard(match) {
    const isFav = state.favoriteMatches.has(match.id);
    const badge = match.score ? '<span class="badge result">Resultat</span>' : match.status === 'today' ? '<span class="badge today">I dag</span>' : match.group ? `<span class="badge">${escapeHtml(match.groupDa || 'Gruppe')}</span>` : '<span class="badge knockout">Slutspil</span>';
    return `
      <article class="match-card">
        <div class="match-top">
          <span>${escapeHtml(match.roundDa)}</span>
          <button type="button" class="favorite-btn ${isFav ? 'active' : ''}" data-fav-match="${escapeAttr(match.id)}" aria-label="${isFav ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}">★</button>
        </div>
        <div class="teams">
          <div class="team-row">
            <div class="team-name"><span class="flag">${flag(match.team1)}</span><span>${escapeHtml(match.team1 || 'TBD')}</span></div>
            <div class="score ${match.score ? '' : 'empty'}">${match.score ? match.score.a : '–'}</div>
          </div>
          <div class="team-row">
            <div class="team-name"><span class="flag">${flag(match.team2)}</span><span>${escapeHtml(match.team2 || 'TBD')}</span></div>
            <div class="score ${match.score ? '' : 'empty'}">${match.score ? match.score.b : '–'}</div>
          </div>
        </div>
        <div class="match-bottom">
          <span>${formatTime(match.kickoff)} · ${escapeHtml(match.ground || '')}</span>
          ${badge}
        </div>
      </article>
    `;
  }

  function renderGroupCard(group) {
    return `
      <section class="card group-card">
        <div class="group-title">
          <h3>${escapeHtml(group.name.replace('Group', 'Gruppe'))}</h3>
          <span class="badge">${group.teams.length} hold</span>
        </div>
        <table class="table" aria-label="${escapeAttr(group.name)} tabel">
          <thead><tr><th>Hold</th><th>K</th><th>P</th><th>Mål</th><th>Pts</th></tr></thead>
          <tbody>
            ${group.table.map(row => `
              <tr>
                <td>${flag(row.team)} ${escapeHtml(row.team)}</td>
                <td>${row.played}</td>
                <td>${row.wins}-${row.draws}-${row.losses}</td>
                <td>${row.goalsFor}:${row.goalsAgainst}</td>
                <td><strong>${row.points}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderDataCard() {
    return `
      <section class="section-head">
        <div><h2>Data</h2><p>Status og kilde</p></div>
      </section>
      <section class="card">
        <h3>${escapeHtml(state.dataSource)}</h3>
        <p>Sidst opdateret: ${state.lastUpdated ? formatDateTime(new Date(state.lastUpdated)) : 'ukendt'}.</p>
        <div class="source-box">${DATA_URL}</div>
        <p style="margin-top:10px">Appen viser ikke livescore. Den opdaterer resultater, når den åbne datakilde bliver opdateret.</p>
      </section>
    `;
  }

  function buildGroups() {
    const grouped = groupBy(state.matches.filter(match => match.group), match => match.group);
    return Object.keys(grouped).sort(localeSort).map(name => {
      const teams = Array.from(new Set(grouped[name].flatMap(match => [match.team1, match.team2]).filter(isRealTeam))).sort(localeSort);
      const table = teams.map(team => ({ team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }));
      const rows = Object.fromEntries(table.map(row => [row.team, row]));
      grouped[name].forEach(match => {
        if (!match.score || !rows[match.team1] || !rows[match.team2]) return;
        const home = rows[match.team1];
        const away = rows[match.team2];
        home.played++; away.played++;
        home.goalsFor += match.score.a; home.goalsAgainst += match.score.b;
        away.goalsFor += match.score.b; away.goalsAgainst += match.score.a;
        if (match.score.a > match.score.b) { home.wins++; away.losses++; home.points += 3; }
        else if (match.score.a < match.score.b) { away.wins++; home.losses++; away.points += 3; }
        else { home.draws++; away.draws++; home.points++; away.points++; }
      });
      table.forEach(row => row.goalDiff = row.goalsFor - row.goalsAgainst);
      table.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || localeSort(a.team, b.team));
      return { name, teams, table };
    });
  }

  function sortedMatches() {
    return [...state.matches].sort((a, b) => {
      const at = a.kickoff ? a.kickoff.getTime() : 0;
      const bt = b.kickoff ? b.kickoff.getTime() : 0;
      return at - bt || a.index - b.index;
    });
  }

  function isFavoriteRelated(match) {
    return state.favoriteMatches.has(match.id) || state.favoriteTeams.has(match.team1) || state.favoriteTeams.has(match.team2);
  }

  function toggleFavoriteMatch(id) {
    if (state.favoriteMatches.has(id)) {
      state.favoriteMatches.delete(id);
      toast('Kamp fjernet fra favoritter.');
    } else {
      state.favoriteMatches.add(id);
      toast('Kamp tilføjet til favoritter.');
    }
    localStorage.setItem(FAVORITE_MATCHES_KEY, JSON.stringify([...state.favoriteMatches]));
    render();
  }

  function toggleFavoriteTeam(team) {
    if (state.favoriteTeams.has(team)) {
      state.favoriteTeams.delete(team);
      toast(`${team} fjernet.`);
    } else {
      state.favoriteTeams.add(team);
      toast(`${team} tilføjet.`);
    }
    localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify([...state.favoriteTeams]));
    render();
  }

  function flag(team) {
    if (!team) return '🏳️';
    if (/^[123][A-L]|^[WL]\d+|^2[A-L]|^3/.test(team)) return '◇';
    return TEAM_FLAGS[team] || '⚽';
  }

  function isRealTeam(team) {
    return team && !/^[123][A-L]|^[WL]\d+|^2[A-L]|^3/.test(team);
  }

  function groupBy(items, keyFn) {
    return items.reduce((acc, item) => {
      const key = keyFn(item) || 'andet';
      (acc[key] ||= []).push(item);
      return acc;
    }, {});
  }

  function dateKeyCph(date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function startOfTodayCph() {
    const key = dateKeyCph(new Date());
    return new Date(`${key}T00:00:00+02:00`);
  }

  function isSameCopenhagenDate(a, b) {
    return dateKeyCph(a) === dateKeyCph(b);
  }

  function formatTime(date) {
    if (!date) return 'Tid ukendt';
    return new Intl.DateTimeFormat('da-DK', {
      timeZone: DEFAULT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    }).format(date);
  }

  function formatDateLong(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatDateKeyLong(key) {
    const date = new Date(`${key}T12:00:00+02:00`);
    return new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function formatCopenhagenToday() {
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  }

  function localeSort(a, b) {
    return String(a).localeCompare(String(b), 'da');
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function setRefreshLoading(isLoading) {
    els.refreshBtn.classList.toggle('loading', isLoading);
    els.refreshBtn.disabled = isLoading;
  }

  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function escapeAttr(value = '') {
    return escapeHtml(value);
  }
})();
