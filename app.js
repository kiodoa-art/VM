(() => {
  'use strict';

  const STORAGE_KEY = 'kickoff-vm-2026-state-v4';
  const CACHE_KEY = 'kickoff-vm-2026-cache-v4';
  const DETAIL_CACHE_KEY = 'kickoff-vm-2026-detail-cache-v4';
  const FRESH_MS = 6 * 60 * 60 * 1000;
  const DETAIL_FRESH_MS = 12 * 60 * 1000;
  const NEXT_MATCH_REFRESH_MS = 10 * 60 * 1000;

  const CONFIG = window.KICKOFF_APP_CONFIG || {};

  const NAV = [
    { id: 'overview', label: 'Oversigt', icon: '⌂' },
    { id: 'matches', label: 'Kampe', icon: '▦' },
    { id: 'groups', label: 'Grupper', icon: '◌' },
    { id: 'teams', label: 'Hold', icon: '●' },
    { id: 'stats', label: 'Statistik', icon: '▥' },
    { id: 'stadiums', label: 'Stadions', icon: '◉' },
    { sep: true },
    { id: 'favorites', label: 'Favoritter', icon: '★' },
    { id: 'settings', label: 'Indstillinger', icon: '⚙' },
    { id: 'data', label: 'Data', icon: '↻' }
  ];

  const DEMO_FIXTURES = [
    {
      fixture: { id: 1001, date: '2026-06-18T21:00:00+02:00', timestamp: 1781816400, timezone: 'Europe/Copenhagen', venue: { name: 'MetLife Stadium', city: 'New Jersey' }, status: { long: 'Match Finished', short: 'FT', elapsed: 90 } },
      league: { id: 1, name: 'FIFA World Cup', country: 'World', season: 2026, round: 'Group F - Round 2' },
      teams: { home: { id: 13, name: 'Danmark', logo: '', winner: true }, away: { id: 2, name: 'Frankrig', logo: '', winner: false } },
      goals: { home: 2, away: 1 },
      score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 } }
    },
    {
      fixture: { id: 1002, date: '2026-06-19T18:00:00+02:00', timezone: 'Europe/Copenhagen', venue: { name: 'BMO Field', city: 'Toronto' }, status: { long: 'Not Started', short: 'NS', elapsed: null } },
      league: { id: 1, name: 'FIFA World Cup', season: 2026, round: 'Group A - Round 2' },
      teams: { home: { id: 8, name: 'Canada', logo: '' }, away: { id: 9, name: 'Japan', logo: '' } },
      goals: { home: null, away: null }, score: { fulltime: { home: null, away: null } }
    },
    {
      fixture: { id: 1003, date: '2026-06-20T21:00:00+02:00', timezone: 'Europe/Copenhagen', venue: { name: 'AT&T Stadium', city: 'Dallas' }, status: { long: 'Not Started', short: 'NS', elapsed: null } },
      league: { id: 1, name: 'FIFA World Cup', season: 2026, round: 'Group C - Round 2' },
      teams: { home: { id: 10, name: 'USA', logo: '' }, away: { id: 11, name: 'England', logo: '' } },
      goals: { home: null, away: null }, score: { fulltime: { home: null, away: null } }
    },
    {
      fixture: { id: 1004, date: '2026-06-21T03:00:00+02:00', timezone: 'Europe/Copenhagen', venue: { name: 'SoFi Stadium', city: 'Los Angeles' }, status: { long: 'Not Started', short: 'NS', elapsed: null } },
      league: { id: 1, name: 'FIFA World Cup', season: 2026, round: 'Group D - Round 2' },
      teams: { home: { id: 12, name: 'Mexico', logo: '' }, away: { id: 14, name: 'Brazilien', logo: '' } },
      goals: { home: null, away: null }, score: { fulltime: { home: null, away: null } }
    }
  ];

  const DEMO_EVENTS = [
    ev(21, 'Danmark', 13, 'K. Højlund', 'Goal', 'Normal Goal'),
    ev(35, 'Danmark', 13, 'P. Højbjerg', 'Card', 'Yellow Card'),
    ev(26, 'Frankrig', 2, 'A. Tchouaméni', 'Card', 'Yellow Card'),
    ev(46, 'Frankrig', 2, 'O. Dembélé', 'subst', 'Substitution', 'K. Coman'),
    ev(60, 'Danmark', 13, 'R. Højlund', 'subst', 'Substitution', 'J. Wind'),
    ev(67, 'Frankrig', 2, 'K. Mbappé', 'Goal', 'Normal Goal'),
    ev(68, 'Danmark', 13, 'J. Andersen', 'Card', 'Yellow Card'),
    ev(70, 'Danmark', 13, 'A. Dreyer', 'subst', 'Substitution', 'M. Damsgaard'),
    ev(74, 'Frankrig', 2, 'T. Hernández', 'Card', 'Yellow Card'),
    ev(78, 'Danmark', 13, 'A. Christensen', 'Goal', 'Header'),
    ev(80, 'Danmark', 13, 'C. Nørgaard', 'subst', 'Substitution', 'P. Højbjerg'),
    ev(82, 'Frankrig', 2, 'Y. Fofana', 'subst', 'Substitution', 'A. Tchouaméni'),
    ev(92, 'Danmark', 13, 'R. Kristensen', 'Card', 'Red Card')
  ];

  function ev(min, team, teamId, player, type, detail, assist) {
    return { time: { elapsed: min, extra: min > 90 ? min - 90 : null }, team: { id: teamId, name: team }, player: { name: player }, assist: { name: assist || null }, type, detail };
  }

  const DEMO_LINEUPS = [
    demoLineup('Danmark', 13, '4-3-3', 'Kasper Hjulmand', 'red', [
      ['1','K. Schmeichel','G','1:1'], ['5','J. Mæhle','D','2:4'], ['6','A. Christensen','D','2:3'], ['4','J. Andersen','D','2:2'], ['13','R. Kristensen','D','2:1'],
      ['10','C. Eriksen','M','3:3'], ['15','C. Nørgaard','M','3:2'], ['8','M. Damsgaard','M','3:1'], ['11','A. Dreyer','F','4:3'], ['9','R. Højlund','F','4:2'], ['23','J. Wind','F','4:1']
    ], [['16','L. Hradecky'], ['2','J. Vestergaard'], ['3','V. Nelsson'], ['12','J. Larsen'], ['14','M. Jensen'], ['17','Y. Poulsen'], ['19','R. Bardghji'], ['20','A. Skov Olsen'], ['21','P. Dorgu'], ['22','F. Rønnow'], ['24','B. Meling'], ['25','T. Delaney'], ['26','M. Bøe']]),
    demoLineup('Frankrig', 2, '4-2-3-1', 'Didier Deschamps', 'blue', [
      ['16','M. Maignan','G','1:1'], ['22','T. Hernández','D','2:4'], ['4','D. Upamecano','D','2:3'], ['5','J. Koundé','D','2:2'], ['2','B. Pavard','D','2:1'],
      ['8','A. Tchouaméni','M','3:2'], ['19','Y. Fofana','M','3:1'], ['11','O. Dembélé','M','4:3'], ['7','A. Griezmann','M','4:2'], ['20','K. Coman','M','4:1'], ['10','K. Mbappé','F','5:1']
    ], [['1','B. Samba'], ['3','P. Kalulu'], ['6','M. Guendouzi'], ['9','R. Kolo Muani'], ['12','R. Camavinga'], ['13','W. Saliba'], ['14','A. Rabiot'], ['15','I. Konaté'], ['17','M. Thuram'], ['18','E. Camavinga'], ['21','L. Digne'], ['23','A. Areola'], ['24','K. Thuram'], ['25','B. Barcola'], ['26','J. Clauss']])
  ];

  function demoLineup(team, id, formation, coach, color, start, subs) {
    return {
      team: { id, name: team, colors: { player: { primary: color === 'red' ? '#d51d32' : '#123e99' }, goalkeeper: { primary: color === 'red' ? '#31a363' : '#f2c230' } } },
      formation,
      coach: { name: coach },
      startXI: start.map(([number, name, pos, grid]) => ({ player: { id: `${id}-${number}`, number: Number(number), name, pos, grid } })),
      substitutes: subs.map(([number, name]) => ({ player: { id: `${id}-s-${number}`, number: Number(number), name, pos: null, grid: null } }))
    };
  }

  const DEMO_STATS = [
    { team: { id: 13, name: 'Danmark' }, statistics: [
      { type: 'Ball Possession', value: '52%' }, { type: 'Total Shots', value: 14 }, { type: 'Shots on Goal', value: 6 }, { type: 'Corner Kicks', value: 5 }, { type: 'Fouls', value: 12 }, { type: 'Yellow Cards', value: 2 }, { type: 'Red Cards', value: 1 }
    ] },
    { team: { id: 2, name: 'Frankrig' }, statistics: [
      { type: 'Ball Possession', value: '48%' }, { type: 'Total Shots', value: 11 }, { type: 'Shots on Goal', value: 4 }, { type: 'Corner Kicks', value: 4 }, { type: 'Fouls', value: 13 }, { type: 'Yellow Cards', value: 2 }, { type: 'Red Cards', value: 0 }
    ] }
  ];

  const DEMO_STANDINGS = [{
    league: { standings: [[
      standing(1, 'Danmark', 13, 6, 2, 2, 0, 0, 5, 2),
      standing(2, 'Frankrig', 2, 3, 2, 1, 0, 1, 5, 3),
      standing(3, 'Norge', 31, 3, 2, 1, 0, 1, 2, 3),
      standing(4, 'Sydafrika', 44, 0, 2, 0, 0, 2, 1, 5)
    ]] }
  }];
  function standing(rank, team, id, pts, played, win, draw, lose, gf, ga) {
    return { rank, team: { id, name: team, logo: '' }, points: pts, goalsDiff: gf - ga, all: { played, win, draw, lose, goals: { for: gf, against: ga } } };
  }

  const state = {
    route: 'overview',
    tab: 'overview',
    loading: false,
    settings: loadSettings(),
    fixtures: [],
    standings: [],
    teams: [],
    selectedFixtureId: null,
    detail: {},
    favorites: new Set(),
    lastLoaded: null,
    deferredPrompt: null,
    refreshing: false
  };

  const $ = (sel) => document.querySelector(sel);
  const app = $('#app');
  const notice = $('#notice');
  const title = $('#pageTitle');
  const eyebrow = $('#eyebrow');

  init();

  function init() {
    loadFavorites();
    renderNav();
    bindShell();
    registerServiceWorker();
    setupInstallPrompt();
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
    setInterval(() => refreshNextMatches(false), NEXT_MATCH_REFRESH_MS);
  }

  function loadSettings() {
    const saved = safeJson(localStorage.getItem(STORAGE_KEY), {});
    return {
      apiKey: saved.apiKey || CONFIG.apiKey || '',
      apiBase: saved.apiBase || CONFIG.apiBase || 'https://api.kickoffapi.com/api/v1',
      proxyUrl: saved.proxyUrl || CONFIG.proxyUrl || '',
      leagueId: saved.leagueId || CONFIG.leagueId || '',
      season: Number(saved.season || CONFIG.season || 2026),
      timezone: saved.timezone || CONFIG.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Copenhagen',
      useDemoData: typeof saved.useDemoData === 'boolean' ? saved.useDemoData : (typeof CONFIG.useDemoData === 'boolean' ? CONFIG.useDemoData : true),
      autoRefresh: typeof saved.autoRefresh === 'boolean' ? saved.autoRefresh : true
    };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function loadFavorites() {
    const ids = safeJson(localStorage.getItem('kickoff-vm-favorites'), []);
    state.favorites = new Set(ids.map(String));
  }
  function saveFavorites() { localStorage.setItem('kickoff-vm-favorites', JSON.stringify([...state.favorites])); }

  function safeJson(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function bindShell() {
    $('#refreshBtn').addEventListener('click', () => loadCoreData(true));
    $('#demoToggle').addEventListener('click', () => {
      state.settings.useDemoData = !state.settings.useDemoData;
      saveSettings();
      clearNotice();
      loadCoreData(true);
    });
    $('#backBtn').addEventListener('click', () => history.length > 1 ? history.back() : location.hash = '#/matches');
  }

  function renderNav() {
    const render = (mobile = false) => NAV.filter(n => mobile ? !n.sep : true).map(n => {
      if (n.sep) return '<div class="nav-separator"></div>';
      return `<a class="nav-item" data-route="${n.id}" href="#/${n.id}"><span>${n.icon}</span><b>${n.label}</b></a>`;
    }).join('');
    $('#desktopNav').innerHTML = render(false);
    $('#mobileNav').innerHTML = render(true);
  }

  function setActiveNav() {
    document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === state.route));
  }

  async function handleRoute() {
    const hash = location.hash.replace(/^#\/?/, '') || 'overview';
    const parts = hash.split('/');
    state.route = parts[0] || 'overview';
    state.selectedFixtureId = parts[0] === 'match' ? parts[1] : null;
    if (state.route === 'match') state.route = 'matches';
    setActiveNav();
    updateHeader();
    if (!state.fixtures.length && !['settings'].includes(state.route)) {
      await loadCoreData(false);
    } else {
      render();
    }
  }

  function updateHeader() {
    const isMatch = !!state.selectedFixtureId;
    $('#backBtn').hidden = !isMatch;
    const nav = NAV.find(n => n.id === state.route);
    title.textContent = isMatch ? 'Kampdetaljer' : (nav ? nav.label : 'Oversigt');
    eyebrow.textContent = state.settings.useDemoData ? 'Demo-data' : `VM ${state.settings.season}`;
    $('#demoToggle').textContent = state.settings.useDemoData ? 'Live-data' : 'Demo';
  }

  async function loadCoreData(force = false) {
    updateHeader();
    if (state.loading) return;
    state.loading = true;
    app.innerHTML = loader('Henter data');

    try {
      if (state.settings.useDemoData) {
        applyDemoData();
        showNotice('Demo-data er slået til. Skift til live-data under Indstillinger.', 'good');
        render();
        return;
      }

      if (!state.settings.apiKey && !state.settings.proxyUrl) {
        showNotice('Der mangler API-nøgle eller proxy-URL. Appen viser demo-data indtil du udfylder Indstillinger.', 'error');
        applyDemoData();
        render();
        return;
      }

      const cached = safeJson(localStorage.getItem(CACHE_KEY), null);
      if (!force && cached && Date.now() - cached.savedAt < FRESH_MS && cached.season === state.settings.season) {
        state.fixtures = cached.fixtures || [];
        state.standings = cached.standings || [];
        state.teams = cached.teams || [];
        state.lastLoaded = cached.savedAt;
        render();
        refreshNextMatches(false);
        return;
      }

      await ensureLeagueId();
      const [fixtures, standings, teams] = await Promise.all([
        apiGet('/fixtures', { league: state.settings.leagueId, season: state.settings.season, timezone: state.settings.timezone }),
        apiGet('/standings', { league: state.settings.leagueId, season: state.settings.season }),
        apiGet('/teams', { league: state.settings.leagueId, season: state.settings.season })
      ]);

      state.fixtures = normalizeArray(fixtures.response).sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0));
      state.standings = normalizeArray(standings.response);
      state.teams = normalizeArray(teams.response);
      state.lastLoaded = Date.now();

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: state.lastLoaded,
        season: state.settings.season,
        leagueId: state.settings.leagueId,
        fixtures: state.fixtures,
        standings: state.standings,
        teams: state.teams
      }));
      clearNotice();
      render();
      refreshNextMatches(false);
    } catch (error) {
      console.error(error);
      showNotice(`Live-data fejlede: ${error.message}. Appen viser demo-data, så layoutet stadig kan testes.`, 'error');
      applyDemoData();
      render();
    } finally {
      state.loading = false;
    }
  }

  async function ensureLeagueId() {
    if (state.settings.leagueId) return;
    const res = await apiGet('/leagues', { search: 'World Cup', season: state.settings.season });
    const leagues = normalizeArray(res.response);
    const match = leagues.find(x => String(x.league?.name || '').toLowerCase().includes('world cup')) || leagues[0];
    if (!match?.league?.id) throw new Error('Kunne ikke finde VM 2026 leagueId automatisk. Indsæt leagueId under Indstillinger.');
    state.settings.leagueId = String(match.league.id);
    saveSettings();
  }

  function applyDemoData() {
    state.fixtures = DEMO_FIXTURES;
    state.standings = DEMO_STANDINGS;
    state.teams = [
      { team: { id: 13, name: 'Danmark', country: 'Denmark', logo: '' }, venue: { name: 'Parken' } },
      { team: { id: 2, name: 'Frankrig', country: 'France', logo: '' }, venue: { name: 'Stade de France' } },
      { team: { id: 31, name: 'Norge', country: 'Norway', logo: '' }, venue: { name: 'Ullevaal' } },
      { team: { id: 44, name: 'Sydafrika', country: 'South Africa', logo: '' }, venue: { name: 'FNB Stadium' } },
      { team: { id: 10, name: 'USA', country: 'USA', logo: '' }, venue: { name: 'AT&T Stadium' } },
      { team: { id: 12, name: 'Mexico', country: 'Mexico', logo: '' }, venue: { name: 'Azteca' } }
    ];
    state.detail['1001'] = { fixture: DEMO_FIXTURES[0], events: DEMO_EVENTS, lineups: DEMO_LINEUPS, statistics: DEMO_STATS, savedAt: Date.now() };
    state.lastLoaded = Date.now();
  }

  async function apiGet(endpoint, params = {}) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    const base = state.settings.proxyUrl ? state.settings.proxyUrl.replace(/\/$/, '') : state.settings.apiBase.replace(/\/$/, '');
    const url = `${base}${endpoint}${qs ? '?' + qs : ''}`;
    const headers = { 'Accept': 'application/json' };
    if (!state.settings.proxyUrl && state.settings.apiKey) headers['x-api-key'] = state.settings.apiKey;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(`${endpoint} gav HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length)) {
      console.warn('API errors', json.errors);
    }
    return json;
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (Array.isArray(value.response)) return value.response;
    return [value];
  }

  function render() {
    updateHeader();
    if (state.selectedFixtureId) return renderMatchDetail(state.selectedFixtureId);
    switch (state.route) {
      case 'overview': return renderOverview();
      case 'matches': return renderMatches();
      case 'groups': return renderGroups();
      case 'teams': return renderTeams();
      case 'stats': return renderStats();
      case 'stadiums': return renderStadiums();
      case 'favorites': return renderFavorites();
      case 'settings': return renderSettings();
      case 'data': return renderData();
      default: return renderOverview();
    }
  }

  function renderOverview() {
    const fixtures = state.fixtures;
    const completed = fixtures.filter(isFinished).length;
    const live = fixtures.filter(isLive).length;
    const next = fixtures.filter(f => !isFinished(f)).slice(0, 5);
    const teams = collectTeams(fixtures).length || state.teams.length;
    const venues = collectVenues(fixtures).length;
    app.innerHTML = `
      <section class="hero overview-hero">
        <div class="hero-copy">
          <h2>VM-kampcenter i lys mobilversion.</h2>
          <p>Oversigt, kampe, grupper, opstillinger, kampforløb og statistik i samme stil som referencebilledet – bare lysere og mere telefonvenlig.</p>
        </div>
        <div class="hero-metrics">
          ${metric(fixtures.length, 'Kampe')}
          ${metric(completed, 'Færdigspillet')}
          ${metric(live, 'Live nu')}
          ${metric(teams || '—', 'Hold')}
        </div>
      </section>
      <div class="grid two" style="margin-top:14px">
        <section class="card pad">
          <h2 class="card-title">Næste kampe <small>${formatUpdated()}</small></h2>
          <div class="match-list">${next.length ? next.map(renderMatchRow).join('') : empty('Ingen kommende kampe fundet.')}</div>
        </section>
        <section class="card pad">
          <h2 class="card-title">Turnering</h2>
          <div class="grid two">
            ${metric(venues || '—', 'Stadions')}
            ${metric(countGoals(fixtures), 'Mål')}
            ${metric(avgGoals(fixtures), 'Mål/kamp')}
            ${metric(state.settings.timezone.replace('_',' '), 'Tidszone')}
          </div>
        </section>
      </div>
    `;
    bindMatchRows();
  }

  function metric(value, label) { return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`; }

  function renderMatches(list = state.fixtures) {
    if (!list.length) { app.innerHTML = empty('Ingen kampe fundet.'); return; }
    const grouped = groupByDate(list);
    app.innerHTML = `
      <section class="card pad">
        <h2 class="card-title">Kampoversigt <small>${list.length} kampe</small></h2>
        <div class="button-row" style="margin-bottom:12px">
          <button class="small-action" data-filter="all">Alle</button>
          <button class="small-action" data-filter="next">Næste 5</button>
          <button class="small-action" data-filter="done">Spillet</button>
          <button class="small-action" data-filter="live">Live</button>
        </div>
        ${Object.entries(grouped).map(([date, matches]) => `
          <div class="date-group">
            <h3 class="date-heading">${escapeHtml(date)}</h3>
            <div class="match-list">${matches.map(renderMatchRow).join('')}</div>
          </div>`).join('')}
      </section>`;
    bindMatchRows();
    app.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      let filtered = state.fixtures;
      if (filter === 'next') filtered = state.fixtures.filter(f => !isFinished(f)).slice(0, 5);
      if (filter === 'done') filtered = state.fixtures.filter(isFinished);
      if (filter === 'live') filtered = state.fixtures.filter(isLive);
      renderMatches(filtered);
    }));
  }

  function renderMatchRow(fixture) {
    const id = fixture.fixture?.id;
    const home = fixture.teams?.home || {};
    const away = fixture.teams?.away || {};
    const goals = getScore(fixture);
    const status = statusLabel(fixture.fixture?.status?.short);
    const statusClass = isLive(fixture) ? 'live' : isFinished(fixture) ? 'done' : '';
    return `<a class="match-row" href="#/match/${id}" data-match-id="${id}">
      <div class="time-box"><strong>${formatTime(fixture.fixture?.date)}</strong><span>${escapeHtml(fixture.league?.round || '')}</span></div>
      <div class="teams-line">
        <div class="team-side home">${teamMark(home)}<span class="team-name">${escapeHtml(home.name || 'TBD')}</span></div>
        <div class="score">${goals.home} - ${goals.away}</div>
        <div class="team-side away"><span class="team-name">${escapeHtml(away.name || 'TBD')}</span>${teamMark(away)}</div>
      </div>
      <span class="status ${statusClass}">${escapeHtml(status)}</span>
    </a>`;
  }

  function bindMatchRows() {
    app.querySelectorAll('[data-match-id]').forEach(a => a.addEventListener('click', () => {
      state.selectedFixtureId = a.dataset.matchId;
    }));
  }

  async function renderMatchDetail(id) {
    const fixture = state.fixtures.find(f => String(f.fixture?.id) === String(id)) || state.detail[id]?.fixture;
    if (!fixture) { app.innerHTML = empty('Kampen blev ikke fundet.'); return; }
    title.textContent = 'Kampdetaljer';
    app.innerHTML = loader('Henter kampdetaljer');
    try {
      const detail = await getFixtureDetail(id, fixture);
      drawMatchDetail(detail);
    } catch (error) {
      console.error(error);
      showNotice(`Kun basisdata kunne vises: ${error.message}`, 'error');
      drawMatchDetail({ fixture, events: [], lineups: [], statistics: [] });
    }
  }

  async function getFixtureDetail(id, baseFixture) {
    const cachedAll = safeJson(localStorage.getItem(DETAIL_CACHE_KEY), {});
    const cached = state.detail[id] || cachedAll[id];
    if (cached && Date.now() - cached.savedAt < DETAIL_FRESH_MS) return cached;
    if (state.settings.useDemoData) return state.detail[id] || { fixture: baseFixture, events: [], lineups: [], statistics: [] };
    const [fixtureRes, eventRes, lineupRes, statRes] = await Promise.all([
      apiGet('/fixtures', { id, timezone: state.settings.timezone }),
      apiGet('/fixtures/events', { fixture: id }),
      apiGet('/fixtures/lineups', { fixture: id }),
      apiGet('/fixtures/statistics', { fixture: id })
    ]);
    const detail = {
      fixture: normalizeArray(fixtureRes.response)[0] || baseFixture,
      events: normalizeArray(eventRes.response),
      lineups: normalizeArray(lineupRes.response),
      statistics: normalizeArray(statRes.response),
      savedAt: Date.now()
    };
    state.detail[id] = detail;
    cachedAll[id] = detail;
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(cachedAll));
    return detail;
  }

  function drawMatchDetail(detail) {
    const f = detail.fixture;
    const home = f.teams?.home || {};
    const away = f.teams?.away || {};
    const score = getScore(f);
    const homeEvents = detail.events.filter(e => sameTeam(e.team, home));
    const awayEvents = detail.events.filter(e => sameTeam(e.team, away));
    const goalsHome = homeEvents.filter(isGoalEvent);
    const goalsAway = awayEvents.filter(isGoalEvent);
    const favorite = state.favorites.has(String(f.fixture?.id));
    app.innerHTML = `
      <section class="card detail-hero">
        <div class="scoreboard">
          <div class="scoreboard-meta">
            <b>${escapeHtml((f.league?.round || '').toUpperCase())}</b><br>
            ${escapeHtml(joinParts([f.fixture?.venue?.name, f.fixture?.venue?.city], ', '))} · ${formatDateTime(f.fixture?.date)}
          </div>
          <button class="favorite-btn ${favorite ? 'active' : ''}" id="favoriteBtn" type="button" title="Favorit">★</button>
          <div class="scoreboard-grid">
            <div class="score-team home">${teamMark(home, true)}<h2>${escapeHtml(home.name || 'TBD')}</h2></div>
            <div class="score-main"><strong>${score.home} - ${score.away}</strong><span>${escapeHtml(statusLabel(f.fixture?.status?.short))}</span></div>
            <div class="score-team away">${teamMark(away, true)}<h2>${escapeHtml(away.name || 'TBD')}</h2></div>
          </div>
          <div class="goal-summary">
            <div>${goalsHome.map(goalText).join('<br>') || '&nbsp;'}</div>
            <div>${goalsAway.map(goalText).join('<br>') || '&nbsp;'}</div>
          </div>
        </div>
        <div class="tabs">
          <button class="tab active" data-scroll="overviewBlock">Overblik</button>
          <button class="tab" data-scroll="lineupsBlock">Opstillinger</button>
          <button class="tab" data-scroll="statisticsBlock">Statistik</button>
          <button class="tab" data-scroll="timelineBlock">Kampforløb</button>
        </div>
      </section>

      <section id="overviewBlock" class="grid two" style="margin-top:14px">
        ${renderTeamPanel(home, homeEvents, 'home')}
        ${renderTeamPanel(away, awayEvents, 'away')}
      </section>

      <section id="lineupsBlock" class="card pitch-card" style="margin-top:14px">
        <h2 class="card-title">Opstillinger <small>${escapeHtml((detail.lineups[0]?.formation || '') + (detail.lineups[1]?.formation ? ' · ' + detail.lineups[1].formation : ''))}</small></h2>
        ${detail.lineups.length ? renderPitch(detail.lineups, detail.events) : empty('Opstillinger er ikke tilgængelige for kampen endnu.')}
      </section>

      <section id="statisticsBlock" class="card pad" style="margin-top:14px">
        <h2 class="card-title">Kampstatistik</h2>
        ${detail.statistics.length ? renderStatistics(detail.statistics) : empty('Statistik er ikke tilgængelig endnu.')}
      </section>

      <section id="timelineBlock" class="card pad" style="margin-top:14px">
        <h2 class="card-title">Kampforløb</h2>
        ${detail.events.length ? renderTimeline(detail.events) : empty('Der er ingen kampbegivenheder endnu.')}
      </section>
    `;
    $('#favoriteBtn').addEventListener('click', () => toggleFavorite(f.fixture?.id));
    app.querySelectorAll('[data-scroll]').forEach(btn => btn.addEventListener('click', () => {
      app.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function toggleFavorite(id) {
    const key = String(id);
    if (state.favorites.has(key)) state.favorites.delete(key); else state.favorites.add(key);
    saveFavorites();
    renderMatchDetail(key);
  }

  function renderTeamPanel(team, events, side) {
    const goals = events.filter(isGoalEvent);
    const cards = events.filter(e => String(e.type).toLowerCase() === 'card');
    const subs = events.filter(e => String(e.type).toLowerCase() === 'subst' || String(e.detail).toLowerCase().includes('substitution'));
    return `<div class="team-panel ${side}">
      <h3>${escapeHtml(team.name || 'Hold')}</h3>
      ${eventSection('Mål', goals, e => `<span>${minute(e)}</span><span>⚽</span><span>${escapeHtml(e.player?.name || '')}</span>`)}
      ${eventSection('Kort', cards, e => `<span>${minute(e)}</span><span>${cardIcon(e)}</span><span>${escapeHtml(e.player?.name || '')}</span>`)}
      ${eventSection('Udskiftninger', subs, e => `<span>${minute(e)}</span><span><b class="sub-in">↑</b></span><span>${escapeHtml(e.player?.name || '')} <b class="sub-out">↓</b> <span class="subtle">${escapeHtml(e.assist?.name || '')}</span></span>`)}
    </div>`;
  }

  function eventSection(titleText, events, rowFn) {
    return `<div class="event-section"><h4>${titleText}</h4>${events.length ? events.map(e => `<div class="event-line">${rowFn(e)}</div>`).join('') : '<p class="subtle">Ingen</p>'}</div>`;
  }

  function renderPitch(lineups, events) {
    const home = lineups[0];
    const away = lineups[1];
    const allPlayers = [
      ...pitchPlayers(home, 'home', events),
      ...pitchPlayers(away, 'away', events)
    ].join('');
    return `<div class="pitch-wrap">
      <div class="pitch">
        <span class="half-line"></span><span class="circle"></span><span class="box left"></span><span class="box right"></span>
        ${allPlayers}
      </div>
      <div class="coach"><b>Træner:</b> ${escapeHtml(home?.coach?.name || '—')} <span style="float:right"><b>Træner:</b> ${escapeHtml(away?.coach?.name || '—')}</span></div>
      <div class="bench">
        ${benchColumn(home)}
        ${benchColumn(away)}
      </div>
    </div>`;
  }

  function pitchPlayers(lineup, side, events) {
    if (!lineup) return [];
    const starters = lineup.startXI || [];
    const lineCounts = {};
    let maxLine = 5;
    starters.forEach(entry => {
      const grid = entry.player?.grid;
      if (!grid || !String(grid).includes(':')) return;
      const [lineRaw, colRaw] = String(grid).split(':').map(n => parseInt(n, 10));
      if (!Number.isFinite(lineRaw) || !Number.isFinite(colRaw)) return;
      maxLine = Math.max(maxLine, lineRaw);
      lineCounts[lineRaw] = Math.max(lineCounts[lineRaw] || 0, colRaw);
    });
    return starters.map((entry, idx) => {
      const p = entry.player || {};
      const pos = pitchPosition(p.grid, p.pos, side, idx, lineCounts, maxLine);
      const shirt = p.pos === 'G' ? (side === 'home' ? 'green' : 'gold') : (side === 'home' ? 'red' : 'blue');
      const playerEvents = eventsForPlayer(events, lineup.team, p.name);
      return `<div class="player" style="left:${pos.left}%;top:${pos.top}%">
        <div class="shirt ${shirt}">${escapeHtml(String(p.number || ''))}</div>
        <div class="player-name">${escapeHtml(shortName(p.name || ''))}</div>
        <div class="player-events">${playerEvents.map(eventMiniIcon).join('')}</div>
      </div>`;
    });
  }

  function pitchPosition(grid, pos, side, idx, lineCounts = {}, maxLine = 5) {
    if (grid && String(grid).includes(':')) {
      const [lineRaw, colRaw] = String(grid).split(':').map(n => parseInt(n, 10));
      const line = Number.isFinite(lineRaw) ? lineRaw : 1;
      const col = Number.isFinite(colRaw) ? colRaw : 1;
      const xHome = 8 + ((line - 1) / Math.max(1, maxLine - 1)) * 36;
      const left = side === 'home' ? xHome : 100 - xHome;
      const sameLineCount = Math.max(1, lineCounts[line] || 1);
      const top = sameLineCount === 1 ? 50 : 18 + ((col - 1) / Math.max(1, sameLineCount - 1)) * 64;
      return { left, top };
    }
    const rows = { G: [8, [50]], D: [18, [20, 38, 62, 80]], M: [31, [20, 40, 60, 80]], F: [43, [28, 50, 72]] };
    const row = rows[pos] || rows.M;
    const top = row[1][idx % row[1].length] || 50;
    const left = side === 'home' ? row[0] : 100 - row[0];
    return { left, top };
  }

  function benchColumn(lineup) {
    return `<div class="bench-col"><h4>${escapeHtml(lineup?.team?.name || 'Udskiftere')}</h4>
      <div class="bench-list">${(lineup?.substitutes || []).map(s => `<div class="bench-player"><b>${escapeHtml(String(s.player?.number || ''))}</b><span>${escapeHtml(s.player?.name || '')}</span></div>`).join('') || '<p class="subtle">Ingen udskiftere</p>'}</div>
    </div>`;
  }

  function renderStatistics(stats) {
    const home = stats[0], away = stats[1];
    const types = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'Corner Kicks', 'Fouls', 'Yellow Cards', 'Red Cards'];
    return `<div class="stats-list">${types.map(type => statRow(type, home, away)).join('')}</div>`;
  }

  function statRow(type, home, away) {
    const hv = statValue(home, type);
    const av = statValue(away, type);
    const hn = numeric(hv), an = numeric(av);
    const total = Math.max(1, hn + an);
    const hp = type === 'Ball Possession' && String(hv).includes('%') ? hn : (hn / total) * 100;
    const ap = type === 'Ball Possession' && String(av).includes('%') ? an : (an / total) * 100;
    return `<div class="stat-row"><strong>${escapeHtml(displayValue(hv))}</strong><div class="bar-pair"><div class="bar home"><span style="width:${clamp(hp)}%"></span></div><div class="bar-label">${translateStat(type)}</div><div class="bar away"><span style="width:${clamp(ap)}%"></span></div></div><strong>${escapeHtml(displayValue(av))}</strong></div>`;
  }

  function renderTimeline(events) {
    return `<div class="timeline">${events.slice().sort((a,b)=>eventMinuteNum(a)-eventMinuteNum(b)).map(e => `<div class="timeline-item"><strong>${minute(e)} ${eventIcon(e)} ${escapeHtml(e.player?.name || '')}</strong><p>${escapeHtml(e.team?.name || '')} · ${escapeHtml(e.detail || e.type || '')}${e.assist?.name ? ' · ' + escapeHtml(e.assist.name) : ''}</p></div>`).join('')}</div>`;
  }

  function renderGroups() {
    const groups = flattenStandings(state.standings);
    if (!groups.length) { app.innerHTML = empty('Ingen gruppedata fundet endnu.'); return; }
    app.innerHTML = `<div class="grid two">${groups.map((group, index) => `<section class="card group-card"><h3>Gruppe ${group.name || String.fromCharCode(65 + index)}</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Hold</th><th class="num">K</th><th class="num">V</th><th class="num">U</th><th class="num">T</th><th class="num">M</th><th class="num">+/-</th><th class="num">P</th></tr></thead><tbody>${group.rows.map(s => `<tr><td>${s.rank || ''}</td><td><span class="table-team">${teamMark(s.team)}${escapeHtml(s.team?.name || '')}</span></td><td class="num">${s.all?.played ?? ''}</td><td class="num">${s.all?.win ?? ''}</td><td class="num">${s.all?.draw ?? ''}</td><td class="num">${s.all?.lose ?? ''}</td><td class="num">${s.all?.goals?.for ?? ''}-${s.all?.goals?.against ?? ''}</td><td class="num">${s.goalsDiff ?? ''}</td><td class="num"><b>${s.points ?? ''}</b></td></tr>`).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }

  function renderTeams() {
    const teams = state.teams.length ? state.teams : collectTeams(state.fixtures).map(t => ({ team: t }));
    if (!teams.length) { app.innerHTML = empty('Ingen holddata fundet.'); return; }
    app.innerHTML = `<section class="grid three">${teams.map(item => { const t = item.team || item; return `<article class="card team-card">${teamMark(t, true)}<div><h3>${escapeHtml(t.name || '')}</h3><p>${escapeHtml(joinParts([t.country, item.venue?.name], ' · ') || 'VM 2026')}</p></div></article>`; }).join('')}</section>`;
  }

  function renderStats() {
    const fixtures = state.fixtures;
    const done = fixtures.filter(isFinished);
    const goals = countGoals(done);
    const topTeams = collectTeamStats(done).slice(0, 8);
    app.innerHTML = `<div class="grid two"><section class="card pad"><h2 class="card-title">Turneringsstatistik</h2><div class="grid two">${metric(done.length, 'Spillede kampe')}${metric(goals, 'Mål')}${metric(avgGoals(done), 'Mål/kamp')}${metric(fixtures.filter(isLive).length, 'Live')}</div></section><section class="card pad"><h2 class="card-title">Mest scorende hold</h2>${topTeams.length ? `<table class="data-table"><tbody>${topTeams.map(t => `<tr><td><span class="table-team">${teamMark(t)}${escapeHtml(t.name)}</span></td><td class="num"><b>${t.goals}</b></td></tr>`).join('')}</tbody></table>` : empty('Ingen færdigspillede kampe endnu.')}</section></div>`;
  }

  function renderStadiums() {
    const venues = collectVenues(state.fixtures);
    if (!venues.length) { app.innerHTML = empty('Ingen stadiondata fundet.'); return; }
    app.innerHTML = `<section class="grid three">${venues.map(v => `<article class="card pad venue-card"><h3>${escapeHtml(v.name || 'Ukendt stadion')}</h3><p>${escapeHtml(v.city || '')}</p><div class="meta"><span class="pill gold">${v.count} kamp${v.count === 1 ? '' : 'e'}</span>${v.next ? `<span class="pill">Næste: ${formatShortDate(v.next)}</span>` : ''}</div></article>`).join('')}</section>`;
  }

  function renderFavorites() {
    const list = state.fixtures.filter(f => state.favorites.has(String(f.fixture?.id)));
    app.innerHTML = `<section class="card pad"><h2 class="card-title">Favoritter <small>${list.length}</small></h2><div class="match-list">${list.length ? list.map(renderMatchRow).join('') : empty('Du har ikke markeret nogen favoritkampe endnu.')}</div></section>`;
    bindMatchRows();
  }

  function renderSettings() {
    app.innerHTML = `<section class="card pad"><h2 class="card-title">Indstillinger</h2><form id="settingsForm" class="form">
      <div class="switch-row"><div><strong>Brug demo-data</strong><span>Live-data er standard. Slå kun til ved test.</span></div><label class="switch"><input id="useDemoData" type="checkbox" ${state.settings.useDemoData ? 'checked' : ''}><span class="slider"></span></label></div>
      <div class="field"><label for="apiKey">KickoffAPI nøgle</label><input id="apiKey" type="password" autocomplete="off" placeholder="Indsæt API-nøgle" value="${escapeAttr(state.settings.apiKey)}"></div>
      <div class="field"><label for="apiBase">API base URL</label><input id="apiBase" type="url" value="${escapeAttr(state.settings.apiBase)}"></div>
      <div class="field"><label for="proxyUrl">Proxy URL, valgfri</label><input id="proxyUrl" type="url" placeholder="https://din-worker.workers.dev" value="${escapeAttr(state.settings.proxyUrl)}"><span class="tiny">Brug proxy hvis du vil skjule nøglen eller rammer CORS.</span></div>
      <div class="grid two">
        <div class="field"><label for="leagueId">League ID</label><input id="leagueId" inputmode="numeric" placeholder="Automatisk søgning hvis tom" value="${escapeAttr(state.settings.leagueId)}"></div>
        <div class="field"><label for="season">Sæson</label><input id="season" inputmode="numeric" value="${escapeAttr(String(state.settings.season))}"></div>
      </div>
      <div class="field"><label for="timezone">Tidszone</label><input id="timezone" value="${escapeAttr(state.settings.timezone)}"></div>
      <div class="switch-row"><div><strong>Auto-opdatér næste 5 kampe</strong><span>Opdaterer hvert 10. minut, når live-data er aktiv.</span></div><label class="switch"><input id="autoRefresh" type="checkbox" ${state.settings.autoRefresh ? 'checked' : ''}><span class="slider"></span></label></div>
      <div class="button-row"><button class="primary-btn" type="submit">Gem</button><button id="testApi" class="ghost-btn" type="button">Test API</button><button id="clearCache" class="danger-btn" type="button">Ryd cache</button></div>
    </form></section>`;

    $('#settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.settings = {
        ...state.settings,
        apiKey: $('#apiKey').value.trim(),
        apiBase: $('#apiBase').value.trim() || 'https://api.kickoffapi.com/api/v1',
        proxyUrl: $('#proxyUrl').value.trim(),
        leagueId: $('#leagueId').value.trim(),
        season: Number($('#season').value || 2026),
        timezone: $('#timezone').value.trim() || 'Europe/Copenhagen',
        useDemoData: $('#useDemoData').checked,
        autoRefresh: $('#autoRefresh').checked
      };
      saveSettings();
      showNotice('Indstillinger gemt.', 'good');
      loadCoreData(true);
    });
    $('#clearCache').addEventListener('click', () => { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(DETAIL_CACHE_KEY); showNotice('Cache ryddet.', 'good'); });
    $('#testApi').addEventListener('click', testApi);
  }

  async function testApi() {
    const previous = { ...state.settings };
    state.settings.apiKey = $('#apiKey').value.trim();
    state.settings.apiBase = $('#apiBase').value.trim() || previous.apiBase;
    state.settings.proxyUrl = $('#proxyUrl').value.trim();
    try {
      const res = await apiGet('/timezone');
      showNotice(`API-test OK. ${normalizeArray(res.response).length || 'Flere'} tidszoner returneret.`, 'good');
    } catch (error) {
      showNotice(`API-test fejlede: ${error.message}`, 'error');
    } finally {
      state.settings = previous;
    }
  }

  function renderData() {
    const cache = safeJson(localStorage.getItem(CACHE_KEY), null);
    app.innerHTML = `<section class="card pad"><h2 class="card-title">Data og cache</h2><div class="grid two">
      ${metric(state.settings.useDemoData ? 'Demo' : 'Live', 'Datatilstand')}
      ${metric(formatUpdated(), 'Senest hentet')}
      ${metric(cache?.leagueId || state.settings.leagueId || '—', 'League ID')}
      ${metric(state.fixtures.length, 'Kampe i cache')}
    </div><div class="button-row" style="margin-top:16px"><button id="exportData" class="ghost-btn" type="button">Eksportér JSON</button><button id="forceRefresh" class="primary-btn" type="button">Hent alt igen</button></div><p class="subtle" style="margin-top:15px">Service worker cacher kun appens egne filer. Kampdata ligger i browserens localStorage.</p></section>`;
    $('#forceRefresh').addEventListener('click', () => loadCoreData(true));
    $('#exportData').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ settings: { ...state.settings, apiKey: '***' }, fixtures: state.fixtures, standings: state.standings, teams: state.teams }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vm-2026-data.json'; a.click(); URL.revokeObjectURL(a.href);
    });
  }

  async function refreshNextMatches(force = false) {
    if (state.settings.useDemoData || !state.settings.autoRefresh || state.refreshing || (!state.settings.apiKey && !state.settings.proxyUrl)) return;
    const candidates = state.fixtures.filter(f => !isFinished(f)).slice(0, 5);
    if (!candidates.length) return;
    state.refreshing = true;
    try {
      await ensureLeagueId();
      const updated = await Promise.all(candidates.map(f => apiGet('/fixtures', { id: f.fixture?.id, timezone: state.settings.timezone }).then(r => normalizeArray(r.response)[0]).catch(() => null)));
      updated.filter(Boolean).forEach(u => {
        const idx = state.fixtures.findIndex(f => String(f.fixture?.id) === String(u.fixture?.id));
        if (idx >= 0) state.fixtures[idx] = u;
      });
      state.lastLoaded = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: state.lastLoaded, season: state.settings.season, leagueId: state.settings.leagueId, fixtures: state.fixtures, standings: state.standings, teams: state.teams }));
      if (force) showNotice('Næste 5 kampe er opdateret.', 'good');
      if (!state.selectedFixtureId) render();
    } catch (e) {
      if (force) showNotice(`Opdatering fejlede: ${e.message}`, 'error');
    } finally {
      state.refreshing = false;
    }
  }

  function flattenStandings(raw) {
    const groups = [];
    raw.forEach(item => {
      const standings = item.league?.standings || item.standings || [];
      standings.forEach((rows, idx) => groups.push({ name: rows?.[0]?.group?.replace(/^Group\s*/i, '') || '', rows: rows || [], idx }));
    });
    return groups;
  }

  function groupByDate(fixtures) {
    return fixtures.reduce((acc, f) => {
      const key = formatDate(f.fixture?.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    }, {});
  }

  function collectTeams(fixtures) {
    const map = new Map();
    fixtures.forEach(f => [f.teams?.home, f.teams?.away].forEach(t => { if (t?.id && !map.has(t.id)) map.set(t.id, t); }));
    return [...map.values()];
  }

  function collectVenues(fixtures) {
    const map = new Map();
    fixtures.forEach(f => {
      const v = f.fixture?.venue || {};
      if (!v.name) return;
      const key = `${v.name}-${v.city || ''}`;
      const item = map.get(key) || { name: v.name, city: v.city, count: 0, next: null };
      item.count++;
      if (!isFinished(f) && (!item.next || new Date(f.fixture.date) < new Date(item.next))) item.next = f.fixture.date;
      map.set(key, item);
    });
    return [...map.values()].sort((a,b)=>b.count-a.count);
  }

  function collectTeamStats(fixtures) {
    const map = new Map();
    fixtures.forEach(f => {
      const s = getScore(f);
      [[f.teams?.home, numeric(s.home)], [f.teams?.away, numeric(s.away)]].forEach(([t, g]) => {
        if (!t?.id) return;
        const row = map.get(t.id) || { ...t, goals: 0 };
        row.goals += g;
        map.set(t.id, row);
      });
    });
    return [...map.values()].sort((a,b)=>b.goals-a.goals);
  }

  function countGoals(fixtures) {
    return fixtures.reduce((sum, f) => sum + numeric(getScore(f).home) + numeric(getScore(f).away), 0);
  }
  function avgGoals(fixtures) {
    const done = fixtures.filter(isFinished);
    if (!done.length) return '—';
    return (countGoals(done) / done.length).toFixed(2);
  }

  function getScore(f) {
    const home = f.goals?.home ?? f.score?.fulltime?.home ?? null;
    const away = f.goals?.away ?? f.score?.fulltime?.away ?? null;
    return { home: home ?? '–', away: away ?? '–' };
  }

  function statusLabel(short) {
    const map = { NS: 'Ikke startet', TBD: 'Ukendt', '1H': '1. halvleg', HT: 'Pause', '2H': '2. halvleg', ET: 'Forlænget', BT: 'Pause', P: 'Straffe', FT: 'FT', AET: 'Efter forl.', PEN: 'Straffe', PST: 'Udsat', CANC: 'Aflyst', ABD: 'Afbrudt', LIVE: 'Live' };
    return map[short] || short || 'Ukendt';
  }
  function isFinished(f) { return ['FT','AET','PEN'].includes(String(f.fixture?.status?.short || '').toUpperCase()); }
  function isLive(f) { return ['1H','2H','ET','P','BT','HT','LIVE'].includes(String(f.fixture?.status?.short || '').toUpperCase()); }

  function teamMark(team, large = false) {
    const logo = team?.logo;
    if (logo) return `<img class="logo" src="${escapeAttr(logo)}" alt="">`;
    return `<span class="flag" aria-hidden="true">${flagEmoji(team?.name || team?.country || '')}</span>`;
  }

  function flagEmoji(name) {
    const n = String(name).toLowerCase();
    const map = [
      ['danmark','🇩🇰'],['denmark','🇩🇰'],['frankrig','🇫🇷'],['france','🇫🇷'],['norge','🇳🇴'],['norway','🇳🇴'],['sydafrika','🇿🇦'],['south africa','🇿🇦'],
      ['usa','🇺🇸'],['united states','🇺🇸'],['england','🏴'],['mexico','🇲🇽'],['canada','🇨🇦'],['japan','🇯🇵'],['brazil','🇧🇷'],['brasilien','🇧🇷'],['argentina','🇦🇷'],['germany','🇩🇪'],['tyskland','🇩🇪'],['spain','🇪🇸'],['spanien','🇪🇸'],['italy','🇮🇹'],['italien','🇮🇹'],['portugal','🇵🇹'],['netherlands','🇳🇱'],['holland','🇳🇱'],['belgium','🇧🇪'],['belgien','🇧🇪']
    ];
    return (map.find(([key]) => n.includes(key)) || [null, '⚑'])[1];
  }

  function sameTeam(eventTeam, team) { return eventTeam?.id === team?.id || String(eventTeam?.name || '').toLowerCase() === String(team?.name || '').toLowerCase(); }
  function isGoalEvent(e) { return String(e.type).toLowerCase() === 'goal' || String(e.detail).toLowerCase().includes('goal'); }
  function goalText(e) { return `${escapeHtml(e.player?.name || '')} ${minute(e)} ⚽`; }
  function minute(e) { const t = e.time || {}; return `${t.elapsed ?? ''}${t.extra ? '+' + t.extra : ''}'`; }
  function eventMinuteNum(e) { return Number(e.time?.elapsed || 0) + Number(e.time?.extra || 0) / 100; }
  function cardIcon(e) { return String(e.detail).toLowerCase().includes('red') ? '<span class="red-card"></span>' : '<span class="yellow-card"></span>'; }
  function eventIcon(e) { if (isGoalEvent(e)) return '⚽'; if (String(e.type).toLowerCase() === 'card') return String(e.detail).toLowerCase().includes('red') ? '🟥' : '🟨'; if (String(e.type).toLowerCase().includes('subst')) return '↕'; return '•'; }
  function eventMiniIcon(e) { if (isGoalEvent(e)) return '⚽'; if (String(e.type).toLowerCase() === 'card') return String(e.detail).toLowerCase().includes('red') ? '🟥' : '🟨'; if (String(e.type).toLowerCase().includes('subst')) return '↕'; return ''; }
  function eventsForPlayer(events, team, playerName) { const name = String(playerName || '').toLowerCase(); return events.filter(e => sameTeam(e.team, team) && String(e.player?.name || '').toLowerCase() === name); }

  function statValue(obj, type) { return obj?.statistics?.find(s => s.type === type)?.value ?? 0; }
  function translateStat(type) { return ({ 'Ball Possession': 'Boldbesiddelse', 'Total Shots': 'Skud', 'Shots on Goal': 'Skud på mål', 'Corner Kicks': 'Hjørnespark', 'Fouls': 'Frispark', 'Yellow Cards': 'Gule kort', 'Red Cards': 'Røde kort' })[type] || type; }
  function displayValue(v) { return v === null || v === undefined ? '0' : String(v); }
  function numeric(v) { if (v === '–') return 0; const n = Number(String(v ?? 0).replace('%','').trim()); return Number.isFinite(n) ? n : 0; }
  function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }
  function shortName(name) { const parts = String(name).trim().split(/\s+/); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name; }

  function formatDate(date) { if (!date) return 'Ukendt dato'; return new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: state.settings.timezone }).format(new Date(date)); }
  function formatShortDate(date) { if (!date) return '—'; return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: state.settings.timezone }).format(new Date(date)); }
  function formatTime(date) { if (!date) return '—'; return new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: state.settings.timezone }).format(new Date(date)); }
  function formatDateTime(date) { if (!date) return '—'; return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: state.settings.timezone }).format(new Date(date)); }
  function formatUpdated() { return state.lastLoaded ? formatShortDate(state.lastLoaded) : 'Ikke hentet'; }
  function joinParts(parts, sep) { return parts.filter(Boolean).join(sep); }

  function loader(text) { return `<div class="loader"><div><div class="spinner"></div><span>${escapeHtml(text)}</span></div></div>`; }
  function empty(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
  function showNotice(message, type = '') { notice.hidden = false; notice.className = `notice ${type}`.trim(); notice.textContent = message; }
  function clearNotice() { notice.hidden = true; notice.className = 'notice'; notice.textContent = ''; }

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  function setupInstallPrompt() {
    const bar = $('#installBar');
    const install = $('#installBtn');
    const dismiss = $('#dismissInstall');
    if (localStorage.getItem('kickoff-install-dismissed')) return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      bar.hidden = false;
    });
    install.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      bar.hidden = true;
    });
    dismiss.addEventListener('click', () => { localStorage.setItem('kickoff-install-dismissed', '1'); bar.hidden = true; });
  }
})();
