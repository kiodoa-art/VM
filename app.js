(() => {
  'use strict';

  const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
  const FOOTBALL_DATA_TOKEN = 'aa7f45bd79c44add8c9be11b7103aeac';
  const FOOTBALL_DATA_COMPETITION = 'WC';
  const FOOTBALL_DATA_SEASON = '2026';
  const DATA_URL = `${FOOTBALL_DATA_BASE}/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=${FOOTBALL_DATA_SEASON}`;
  const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
  const CACHE_KEY = 'vm2026:data:v2';
  const RATE_LIMIT_KEY = 'vm2026:footballDataRateLimit:v1';
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
      const data = await fetchFootballData();
      useData(data, 'football-data.org');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, lastUpdated: new Date().toISOString(), source: 'football-data.org' }));
      if (manual) toast('Data opdateret fra football-data.org.');
    } catch (error) {
      try {
        const data = await fetchOpenFootballData();
        useData(data, 'OpenFootball fallback');
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, lastUpdated: new Date().toISOString(), source: 'OpenFootball fallback' }));
        state.error = `football-data.org kunne ikke hentes (${error.message}). Viser OpenFootball fallback.`;
        if (manual) toast('API fejlede. Viser fallback-data.');
      } catch {
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
      }
    } finally {
      setRefreshLoading(false);
      render();
    }
  }

  async function fetchFootballData() {
    const throttledUntil = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0);
    if (throttledUntil && Date.now() < throttledUntil) {
      throw new Error('rate-limit pause');
    }
    const response = await fetch(DATA_URL, {
      cache: 'no-store',
      headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN }
    });
    rememberRateLimit(response.headers);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.matches)) throw new Error('ukendt API-format');
    return {
      name: payload.competition?.name || 'FIFA World Cup 2026',
      source: 'football-data.org',
      api: 'football-data.org',
      matches: payload.matches.map(normalizeFootballDataMatch),
      raw: payload
    };
  }

  async function fetchOpenFootballData() {
    const response = await fetch(`${OPENFOOTBALL_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function rememberRateLimit(headers) {
    const available = Number(headers.get('X-Requests-Available-Minute'));
    const reset = Number(headers.get('X-RequestCounter-Reset'));
    if (!Number.isNaN(available) && available <= 1 && !Number.isNaN(reset) && reset > 0) {
      localStorage.setItem(RATE_LIMIT_KEY, String(Date.now() + (reset + 2) * 1000));
    } else {
      localStorage.removeItem(RATE_LIMIT_KEY);
    }
  }

  function normalizeFootballDataMatch(match) {
    const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'TBD';
    const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'TBD';
    return {
      ...match,
      num: match.id,
      sourceType: 'football-data',
      team1: homeName,
      team2: awayName,
      team1Id: match.homeTeam?.id || null,
      team2Id: match.awayTeam?.id || null,
      utcDate: match.utcDate,
      date: match.utcDate ? match.utcDate.slice(0, 10) : '',
      round: translateApiStage(match.stage, match.matchday),
      group: match.group || null,
      ground: match.venue || '',
      apiStatus: match.status,
      liveMinute: match.minute,
      lastUpdated: match.lastUpdated
    };
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
    const kickoff = match.utcDate ? new Date(match.utcDate) : parseKickoff(match.date, match.time);
    const id = match.num ? String(match.num) : `${match.date}-${match.time || ''}-${match.team1}-${match.team2}-${index}`;
    const score = extractScore(match);
    const isGroup = Boolean(match.group);
    const now = new Date();
    const apiStatus = match.apiStatus || match.status;
    const status = apiStatus && ['LIVE', 'IN_PLAY', 'PAUSED'].includes(apiStatus) ? 'live' : score ? 'result' : kickoff && isSameCopenhagenDate(kickoff, now) ? 'today' : 'scheduled';
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
      const fullTimeObj = match.score.fullTime || match.score.fulltime || match.score.full_time;
      if (fullTimeObj && isNumberLike(fullTimeObj.home) && isNumberLike(fullTimeObj.away)) {
        return { a: Number(fullTimeObj.home), b: Number(fullTimeObj.away), label: `${fullTimeObj.home}-${fullTimeObj.away}` };
      }
      if (fullTimeObj && isNumberLike(fullTimeObj.homeTeam) && isNumberLike(fullTimeObj.awayTeam)) {
        return { a: Number(fullTimeObj.homeTeam), b: Number(fullTimeObj.awayTeam), label: `${fullTimeObj.homeTeam}-${fullTimeObj.awayTeam}` };
      }
      const ft = match.score.ft || match.score.final;
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

  function translateApiStage(stage = '', matchday = '') {
    const map = {
      GROUP_STAGE: matchday ? `Matchday ${matchday}` : 'Matchday',
      LAST_32: 'Round of 32',
      ROUND_OF_16: 'Round of 16',
      QUARTER_FINALS: 'Quarter-final',
      SEMI_FINALS: 'Semi-final',
      THIRD_PLACE: 'Match for third place',
      FINAL: 'Final'
    };
    return map[stage] || stage?.replaceAll('_', ' ') || 'Kamp';
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
      el.addEventListener('click', event => {
        event.stopPropagation();
        toggleFavoriteMatch(el.dataset.favMatch);
      });
    });
    document.querySelectorAll('[data-team-chip]').forEach(el => {
      el.addEventListener('click', () => toggleFavoriteTeam(el.dataset.teamChip));
    });
    document.querySelectorAll('[data-match-details]').forEach(el => {
      const open = event => {
        if (event.type === 'click' && event.target.closest('[data-fav-match]')) return;
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        if (event.type === 'keydown') event.preventDefault();
        const match = state.matches.find(item => item.id === el.dataset.matchDetails);
        if (match) openMatchDetails(match);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', open);
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
        <p>Henter data fra football-data.org med fallback til OpenFootball. Viser live-status og kampdetaljer, når API'en leverer dem.</p>
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
    const badge = match.status === 'live' ? '<span class="badge today">Live</span>' : match.score ? '<span class="badge result">Resultat</span>' : match.status === 'today' ? '<span class="badge today">I dag</span>' : match.group ? `<span class="badge">${escapeHtml(match.groupDa || 'Gruppe')}</span>` : '<span class="badge knockout">Slutspil</span>';
    return `
      <article class="match-card" data-match-details="${escapeAttr(match.id)}" tabindex="0" role="button" aria-label="Vis kampdetaljer">
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
        <div class="match-detail-hint">Tryk for kampdetaljer</div>
      </article>
    `;
  }

  function openMatchDetails(match) {
    closeMatchDetails();
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-backdrop';
    wrapper.innerHTML = renderMatchDetails(match);
    document.body.appendChild(wrapper);
    document.body.classList.add('modal-open');
    wrapper.addEventListener('click', event => {
      if (event.target === wrapper || event.target.closest('[data-close-modal]')) closeMatchDetails();
    });
    document.addEventListener('keydown', closeOnEscape);
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape') closeMatchDetails();
  }

  function closeMatchDetails() {
    document.querySelector('.modal-backdrop')?.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', closeOnEscape);
  }

  function renderMatchDetails(match) {
    const goals1 = extractGoals(match, 1);
    const goals2 = extractGoals(match, 2);
    const halfTime = extractHalfTime(match);
    const penalties = extractPenaltyShootout(match);
    const bookings = extractBookings(match);
    const substitutions = extractSubstitutions(match);
    const hasGoals = goals1.length || goals2.length;
    return `
      <section class="match-modal" role="dialog" aria-modal="true" aria-label="Kampdetaljer">
        <button type="button" class="modal-close" data-close-modal aria-label="Luk">×</button>
        <p class="eyebrow">${escapeHtml(match.roundDa)}${match.status === 'live' && match.liveMinute ? ` · ${escapeHtml(match.liveMinute)}'` : ''}</p>
        <h2>${flag(match.team1)} ${escapeHtml(match.team1 || 'TBD')} <span>mod</span> ${flag(match.team2)} ${escapeHtml(match.team2 || 'TBD')}</h2>
        <div class="modal-score">${match.score ? escapeHtml(match.score.label) : '–'}</div>
        <div class="modal-meta">
          <span>${formatDateLong(match.kickoff) || 'Tid ukendt'}</span>
          ${match.ground ? `<span>${escapeHtml(match.ground)}</span>` : ''}
          ${match.groupDa ? `<span>${escapeHtml(match.groupDa)}</span>` : ''}
          ${match.apiStatus ? `<span>${escapeHtml(statusLabel(match.apiStatus))}</span>` : ''}
        </div>

        <div class="detail-grid">
          <div class="detail-box"><strong>Resultat</strong><span>${match.score ? escapeHtml(match.score.label) : 'Ikke spillet / ikke opdateret'}</span></div>
          <div class="detail-box"><strong>Halvleg</strong><span>${halfTime || 'Ikke i datakilden'}</span></div>
          <div class="detail-box"><strong>Straffespark</strong><span>${penalties || 'Ikke i datakilden'}</span></div>
        </div>

        <h3>Målscorere</h3>
        ${hasGoals ? `
          <div class="goals-wrap">
            ${renderGoalList(match.team1, goals1)}
            ${renderGoalList(match.team2, goals2)}
          </div>
        ` : `<p class="muted-text">Der er ikke registreret målscorere for kampen endnu.</p>`}

        <h3>Kort</h3>
        ${bookings.length ? `<div class="event-list">${bookings.map(renderBooking).join('')}</div>` : `<p class="muted-text">Ingen kort registreret i API'en.</p>`}

        <h3>Udskiftninger</h3>
        ${substitutions.length ? `<div class="event-list">${substitutions.map(renderSubstitution).join('')}</div>` : `<p class="muted-text">Ingen udskiftninger registreret i API'en.</p>`}

        <p class="data-note">Brændte straffespark vises kun, hvis API'en leverer dem som kamp-event. football-data.org leverer typisk mål, kort, udskiftninger, status og scoringer.</p>
      </section>
    `;
  }

  function renderGoalList(team, goals) {
    return `
      <div class="goal-team">
        <h4>${flag(team)} ${escapeHtml(team || 'TBD')}</h4>
        ${goals.length ? goals.map(goal => `<div class="goal-row"><span>⚽ ${escapeHtml(goal.name)}</span><small>${escapeHtml(goal.minute)}</small></div>`).join('') : '<p>Ingen mål.</p>'}
      </div>
    `;
  }

  function extractGoals(match, side) {
    if (Array.isArray(match.goals)) {
      const teamId = side === 1 ? match.team1Id : match.team2Id;
      const teamName = side === 1 ? match.team1 : match.team2;
      return match.goals
        .filter(goal => sameTeam(goal.team, teamId, teamName))
        .map(goal => normalizeGoal(goal))
        .filter(Boolean);
    }
    const raw = match[`goals${side}`] || match[`goals_${side}`] || match[side === 1 ? 'home_goals' : 'away_goals'];
    if (!Array.isArray(raw)) return [];
    return raw.map(goal => normalizeGoal(goal)).filter(Boolean);
  }

  function normalizeGoal(goal) {
    if (typeof goal === 'string') return { name: goal, minute: '' };
    if (!goal || typeof goal !== 'object') return null;
    const scorer = goal.scorer?.name || goal.name || goal.player || goal.scorer || goal.team || 'Ukendt';
    const assist = goal.assist?.name || goal.assist || '';
    const minuteValue = goal.minute ?? goal.time ?? goal.minutes ?? goal.min;
    const offset = goal.extraTime ?? goal.offset ?? goal.extra ?? goal.extra_time ?? goal.added;
    let minute = minuteValue !== undefined && minuteValue !== null && minuteValue !== '' ? `${minuteValue}'` : '';
    if (offset !== undefined && offset !== null && offset !== '') minute = minute ? `${minute}+${offset}'` : `${offset}'`;
    const tags = [];
    const type = String(goal.type || '').toUpperCase();
    if (goal.penalty || goal.pen || type.includes('PENALTY')) tags.push('straffe');
    if (goal.own_goal || goal.owngoal || type.includes('OWN')) tags.push('selvmål');
    if (assist) tags.push(`assist: ${assist}`);
    if (tags.length) minute = minute ? `${minute} · ${tags.join(', ')}` : tags.join(', ');
    return { name: scorer, minute };
  }

  function sameTeam(team, teamId, teamName) {
    if (!team) return false;
    if (teamId && team.id === teamId) return true;
    return normalizeName(team.name) === normalizeName(teamName);
  }

  function normalizeName(value = '') {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function extractBookings(match) {
    if (!Array.isArray(match.bookings)) return [];
    return match.bookings.map(item => ({
      minute: formatMinute(item.minute),
      team: item.team?.shortName || item.team?.name || '',
      player: item.player?.name || 'Ukendt',
      card: item.card || ''
    }));
  }

  function renderBooking(item) {
    const icon = String(item.card).includes('RED') ? '🟥' : '🟨';
    return `<div class="event-row"><span>${icon} ${escapeHtml(item.player)}${item.team ? ` · ${escapeHtml(item.team)}` : ''}</span><small>${escapeHtml(item.minute)}</small></div>`;
  }

  function extractSubstitutions(match) {
    if (!Array.isArray(match.substitutions)) return [];
    return match.substitutions.map(item => ({
      minute: formatMinute(item.minute),
      team: item.team?.shortName || item.team?.name || '',
      out: item.playerOut?.name || '',
      in: item.playerIn?.name || ''
    }));
  }

  function renderSubstitution(item) {
    return `<div class="event-row"><span>🔁 ${escapeHtml(item.in || 'Ind')} ind / ${escapeHtml(item.out || 'Ud')} ud${item.team ? ` · ${escapeHtml(item.team)}` : ''}</span><small>${escapeHtml(item.minute)}</small></div>`;
  }

  function formatMinute(value) {
    return value !== undefined && value !== null && value !== '' ? `${value}'` : '';
  }

  function statusLabel(status) {
    const map = { SCHEDULED: 'Planlagt', TIMED: 'Fastlagt', LIVE: 'Live', IN_PLAY: 'Spilles', PAUSED: 'Pause', FINISHED: 'Slut', POSTPONED: 'Udsat', SUSPENDED: 'Afbrudt', CANCELLED: 'Aflyst' };
    return map[status] || status;
  }

  function extractHalfTime(match) {
    const candidates = [
      [match.ht1, match.ht2],
      [match.half1, match.half2],
      [match.score1i, match.score2i],
      [match.score?.halfTime?.home, match.score?.halfTime?.away],
      [match.score?.halfTime?.homeTeam, match.score?.halfTime?.awayTeam],
      [match.score?.ht?.[0], match.score?.ht?.[1]],
      [match.score?.halftime?.[0], match.score?.halftime?.[1]],
      [match.score?.half_time?.[0], match.score?.half_time?.[1]]
    ];
    for (const [a, b] of candidates) {
      if (isNumberLike(a) && isNumberLike(b)) return `${a}-${b}`;
    }
    return '';
  }

  function extractPenaltyShootout(match) {
    const candidates = [
      [match.penalty1, match.penalty2],
      [match.penalties1, match.penalties2],
      [match.score?.penalties?.home, match.score?.penalties?.away],
      [match.score?.penalties?.homeTeam, match.score?.penalties?.awayTeam],
      [match.score?.penalties?.[0], match.score?.penalties?.[1]],
      [match.score?.p?.[0], match.score?.p?.[1]]
    ];
    for (const [a, b] of candidates) {
      if (isNumberLike(a) && isNumberLike(b)) return `${a}-${b}`;
    }
    return '';
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
        <div class="source-box">${state.dataSource.includes('football-data') ? DATA_URL : OPENFOOTBALL_URL}</div>
        <p style="margin-top:10px">Primær kilde er football-data.org. Appen respekterer rate-limit headers og falder tilbage til OpenFootball/cache ved fejl.</p>
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

  function readStoredObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
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
