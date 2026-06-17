(() => {
  'use strict';

  const APP_VERSION = 'v14-pro';
  const KICKOFF_BASE = 'https://api.kickoffapi.com/api/v1';
  const KICKOFF_LEAGUE = '1';
  const KICKOFF_SEASON = '2026';
  const DEFAULT_KICKOFF_KEY = 'ft_kiodoa_2f917696298d3baa5ac9f9eb9dcb33200a4275de';
  const DEFAULT_TZ = 'Europe/Copenhagen';

  const KICKOFF_KEY_STORAGE = 'vm2026:kickoffApiKey:v1';
  const CACHE_KEY = `vm2026:data:kickoff:${APP_VERSION}`;
  const MATCH_DETAILS_CACHE_KEY = `vm2026:kickoffMatchDetails:${APP_VERSION}`;
  const RATE_LIMIT_KEY = 'vm2026:kickoffRateLimit:v2';
  const REQUEST_META_KEY = 'vm2026:kickoffRequestMeta:v2';
  const REQUEST_TIMESTAMPS_KEY = 'vm2026:kickoffRequestTimestamps:v2';

  const MAX_API_CALLS_PER_MINUTE = 60;
  const MAX_API_CALLS_PER_DAY = 100000;
  const MIN_API_INTERVAL_MS = 250;
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const LIVE_CACHE_TTL_MS = 45 * 1000;
  const MANUAL_REFRESH_MIN_MS = 10 * 1000;
  const AUTO_UPDATE_MATCH_LIMIT = 5;
  const DETAIL_PRELOAD_CONCURRENCY = 2;
  const UPCOMING_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const LIVE_DETAILS_CACHE_TTL_MS = 45 * 1000;
  const FINISHED_DETAILS_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

  const FAVORITE_TEAMS_KEY = 'vm2026:favTeams:v1';
  const FAVORITE_MATCHES_KEY = 'vm2026:favMatches:v1';

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
    favoriteTeams: new Set(readArray(FAVORITE_TEAMS_KEY)),
    favoriteMatches: new Set(readArray(FAVORITE_MATCHES_KEY))
  };

  const detailFetchesInFlight = new Map();
  let detailPreloadRunId = 0;
  let detailPreloadRenderTimer = null;
  let toastTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindNavigation();
    els.refreshBtn?.addEventListener('click', () => refreshData(true));
    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('online', () => toast('Du er online igen.'));
    window.addEventListener('offline', () => toast('Offline. Viser gemte data hvis muligt.'));
    registerServiceWorker();
    refreshData(false);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').then(registration => {
      registration.update?.();
    }).catch(() => {});
  }

  function bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        setView(button.dataset.view || 'home');
      });
    });
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function refreshData(manual = false) {
    setRefreshLoading(true);
    state.error = null;
    try {
      const cached = readCache(CACHE_KEY);
      if (cached && !shouldFetchFreshData(cached, manual)) {
        useData(cached.data, cached.source || 'gemt cache', cached.lastUpdated);
        render();
        startKickoffDetailsPreload({ force: false });
        if (manual) toast('Bruger gemte data. Tryk igen om lidt for nyt API-kald.');
        return;
      }

      const data = await fetchKickoffData();
      useData(data, 'KickoffAPI', new Date().toISOString());
      writeCache(CACHE_KEY, { data, source: 'KickoffAPI', lastUpdated: state.lastUpdated });
      render();
      startKickoffDetailsPreload({ force: manual });
      if (manual) toast('Kampprogram opdateret fra KickoffAPI.');
    } catch (error) {
      const cached = readCache(CACHE_KEY);
      if (cached?.data) {
        useData(cached.data, 'gemt cache', cached.lastUpdated);
        state.error = `KickoffAPI kunne ikke hentes: ${error.message}. Viser gemt data.`;
        render();
        startKickoffDetailsPreload({ force: false });
        if (manual) toast('KickoffAPI fejlede. Viser gemt data.');
      } else {
        useData(FALLBACK_DATA, 'indbygget fallback', new Date().toISOString());
        state.error = `KickoffAPI kunne ikke hentes: ${error.message}. Viser begrænset fallback.`;
        render();
        if (manual) toast('Kunne ikke hente KickoffAPI.');
      }
    } finally {
      setRefreshLoading(false);
    }
  }

  async function fetchKickoffData() {
    if (!getKickoffKey()) throw new Error('mangler KickoffAPI-nøgle');
    const fixtures = await kickoffGet('fixtures', { league: KICKOFF_LEAGUE, season: KICKOFF_SEASON, timezone: DEFAULT_TZ });
    if (!Array.isArray(fixtures) || !fixtures.length) throw new Error('KickoffAPI returnerede ingen fixtures');
    const matches = fixtures.map(item => normalizeKickoffMatch(item));
    return { name: 'FIFA World Cup 2026', source: 'KickoffAPI', api: 'kickoff', matches, raw: { response: fixtures } };
  }

  async function kickoffGet(path, params = {}) {
    await waitForApiBudget();
    const cleanPath = String(path).replace(/^\/+/, '');
    const url = new URL(`${KICKOFF_BASE}/${cleanPath}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'x-api-key': getKickoffKey() }
    });
    rememberRateLimit(response.headers);

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      const apiMessage = formatApiError(payload) || response.statusText || 'ukendt fejl';
      throw new Error(`HTTP ${response.status} ved ${cleanPath}: ${apiMessage}`);
    }

    const apiMessage = formatApiError(payload);
    if (apiMessage) throw new Error(`${cleanPath}: ${apiMessage}`);

    const data = unwrapKickoffPayload(payload);
    if (!Array.isArray(data)) throw new Error(`ukendt KickoffAPI-format ved ${cleanPath}`);
    return data;
  }

  async function kickoffGetFirst(candidates) {
    const errors = [];
    for (const candidate of candidates) {
      try {
        return await kickoffGet(candidate.path, candidate.params || {});
      } catch (error) {
        errors.push(`${candidate.path}: ${error.message}`);
      }
    }
    throw new Error(errors.join(' | '));
  }

  function unwrapKickoffPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.response)) return payload.response;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.fixtures)) return payload.fixtures;
    if (Array.isArray(payload.items)) return payload.items;
    if (payload.response && typeof payload.response === 'object') return [payload.response];
    if (payload.data && typeof payload.data === 'object') return [payload.data];
    return [];
  }

  function formatApiError(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const errors = payload.errors || payload.error;
    if (!errors || (Array.isArray(errors) && !errors.length)) return '';
    if (Array.isArray(errors)) return errors.filter(Boolean).join(', ');
    if (typeof errors === 'string') return errors;
    if (typeof errors === 'object') {
      return Object.entries(errors)
        .map(([key, value]) => {
          if (!value || (Array.isArray(value) && !value.length)) return '';
          const text = Array.isArray(value) ? value.join(', ') : String(value);
          return key ? `${key}: ${text}` : text;
        })
        .filter(Boolean)
        .join(' · ');
    }
    return String(errors);
  }

  function getKickoffKey() {
    return localStorage.getItem(KICKOFF_KEY_STORAGE) || DEFAULT_KICKOFF_KEY;
  }

  function rememberRateLimit(headers) {
    const meta = readRequestMeta();
    const minuteRemaining = firstFiniteNumber(
      headers.get('X-Requests-Available-Minute'),
      headers.get('X-RateLimit-Remaining'),
      headers.get('x-ratelimit-requests-remaining')
    );
    const resetSeconds = firstFiniteNumber(headers.get('X-RequestCounter-Reset'), headers.get('Retry-After'));
    writeRequestMeta({
      ...meta,
      lastRequestAt: Date.now(),
      minuteRemaining: minuteRemaining ?? meta.minuteRemaining,
      resetSeconds: resetSeconds ?? meta.resetSeconds,
      lastHeaderReadAt: new Date().toISOString()
    });
    if (minuteRemaining !== null && minuteRemaining <= 1 && resetSeconds !== null && resetSeconds > 0) {
      localStorage.setItem(RATE_LIMIT_KEY, String(Date.now() + (resetSeconds + 5) * 1000));
    } else {
      localStorage.removeItem(RATE_LIMIT_KEY);
    }
  }

  async function waitForApiBudget() {
    const throttledUntil = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0);
    if (throttledUntil && Date.now() < throttledUntil) {
      await delay(Math.max(1000, throttledUntil - Date.now()));
    }

    const now = Date.now();
    let all = readRequestTimestamps().filter(ts => now - ts < 24 * 60 * 60 * 1000);
    if (all.length >= MAX_API_CALLS_PER_DAY) throw new Error('lokal dagsgrænse nået');

    const recent = all.filter(ts => now - ts < 60 * 1000);
    if (recent.length >= MAX_API_CALLS_PER_MINUTE) {
      const waitMs = 60000 - (now - recent[0]) + 250;
      await delay(Math.max(waitMs, 1000));
      return waitForApiBudget();
    }

    const meta = readRequestMeta();
    const sinceLast = now - (meta.lastRequestAt || 0);
    if (sinceLast < MIN_API_INTERVAL_MS) {
      await delay(MIN_API_INTERVAL_MS - sinceLast + 25);
      return waitForApiBudget();
    }

    const stamp = Date.now();
    all = readRequestTimestamps().filter(ts => stamp - ts < 24 * 60 * 60 * 1000);
    all.push(stamp);
    localStorage.setItem(REQUEST_TIMESTAMPS_KEY, JSON.stringify(all));
    writeRequestMeta({ ...meta, lastRequestAt: stamp });
  }

  function readRequestMeta() {
    return readObject(REQUEST_META_KEY);
  }

  function writeRequestMeta(meta) {
    localStorage.setItem(REQUEST_META_KEY, JSON.stringify(meta));
  }

  function readRequestTimestamps() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REQUEST_TIMESTAMPS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function shouldFetchFreshData(cached, manual) {
    if (!cached?.lastUpdated) return true;
    const age = Date.now() - new Date(cached.lastUpdated).getTime();
    if (manual) return age > MANUAL_REFRESH_MIN_MS || cached.source !== 'KickoffAPI';
    const matches = cached.data?.matches || [];
    const hasLive = matches.some(match => isLiveStatus(match.apiStatus || match.status));
    return age >= (hasLive ? LIVE_CACHE_TTL_MS : CACHE_TTL_MS);
  }

  function useData(data, source, lastUpdated = new Date().toISOString()) {
    state.data = data;
    state.matches = (data.matches || []).map((match, index) => normalizeMatch(match, index));
    state.lastUpdated = lastUpdated;
    state.dataSource = source;
    hydrateMatchesFromDetailsCache();
  }

  function normalizeMatch(match, index) {
    const kickoff = match.utcDate ? new Date(match.utcDate) : parseKickoff(match.date, match.time);
    const id = String(match.num || match.fixtureId || match.id || `${match.date || 'ukendt'}-${match.time || ''}-${match.team1 || ''}-${match.team2 || ''}-${index}`);
    let score = extractScore(match);
    if (!score) score = deriveScoreFromEvents(match);
    const apiStatus = match.apiStatus || match.status || '';
    const status = isLiveStatus(apiStatus) ? 'live' : (score || isFinishedStatus(apiStatus)) ? 'result' : kickoff && isSameCopenhagenDate(kickoff, new Date()) ? 'today' : 'scheduled';
    return {
      ...match,
      id,
      index,
      kickoff,
      score,
      isGroup: Boolean(match.group),
      status,
      roundDa: translateRound(match.round),
      groupDa: match.group ? String(match.group).replace('Group', 'Gruppe') : null
    };
  }

  function normalizeKickoffMatch(item) {
    const fixture = item.fixture || item;
    const league = item.league || {};
    const teams = item.teams || {};
    const home = teams.home || item.homeTeam || item.home || fixture.homeTeam || fixture.home || {};
    const away = teams.away || item.awayTeam || item.away || fixture.awayTeam || fixture.away || {};
    const events = collectKickoffEvents(item);
    const lineups = collectKickoffList(item.lineups || item.rawDetail?.lineups);
    const stats = collectKickoffList(item.statistics || item.fixtureStatistics || item.rawDetail?.statistics);
    const homeName = teamNameFrom(home, item.team1 || item.home_name || item.homeName || item.home_team || item.home) || 'TBD';
    const awayName = teamNameFrom(away, item.team2 || item.away_name || item.awayName || item.away_team || item.away) || 'TBD';
    const fixtureId = fixture.id || item.fixtureId || item.fixture_id || item.num || item.id;
    const rawStatus = fixture.status?.short || item.statusShort || fixture.statusShort || item.status_short || item.apiStatus || item.status || fixture.status?.long || fixture.status || '';
    const kickoffInstant = parseKickoffApiInstant(item, fixture);
    const kickoffIso = kickoffInstant ? kickoffInstant.toISOString() : (item.utcDate || '');
    const kickoffDate = kickoffInstant ? dateKeyCph(kickoffInstant) : extractDatePart(fixture.date || item.date || item.utcDate || item.kickoff || item.start_time);
    return {
      ...item,
      num: fixtureId,
      sourceType: 'kickoff',
      team1: homeName,
      team2: awayName,
      team1Id: teamIdFrom(home) || item.team1Id || item.homeTeamId || item.home_team_id || item.homeId || item.home_id || null,
      team2Id: teamIdFrom(away) || item.team2Id || item.awayTeamId || item.away_team_id || item.awayId || item.away_id || null,
      utcDate: kickoffIso,
      date: kickoffDate || '',
      round: kickoffRoundLabel(league.round || item.round || item.stage || item.roundName || item.round_name),
      group: kickoffGroupLabel(league.round || item.round || item.group || item.groupName || item.group_name),
      ground: [fixture.venue?.name || item.venue?.name || item.stadium || item.ground, fixture.venue?.city || item.venue?.city || item.city].filter(Boolean).join(' · '),
      apiStatus: rawStatus,
      liveMinute: fixture.status?.elapsed || item.elapsed || item.minute || '',
      lastUpdated: item.updatedAt || item.lastUpdated || item.updated || '',
      score: kickoffScoreFromItem(item, home, away, events),
      rawGoals: getKickoffGoalsObject(item),
      events,
      goals: events.filter(isGoalEvent),
      bookings: events.filter(isCardEvent),
      substitutions: events.filter(isSubstitutionEvent),
      fixtureStatistics: stats,
      lineups,
      referee: fixture.referee || item.referee || '',
      timezone: fixture.timezone || item.timezone || 'UTC'
    };
  }

  function getKickoffGoalsObject(item) {
    const fixture = item.fixture || {};
    const candidates = [item.goals, fixture.goals, item.result?.goals, item.scores?.goals, item.score?.goals];
    return candidates.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
  }

  function kickoffScoreFromItem(item, home = {}, away = {}, events = []) {
    const fixture = item.fixture || {};
    const score = item.score || fixture.score || {};
    const fixtureScore = fixture.score || {};
    const goalsObj = getKickoffGoalsObject(item);
    const full = firstScorePair(
      [goalsObj.home, goalsObj.away],
      [goalsObj.homeTeam, goalsObj.awayTeam],
      [home.goals, away.goals],
      [home.score, away.score],
      [item.homeTeam?.goals, item.awayTeam?.goals],
      [item.teams?.home?.goals, item.teams?.away?.goals],
      [fixture.homeTeam?.goals, fixture.awayTeam?.goals],
      [item.home_score, item.away_score],
      [item.homeScore, item.awayScore],
      [item.score1, item.score2],
      [item.goals1, item.goals2],
      [score.home, score.away],
      [score.homeTeam, score.awayTeam],
      [score.fullTime?.home, score.fullTime?.away],
      [score.fulltime?.home, score.fulltime?.away],
      [score.full_time?.home, score.full_time?.away],
      [score.ft?.home, score.ft?.away],
      [score.final?.home, score.final?.away],
      [fixtureScore.fullTime?.home, fixtureScore.fullTime?.away],
      [fixtureScore.fulltime?.home, fixtureScore.fulltime?.away],
      [fixtureScore.full_time?.home, fixtureScore.full_time?.away],
      [fixtureScore.home, fixtureScore.away],
      Array.isArray(score) ? [score[0], score[1]] : [],
      Array.isArray(score.ft) ? [score.ft[0], score.ft[1]] : [],
      Array.isArray(score.final) ? [score.final[0], score.final[1]] : []
    );
    const halfTime = firstScorePart([score.halftime?.home, score.halftime?.away], [score.halfTime?.home, score.halfTime?.away], [score.half_time?.home, score.half_time?.away], [fixtureScore.halftime?.home, fixtureScore.halftime?.away]);
    const regularTime = firstScorePart([score.fulltime?.home, score.fulltime?.away], [score.fullTime?.home, score.fullTime?.away], [score.full_time?.home, score.full_time?.away], full ? [full.home, full.away] : []);
    const extraTime = firstScorePart([score.extratime?.home, score.extratime?.away], [score.extraTime?.home, score.extraTime?.away], [score.extra_time?.home, score.extra_time?.away]);
    const penalties = firstScorePart([score.penalty?.home, score.penalty?.away], [score.penalties?.home, score.penalties?.away], [score.p?.home, score.p?.away]);
    if (full) {
      return { a: full.home, b: full.away, label: `${full.rawHome}-${full.rawAway}`, fullTime: { home: full.home, away: full.away }, halfTime, regularTime, extraTime, penalties, winner: score.winner || item.winner || item.result?.winner, duration: score.duration || item.duration || item.result?.duration };
    }
    const goalEvents = events.filter(isGoalEvent);
    if (goalEvents.length) {
      const homeId = teamIdFrom(home) || item.team1Id;
      const awayId = teamIdFrom(away) || item.team2Id;
      const homeName = teamNameFrom(home, item.team1);
      const awayName = teamNameFrom(away, item.team2);
      const homeGoals = goalEvents.filter(event => eventBelongsToSide(event, 1, homeId, homeName)).length;
      const awayGoals = goalEvents.filter(event => eventBelongsToSide(event, 2, awayId, awayName)).length;
      if (homeGoals || awayGoals) return { a: homeGoals, b: awayGoals, label: `${homeGoals}-${awayGoals}`, inferredFromEvents: true, halfTime, regularTime, extraTime, penalties };
    }
    return null;
  }

  function firstScorePair(...pairs) {
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [home, away] = pair;
      if (isNumberLike(home) && isNumberLike(away)) return { home: Number(home), away: Number(away), rawHome: home, rawAway: away };
    }
    return null;
  }

  function firstScorePart(...pairs) {
    const pair = firstScorePair(...pairs);
    return pair ? { home: pair.home, away: pair.away } : null;
  }

  function collectKickoffList(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.response)) return value.response;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.results)) return value.results;
    return [];
  }

  function collectKickoffEvents(item) {
    const candidates = [item.events, item.response, item.data, item.matchEvents, item.timeline, item.incidents, item.fixture?.events, item.rawDetail?.events];
    for (const candidate of candidates) {
      const list = collectKickoffList(candidate);
      if (list.length) return list;
    }
    return [];
  }

  function eventKind(event) {
    return String(event?.type || event?.detail || event?.event_type || event?.eventType || event?.kind || event?.name || '').toLowerCase();
  }

  function isGoalEvent(event) {
    const text = eventKind(event);
    return text.includes('goal') && !text.includes('cancel') && !text.includes('disallow');
  }

  function isCardEvent(event) {
    const text = eventKind(event);
    return text.includes('card') || text.includes('yellow') || text.includes('red');
  }

  function isSubstitutionEvent(event) {
    const text = eventKind(event);
    return text.includes('subst') || text.includes('substitution');
  }

  function teamNameFrom(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return fallback || '';
    return value.name || value.shortName || value.short_name || value.team_name || fallback || '';
  }

  function teamIdFrom(value) {
    if (!value || typeof value !== 'object') return null;
    return value.id || value.team_id || value.teamId || null;
  }

  function kickoffRoundLabel(round = '') {
    if (!round) return 'Kamp';
    const text = String(round);
    if (/group/i.test(text) && !/matchday/i.test(text)) return 'Matchday';
    return text;
  }

  function kickoffGroupLabel(round = '') {
    const text = String(round || '');
    const found = text.match(/Group\s+([A-L])/i) || text.match(/^([A-L])$/i);
    return found ? `Group ${found[1].toUpperCase()}` : null;
  }

  function normalizeStatusCode(value = '') {
    return String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  }

  function isLiveStatus(value = '') {
    const status = normalizeStatusCode(value);
    return ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'].includes(status) || status.includes('LIVE') || status.includes('IN_PLAY');
  }

  function isFinishedStatus(value = '') {
    const status = normalizeStatusCode(value);
    return ['FT', 'AET', 'PEN', 'FINISHED', 'MATCH_FINISHED', 'FULL_TIME', 'AFTER_EXTRA_TIME', 'AFTER_PENALTIES'].includes(status) || status.includes('FINISHED') || status.includes('FULL_TIME');
  }

  function extractScore(match) {
    const candidates = [[match.score1, match.score2], [match.goals1, match.goals2], [match.team1_score, match.team2_score], [match.home_score, match.away_score], [match.ft1, match.ft2]];
    for (const [a, b] of candidates) {
      if (isNumberLike(a) && isNumberLike(b)) return { a: Number(a), b: Number(b), label: `${a}-${b}` };
    }
    if (Array.isArray(match.score) && match.score.length >= 2 && isNumberLike(match.score[0]) && isNumberLike(match.score[1])) return { a: Number(match.score[0]), b: Number(match.score[1]), label: `${match.score[0]}-${match.score[1]}` };
    if (match.goals && !Array.isArray(match.goals) && isNumberLike(match.goals.home) && isNumberLike(match.goals.away)) return { a: Number(match.goals.home), b: Number(match.goals.away), label: `${match.goals.home}-${match.goals.away}` };
    if (match.score && typeof match.score === 'object') {
      if (isNumberLike(match.score.a) && isNumberLike(match.score.b)) return { a: Number(match.score.a), b: Number(match.score.b), label: match.score.label || `${match.score.a}-${match.score.b}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      if (isNumberLike(match.score.home) && isNumberLike(match.score.away)) return { a: Number(match.score.home), b: Number(match.score.away), label: `${match.score.home}-${match.score.away}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      const fullTimeObj = match.score.fullTime || match.score.fulltime || match.score.full_time;
      if (fullTimeObj && isNumberLike(fullTimeObj.home) && isNumberLike(fullTimeObj.away)) return { a: Number(fullTimeObj.home), b: Number(fullTimeObj.away), label: `${fullTimeObj.home}-${fullTimeObj.away}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      const ft = match.score.ft || match.score.final;
      if (Array.isArray(ft) && ft.length >= 2 && isNumberLike(ft[0]) && isNumberLike(ft[1])) return { a: Number(ft[0]), b: Number(ft[1]), label: `${ft[0]}-${ft[1]}` };
    }
    for (const key of ['score', 'result', 'ft']) {
      if (typeof match[key] === 'string') {
        const found = match[key].match(/(\d+)\s*[-:–]\s*(\d+)/);
        if (found) return { a: Number(found[1]), b: Number(found[2]), label: `${found[1]}-${found[2]}` };
      }
    }
    return null;
  }

  function deriveScoreFromEvents(match) {
    const goals1 = extractGoals(match, 1);
    const goals2 = extractGoals(match, 2);
    if (!goals1.length && !goals2.length) return null;
    return { a: goals1.length, b: goals2.length, label: `${goals1.length}-${goals2.length}`, inferredFromEvents: true };
  }

  function displayScoreFor(match) {
    return match.score || deriveScoreFromEvents(match);
  }

  function withDisplayScore(match) {
    const score = displayScoreFor(match);
    return score && !match.score ? { ...match, score } : match;
  }

  function isNumberLike(value) {
    return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
  }

  function translateRound(round = '') {
    if (String(round).startsWith('Matchday')) return String(round).replace('Matchday', ROUND_DA.Matchday);
    return ROUND_DA[round] || round || 'Kamp';
  }

  function render() {
    if (!state.data) return;
    const views = { home: renderHome, matches: renderMatches, groups: renderGroups, knockout: renderKnockout, favorites: renderFavorites };
    els.app.innerHTML = (views[state.view] || renderHome)();
    bindDynamicEvents();
  }

  function bindDynamicEvents() {
    document.querySelectorAll('[data-go-view]').forEach(el => el.addEventListener('click', () => setView(el.dataset.goView)));
    document.querySelectorAll('[data-fav-match]').forEach(el => el.addEventListener('click', event => {
      event.stopPropagation();
      toggleFavoriteMatch(el.dataset.favMatch);
    }));
    document.querySelectorAll('[data-team-chip]').forEach(el => el.addEventListener('click', () => toggleFavoriteTeam(el.dataset.teamChip)));
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
    document.querySelectorAll('[data-match-filter]').forEach(el => el.addEventListener('click', () => {
      state.matchFilter = el.dataset.matchFilter;
      render();
    }));
  }

  function handleGlobalClick(event) {
    const reset = event.target.closest('[data-reset-api-cache]');
    if (reset) {
      clearKickoffLocalCaches();
      toast('Cache og lokal rate-limit er ryddet. Henter friske data.');
      refreshData(true);
      return;
    }
    const test = event.target.closest('[data-test-kickoff]');
    if (test) {
      testKickoffConnection();
      return;
    }
    const save = event.target.closest('[data-save-kickoff-key]');
    if (save) {
      const input = document.getElementById('kickoffKey');
      const value = input?.value?.trim() || '';
      if (value) localStorage.setItem(KICKOFF_KEY_STORAGE, value);
      else localStorage.removeItem(KICKOFF_KEY_STORAGE);
      clearKickoffLocalCaches();
      toast(value ? 'KickoffAPI-nøgle gemt. Cache ryddet.' : 'API-nøgle fjernet. Bruger indbygget nøgle. Cache ryddet.');
      refreshData(true);
    }
  }

  function renderHome() {
    const sorted = sortedMatches();
    const today = sorted.filter(match => match.kickoff && isSameCopenhagenDate(match.kickoff, new Date()));
    const next = sorted.find(match => !displayScoreFor(match) && match.kickoff && match.kickoff >= startOfTodayCph()) || sorted.find(match => !displayScoreFor(match));
    const recent = sorted.filter(match => displayScoreFor(match)).slice(-3).reverse();
    const favoriteUpcoming = sorted.filter(match => isFavoriteRelated(match) && !displayScoreFor(match)).slice(0, 3);
    const groupCount = new Set(state.matches.filter(m => m.group).map(m => m.group)).size;
    return `
      <section class="hero">
        <p class="eyebrow">Kampprogram & resultater</p>
        <h2>VM i Nordamerika – uden bøvl</h2>
        <p>KickoffAPI-data normaliseres i dansk tid. Kun de 5 næste/relevante kampe auto-opdaterer detaljer.</p>
        <div class="hero-meta">
          <span class="pill">${state.matches.length} kampe</span>
          <span class="pill">${groupCount || 12} grupper</span>
          <span class="pill">Dansk tid</span>
        </div>
      </section>
      ${state.error ? `<section class="card" style="margin-top:14px"><h3>Data-advarsel</h3><p>${escapeHtml(state.error)}</p></section>` : ''}
      <section class="grid two">
        <div class="stat-card"><span class="stat-value">${today.length}</span><span class="stat-label">kampe i dag</span></div>
        <div class="stat-card"><span class="stat-value">${state.matches.filter(m => displayScoreFor(m)).length}</span><span class="stat-label">registrerede resultater</span></div>
      </section>
      <section class="section-head"><div><h2>Næste kamp</h2><p>${formatDateLong(next?.kickoff) || 'Afventer data'}</p></div><button class="link-button" data-go-view="matches">Alle kampe</button></section>
      <div class="grid">${next ? renderMatchCard(next) : emptyState('Ingen kamp fundet', 'Datakilden indeholder ingen kommende kampe endnu.')}</div>
      <section class="section-head"><div><h2>I dag</h2><p>${formatCopenhagenToday()}</p></div></section>
      <div class="grid">${today.length ? today.map(renderMatchCard).join('') : emptyState('Ingen kampe i dag', 'Der er ikke registreret VM-kampe på dagens dato.')}</div>
      <section class="section-head"><div><h2>Seneste resultater</h2><p>Resultater gemmes lokalt, når de er hentet</p></div></section>
      <div class="grid">${recent.length ? recent.map(renderMatchCard).join('') : emptyState('Ingen resultater endnu', 'Når kampene er spillet og data opdateres, lander resultaterne her.')}</div>
      <section class="section-head"><div><h2>Favoritter</h2><p>Dine valgte hold/kampe</p></div><button class="link-button" data-go-view="favorites">Vælg</button></section>
      <div class="grid">${favoriteUpcoming.length ? favoriteUpcoming.map(renderMatchCard).join('') : emptyState('Ingen favoritter valgt', 'Tryk på stjernen ved en kamp eller vælg favorithold.')}</div>
      ${renderDataCard()}
    `;
  }

  function renderMatches() {
    const rounds = Array.from(new Set(state.matches.map(match => match.round).filter(Boolean)));
    let list = sortedMatches();
    if (state.matchFilter === 'upcoming') list = list.filter(match => !displayScoreFor(match));
    if (state.matchFilter === 'results') list = list.filter(match => displayScoreFor(match));
    if (state.matchFilter === 'today') list = list.filter(match => match.kickoff && isSameCopenhagenDate(match.kickoff, new Date()));
    if (state.roundFilter !== 'all') list = list.filter(match => match.round === state.roundFilter);
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      list = list.filter(match => [match.team1, match.team2, match.group, match.ground, match.round].join(' ').toLowerCase().includes(q));
    }
    return `
      <section class="section-head"><div><h2>Kampe</h2><p>Søg på hold, by, gruppe eller runde.</p></div></section>
      <section class="controls">
        <input id="matchSearch" class="search-input" type="search" placeholder="Søg fx Danmark, Mexico eller finale…" autocomplete="off">
        <select id="roundFilter" class="select" aria-label="Vælg runde">
          <option value="all">Alle runder</option>
          ${rounds.map(round => `<option value="${escapeAttr(round)}">${escapeHtml(translateRound(round))}</option>`).join('')}
        </select>
      </section>
      <section class="filter-tabs">
        ${filterButton('all', 'Alle')}
        ${filterButton('upcoming', 'Kommende')}
        ${filterButton('today', 'I dag')}
        ${filterButton('results', 'Resultater')}
      </section>
      ${renderDateGroupedMatches(list)}
    `;
  }

  function filterButton(value, label) {
    return `<button type="button" class="${state.matchFilter === value ? 'active' : ''}" data-match-filter="${value}">${label}</button>`;
  }

  function renderGroups() {
    const groups = buildGroups();
    return `<section class="section-head"><div><h2>Grupper</h2><p>Tabeller beregnes automatisk ud fra registrerede resultater.</p></div></section><div class="grid">${groups.length ? groups.map(renderGroupCard).join('') : emptyState('Ingen grupper fundet', 'Datakilden indeholder ikke gruppedata endnu.')}</div>`;
  }

  function renderKnockout() {
    const matches = sortedMatches().filter(match => !match.group);
    const byRound = groupBy(matches, match => match.round || 'Slutspil');
    const order = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'];
    const rounds = order.filter(round => byRound[round]).concat(Object.keys(byRound).filter(round => !order.includes(round)));
    return `<section class="section-head"><div><h2>Slutspil</h2><p>Opdateres med holdnavne, når de bliver kendt i datakilden.</p></div></section>${rounds.length ? rounds.map(round => `<section class="date-group"><h3 class="date-title">${escapeHtml(translateRound(round))}</h3><div class="grid match-grid">${byRound[round].map(renderMatchCard).join('')}</div></section>`).join('') : emptyState('Slutspillet mangler', 'Datakilden indeholder endnu ikke slutspilskampe.')}`;
  }

  function renderFavorites() {
    const teams = Array.from(new Set(state.matches.flatMap(match => [match.team1, match.team2]).filter(isRealTeam))).sort(localeSort);
    const favoriteMatches = sortedMatches().filter(isFavoriteRelated);
    return `
      <section class="section-head"><div><h2>Favoritter</h2><p>Vælg hold. Så samles deres kampe her.</p></div></section>
      <section class="card flat"><h3>Favorithold</h3><p>Tryk på de hold du vil følge. Gemmes kun på denne enhed.</p><div class="team-chip-wrap">${teams.map(team => `<button type="button" class="team-chip ${state.favoriteTeams.has(team) ? 'active' : ''}" data-team-chip="${escapeAttr(team)}">${flag(team)} ${escapeHtml(team)}</button>`).join('')}</div></section>
      <section class="section-head"><div><h2>Dine kampe</h2><p>Både favorithold og stjernemarkerede kampe.</p></div></section>
      <div class="grid match-grid">${favoriteMatches.length ? favoriteMatches.map(renderMatchCard).join('') : emptyState('Ingen favoritter endnu', 'Vælg et hold eller tryk på stjernen ved en kamp.')}</div>
      ${renderDataCard()}
    `;
  }

  function renderDateGroupedMatches(matches) {
    if (!matches.length) return emptyState('Ingen kampe matcher', 'Prøv at nulstille søgning eller filter.');
    const byDate = groupBy(matches, match => match.kickoff ? dateKeyCph(match.kickoff) : match.date || 'ukendt');
    return Object.keys(byDate).sort().map(key => `<section class="date-group"><h3 class="date-title">${formatDateKeyLong(key)}</h3><div class="grid match-grid">${byDate[key].map(renderMatchCard).join('')}</div></section>`).join('');
  }

  function renderMatchCard(match) {
    const isFav = state.favoriteMatches.has(match.id);
    const displayScore = displayScoreFor(match);
    const badge = match.status === 'live' ? '<span class="badge today">Live</span>' : displayScore ? '<span class="badge result">Resultat</span>' : match.status === 'today' ? '<span class="badge today">I dag</span>' : match.group ? `<span class="badge">${escapeHtml(match.groupDa || 'Gruppe')}</span>` : '<span class="badge knockout">Slutspil</span>';
    return `
      <article class="match-card" data-match-details="${escapeAttr(match.id)}" tabindex="0" role="button" aria-label="Vis kampdetaljer">
        <div class="match-top"><span>${escapeHtml(match.roundDa)}</span><button type="button" class="favorite-btn ${isFav ? 'active' : ''}" data-fav-match="${escapeAttr(match.id)}" aria-label="${isFav ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}">★</button></div>
        <div class="teams">
          <div class="team-row"><div class="team-name"><span class="flag">${flag(match.team1)}</span><span>${escapeHtml(match.team1 || 'TBD')}</span></div><div class="score ${displayScore ? '' : 'empty'}">${displayScore ? displayScore.a : '–'}</div></div>
          <div class="team-row"><div class="team-name"><span class="flag">${flag(match.team2)}</span><span>${escapeHtml(match.team2 || 'TBD')}</span></div><div class="score ${displayScore ? '' : 'empty'}">${displayScore ? displayScore.b : '–'}</div></div>
        </div>
        <div class="match-bottom"><span>${formatTime(match.kickoff)}${match.ground ? ` · ${escapeHtml(match.ground)}` : ''}</span>${badge}</div>
        <div class="match-detail-hint">Tryk for kampdetaljer</div>
      </article>
    `;
  }

  function openMatchDetails(match) {
    closeMatchDetails();
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-backdrop';
    wrapper.dataset.matchId = match.id;
    wrapper.innerHTML = renderMatchDetails(match, { loadingExtra: match.sourceType === 'kickoff', activeTab: tabFromHash() || 'facts' });
    document.body.appendChild(wrapper);
    document.body.classList.add('modal-open');
    bindModalEvents(wrapper);
    document.addEventListener('keydown', closeOnEscape);

    if (match.sourceType === 'kickoff') {
      fetchFootballMatchDetails(match, { mode: 'manual' }).then(detailMatch => {
        mergeDetailMatchIntoState(detailMatch);
        persistCurrentKickoffDataToCache();
        render();
        const current = document.querySelector(`.modal-backdrop[data-match-id="${CSS.escape(match.id)}"]`);
        if (!current) return;
        const activeTab = current.querySelector('.detail-tab.active')?.dataset.tab || 'facts';
        current.innerHTML = renderMatchDetails(detailMatch, { loadingExtra: false, activeTab });
        bindModalEvents(current);
      }).catch(error => {
        const current = document.querySelector(`.modal-backdrop[data-match-id="${CSS.escape(match.id)}"] .match-modal`);
        if (current && !current.querySelector('.data-note.error')) current.insertAdjacentHTML('beforeend', `<p class="data-note error">Kunne ikke hente ekstra kampdata: ${escapeHtml(error.message)}</p>`);
      });
    }
  }

  function bindModalEvents(wrapper) {
    wrapper.addEventListener('click', event => {
      if (event.target === wrapper || event.target.closest('[data-close-modal]')) {
        closeMatchDetails();
        return;
      }
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        event.preventDefault();
        activateDetailTab(wrapper, tab.dataset.tab);
      }
    });
  }

  function activateDetailTab(wrapper, tabName) {
    wrapper.querySelectorAll('.detail-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    wrapper.querySelectorAll('.detail-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tabName));
  }

  function tabFromHash() {
    const hash = String(window.location.hash || '').toLowerCase();
    if (hash.startsWith('#lineups')) return 'lineups';
    if (hash.startsWith('#stats')) return 'stats';
    if (hash.startsWith('#info')) return 'info';
    return '';
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape') closeMatchDetails();
  }

  function closeMatchDetails() {
    document.querySelector('.modal-backdrop')?.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', closeOnEscape);
  }

  async function fetchFootballMatchDetails(match, { mode = 'manual', force = false } = {}) {
    const key = match?.id || match?.num || match?.fixtureId;
    if (!key) throw new Error('mangler kamp-id');
    const cacheKey = String(key);
    if (detailFetchesInFlight.has(cacheKey)) return detailFetchesInFlight.get(cacheKey);
    const promise = fetchFootballMatchDetailsInner(match, { mode, force });
    detailFetchesInFlight.set(cacheKey, promise);
    promise.finally(() => detailFetchesInFlight.delete(cacheKey));
    return promise;
  }

  async function fetchFootballMatchDetailsInner(match, { mode = 'manual', force = false } = {}) {
    const cache = readMatchDetailsCache();
    const cached = cache[match.id];
    if (!force && cachedDetailIsUsable(match, cached, { mode })) return mergeCachedDetailIntoMatch(match, cached.data);
    const detail = await fetchKickoffFullMatchDetails(match, { mode });
    cache[match.id] = { savedAt: new Date().toISOString(), data: detail };
    writeMatchDetailsCache(cache);
    return mergeCachedDetailIntoMatch(match, detail);
  }

  async function fetchKickoffFullMatchDetails(match, { mode = 'manual' } = {}) {
    const fixtureId = match.num || match.fixture?.id || match.fixtureId || match.id;
    if (!fixtureId) throw new Error('mangler fixture-id til kampdetaljer');
    const combined = { ...match, rawDetail: { fixtureId, fetchedAt: new Date().toISOString(), extraErrors: [] } };

    const shouldFetchAll = mode === 'manual' || isUsefulForAutoDetails(match);
    if (!shouldFetchAll) return combined;

    const requests = [
      {
        key: 'fixtureDetail',
        candidates: [
          { path: 'fixtures', params: { id: fixtureId, timezone: DEFAULT_TZ } },
          { path: `fixtures/${fixtureId}`, params: { timezone: DEFAULT_TZ } }
        ]
      },
      {
        key: 'events',
        candidates: [
          { path: 'fixtures/events', params: { fixture: fixtureId } },
          { path: `fixtures/${fixtureId}/events`, params: {} }
        ]
      },
      {
        key: 'statistics',
        candidates: [
          { path: 'fixtures/statistics', params: { fixture: fixtureId } },
          { path: `fixtures/${fixtureId}/statistics`, params: {} }
        ]
      },
      {
        key: 'lineups',
        candidates: [
          { path: 'fixtures/lineups', params: { fixture: fixtureId } },
          { path: `fixtures/${fixtureId}/lineups`, params: {} }
        ]
      }
    ];

    const settled = await Promise.allSettled(requests.map(async request => ({ key: request.key, data: await kickoffGetFirst(request.candidates) })));
    settled.forEach((result, index) => {
      const key = requests[index].key;
      if (result.status === 'fulfilled') {
        combined[key] = result.value.data;
        combined.rawDetail[key] = result.value.data;
      } else {
        combined.rawDetail.extraErrors.push(`${key}: ${result.reason?.message || result.reason}`);
        if (!Array.isArray(combined[key])) combined[key] = [];
      }
    });

    const fixtureDetail = Array.isArray(combined.fixtureDetail) ? combined.fixtureDetail[0] : null;
    if (fixtureDetail && typeof fixtureDetail === 'object') {
      Object.assign(combined, fixtureDetail, {
        events: combined.events,
        statistics: combined.statistics,
        lineups: combined.lineups,
        rawDetail: combined.rawDetail
      });
    }
    return combined;
  }

  function isUsefulForAutoDetails(match) {
    if (match.status === 'live' || isLiveStatus(match.apiStatus)) return true;
    if (displayScoreFor(match) || isFinishedStatus(match.apiStatus)) return true;
    const kickoff = kickoffDateForMatch(match);
    if (!(kickoff instanceof Date) || Number.isNaN(kickoff.getTime())) return false;
    const minutes = (kickoff.getTime() - Date.now()) / 60000;
    return minutes <= 180;
  }

  function readMatchDetailsCache() {
    return readObject(MATCH_DETAILS_CACHE_KEY);
  }

  function writeMatchDetailsCache(cache) {
    localStorage.setItem(MATCH_DETAILS_CACHE_KEY, JSON.stringify(cache));
  }

  function cachedDetailIsUsable(match, cached, { mode = 'manual' } = {}) {
    if (!cached?.savedAt || !cached?.data) return false;
    const savedAt = new Date(cached.savedAt).getTime();
    if (!Number.isFinite(savedAt)) return false;
    const age = Date.now() - savedAt;
    if (match.status === 'live' || isLiveStatus(match.apiStatus)) return age < LIVE_DETAILS_CACHE_TTL_MS;
    if (isFinishedStatus(match.apiStatus) || displayScoreFor(match) || matchHasProbablyFinished(match)) return age < FINISHED_DETAILS_CACHE_TTL_MS;
    if (mode === 'auto') return age < UPCOMING_DETAILS_CACHE_TTL_MS;
    return age < UPCOMING_DETAILS_CACHE_TTL_MS;
  }

  function mergeCachedDetailIntoMatch(match, detail) {
    if (!detail) return withDisplayScore(match);
    const raw = { ...match, ...detail };
    if (detail.rawDetail) raw.rawDetail = detail.rawDetail;
    const normalized = normalizeMatch(normalizeKickoffMatch(raw), match.index);
    return withDisplayScore({ ...match, ...normalized, rawDetail: detail.rawDetail || detail });
  }

  function hydrateMatchesFromDetailsCache() {
    if (!state.matches.some(match => match.sourceType === 'kickoff')) return;
    const cache = readMatchDetailsCache();
    let changed = false;
    state.matches = state.matches.map(match => {
      const cached = cache[match.id];
      if (!cachedDetailIsUsable(match, cached, { mode: 'hydrate' })) return withDisplayScore(match);
      const merged = mergeCachedDetailIntoMatch(match, cached.data);
      changed = changed || merged !== match;
      return merged;
    });
    if (changed && state.data?.matches) state.data = { ...state.data, matches: state.matches };
  }

  function startKickoffDetailsPreload({ force = false } = {}) {
    if (!getKickoffKey()) return;
    const targets = getAutoUpdateDetailTargets().filter(match => force || shouldAutoFetchDetails(match));
    if (!targets.length) return;
    const runId = ++detailPreloadRunId;
    runWithConcurrency(targets, DETAIL_PRELOAD_CONCURRENCY, async match => {
      if (runId !== detailPreloadRunId) return;
      try {
        const detailMatch = await fetchFootballMatchDetails(match, { mode: 'auto', force });
        if (runId !== detailPreloadRunId) return;
        mergeDetailMatchIntoState(detailMatch);
        scheduleDetailPreloadRender();
      } catch (error) {
        console.warn('Detail preload fejlede:', match.id, error);
      }
    }).then(() => {
      if (runId !== detailPreloadRunId) return;
      persistCurrentKickoffDataToCache();
      render();
    }).catch(error => console.warn('Detail preload stoppede:', error));
  }

  function getAutoUpdateDetailTargets() {
    const now = Date.now();
    return sortedMatches()
      .filter(match => match.sourceType === 'kickoff')
      .filter(match => {
        if (match.status === 'live' || isLiveStatus(match.apiStatus)) return true;
        const kickoff = kickoffDateForMatch(match);
        if (!(kickoff instanceof Date) || Number.isNaN(kickoff.getTime())) return false;
        return kickoff.getTime() >= now - 30 * 60 * 1000;
      })
      .slice(0, AUTO_UPDATE_MATCH_LIMIT);
  }

  function shouldAutoFetchDetails(match) {
    const cache = readMatchDetailsCache();
    return !cachedDetailIsUsable(match, cache[match.id], { mode: 'auto' });
  }

  async function runWithConcurrency(items, concurrency, worker) {
    const queue = [...items];
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
      while (queue.length) await worker(queue.shift());
    });
    await Promise.all(workers);
  }

  function mergeDetailMatchIntoState(detailMatch) {
    if (!detailMatch?.id) return;
    const idx = state.matches.findIndex(item => item.id === detailMatch.id);
    if (idx === -1) return;
    state.matches[idx] = withDisplayScore({ ...state.matches[idx], ...detailMatch });
    if (state.data?.matches) state.data.matches[idx] = state.matches[idx];
  }

  function scheduleDetailPreloadRender() {
    if (detailPreloadRenderTimer) return;
    detailPreloadRenderTimer = setTimeout(() => {
      detailPreloadRenderTimer = null;
      persistCurrentKickoffDataToCache();
      render();
    }, 700);
  }

  function persistCurrentKickoffDataToCache() {
    if (!state.data || !state.matches.some(match => match.sourceType === 'kickoff')) return;
    const data = { ...state.data, matches: state.matches };
    state.data = data;
    writeCache(CACHE_KEY, { data, lastUpdated: state.lastUpdated || new Date().toISOString(), source: state.dataSource || 'KickoffAPI' });
  }

  function clearKickoffLocalCaches() {
    const prefixes = ['vm2026:data:kickoff:', 'vm2026:kickoffMatchDetails:', 'vm2026:kickoffRateLimit:', 'vm2026:kickoffRequestMeta:', 'vm2026:kickoffRequestTimestamps:'];
    Object.keys(localStorage).forEach(key => {
      if (prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    });
  }

  function renderMatchDetails(match, { loadingExtra = false, activeTab = 'facts' } = {}) {
    const score = displayScoreFor(match);
    const goals1 = extractGoals(match, 1);
    const goals2 = extractGoals(match, 2);
    const bookings = extractBookings(match);
    const substitutions = extractSubstitutions(match);
    const teamStats = extractTeamStatistics(match);
    const lineups = extractLineups(match);
    const facts = buildMatchFacts(match, goals1, goals2, bookings, substitutions);
    const infoFields = buildInfoFields(match);
    const errors = Array.isArray(match.rawDetail?.extraErrors) ? match.rawDetail.extraErrors.filter(Boolean) : [];
    const active = ['facts', 'lineups', 'stats', 'info'].includes(activeTab) ? activeTab : 'facts';

    return `
      <section class="match-modal match-modal-mobile" role="dialog" aria-modal="true" aria-label="Kampdetaljer">
        <button type="button" class="modal-close mobile-close" data-close-modal aria-label="Luk">←</button>
        <header class="mobile-match-header">
          <div class="mobile-score-line">
            <span class="mobile-flag">${flag(match.team1)}</span>
            <strong>${score ? escapeHtml(score.a) : '–'}</strong>
            <small>${escapeHtml(match.apiStatus ? statusLabel(match.apiStatus) : match.statusDa || '')}</small>
            <strong>${score ? escapeHtml(score.b) : '–'}</strong>
            <span class="mobile-flag">${flag(match.team2)}</span>
          </div>
          <div class="mobile-team-line"><span>${escapeHtml(match.team1 || 'TBD')}</span><span>${escapeHtml(match.team2 || 'TBD')}</span></div>
          <div class="mobile-match-subline"><span>${escapeHtml(match.roundDa || match.groupDa || 'VM 2026')}</span>${match.ground ? `<span>· ${escapeHtml(match.ground)}</span>` : ''}</div>
        </header>

        <nav class="detail-tabbar" aria-label="Kampdetaljer">
          ${detailTab('facts', 'Fakta', active)}
          ${detailTab('lineups', 'Startopstilling', active)}
          ${detailTab('stats', 'Statistik', active)}
          ${detailTab('info', 'Info', active)}
        </nav>

        ${loadingExtra ? '<p class="data-note mobile-note">Henter events, kort, statistik og opstillinger fra KickoffAPI…</p>' : ''}
        ${errors.length ? `<details class="data-note mobile-note error"><summary>API-detaljer manglede</summary>${errors.map(error => `<div>${escapeHtml(error)}</div>`).join('')}</details>` : ''}

        <section class="detail-panel ${active === 'facts' ? 'active' : ''}" data-panel="facts">
          <div class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Fakta</h3><p>Kampforløb i kronologisk rækkefølge</p></div>
            ${facts.length ? renderFactTimeline(match, facts) : emptyMobilePanel('Ingen kampforløb endnu', 'Når KickoffAPI sender mål, kort og udskiftninger, vises de her.')}
          </div>
        </section>

        <section class="detail-panel ${active === 'lineups' ? 'active' : ''}" data-panel="lineups">
          <div class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Startopstilling</h3><p>Stående banevisning</p></div>
            ${lineups.length ? renderStandingLineups(lineups, match) : emptyMobilePanel('Ingen opstilling hentet', 'Enten er kampen for langt ude i fremtiden, eller også sender KickoffAPI ikke lineups for denne kamp endnu.')}
          </div>
        </section>

        <section class="detail-panel ${active === 'stats' ? 'active' : ''}" data-panel="stats">
          <div class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Statistik</h3><p>Kun officielle datapunkter</p></div>
            ${teamStats.length ? `<div class="stats-table mobile-card-panel">${renderTeamStatistics(teamStats)}</div>` : emptyMobilePanel('Ingen statistik endnu', 'KickoffAPI har ikke returneret statistik for denne kamp endnu.')}
          </div>
        </section>

        <section class="detail-panel ${active === 'info' ? 'active' : ''}" data-panel="info">
          <div class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Info</h3><p>Kampdata, tidspunkt og registrerede oplysninger</p></div>
            <div class="detail-grid mobile-info-grid">${infoFields.map(renderDetailBox).join('')}</div>
          </div>
        </section>
      </section>
    `;
  }

  function detailTab(tab, label, active) {
    return `<button type="button" class="detail-tab ${active === tab ? 'active' : ''}" data-tab="${tab}">${label}</button>`;
  }

  function renderDetailBox(item) {
    return `<div class="detail-box"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`;
  }

  function buildInfoFields(match) {
    const fields = [];
    const seen = new Set();
    const add = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      const text = String(value).trim();
      if (!text || seen.has(label)) return;
      seen.add(label);
      fields.push({ label, value: text });
    };
    add('Kampstart', match.kickoff ? formatDateLong(match.kickoff) : 'Tid ukendt');
    add('Tidszone', 'Dansk tid');
    add('Status', match.apiStatus ? statusLabel(match.apiStatus) : '');
    add('Runde', match.roundDa);
    add('Kampdag', match.matchday);
    add('Gruppe', match.groupDa);
    add('Stadion', match.ground);
    add('Resultat', displayScoreFor(match)?.label);
    add('Vinder', match.score?.winner ? winnerLabel(match, match.score.winner) : '');
    add('Varighed', match.score?.duration ? durationLabel(match.score.duration) : '');
    add('Halvleg', scorePart(match.score?.halfTime));
    add('Ordinær tid', scorePart(match.score?.regularTime));
    add('Ekstra tid', scorePart(match.score?.extraTime));
    add('Straffespark', scorePart(match.score?.penalties));
    add('Tilskuere', match.attendance);
    add('Dommer', match.referee);
    add('Sidst opdateret', match.lastUpdated ? formatDateTime(new Date(match.lastUpdated)) : '');
    add('Hjemmehold', match.team1);
    add('Udehold', match.team2);
    add('Datakilde', match.sourceType === 'kickoff' ? 'KickoffAPI' : match.sourceType || 'Ukendt');
    add('App-version', APP_VERSION);
    return fields;
  }

  function emptyMobilePanel(title, text) {
    return `<div class="mobile-card-panel empty-mobile-panel"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
  }

  function buildMatchFacts(match, goals1, goals2, bookings, substitutions) {
    const events = [];
    goals1.forEach(goal => events.push({ kind: 'goal', side: 'home', team: match.team1, ...goalInfo(goal) }));
    goals2.forEach(goal => events.push({ kind: 'goal', side: 'away', team: match.team2, ...goalInfo(goal) }));
    bookings.forEach(item => events.push({ kind: 'card', side: sideFromTeam(match, item.teamId, item.team), team: item.team, minute: item.minute || '', minuteValue: minuteNumber(item.minute), player: item.player || 'Ukendt', label: item.label || cardLabel(item.card || '') }));
    substitutions.forEach(item => events.push({ kind: 'sub', side: sideFromTeam(match, item.teamId, item.team), team: item.team, minute: item.minute || '', minuteValue: minuteNumber(item.minute), in: item.in || 'Ind', out: item.out || 'Ud' }));
    events.sort((a, b) => (a.minuteValue ?? 999) - (b.minuteValue ?? 999));
    let homeScore = 0;
    let awayScore = 0;
    events.forEach(event => {
      if (event.kind !== 'goal') return;
      if (event.side === 'away') awayScore += 1;
      else homeScore += 1;
      event.score = `${homeScore} - ${awayScore}`;
    });
    return events;
  }

  function goalInfo(goal) {
    const parsed = splitMinuteAndNote(goal.minute || '');
    return { minute: parsed.minute, minuteValue: minuteNumber(parsed.minute), player: goal.name || 'Ukendt', note: parsed.note };
  }

  function splitMinuteAndNote(value = '') {
    const parts = String(value).split('·').map(part => part.trim()).filter(Boolean);
    return { minute: parts[0] || '', note: parts.slice(1).join(' · ') };
  }

  function minuteNumber(value = '') {
    const found = String(value).match(/\d+/);
    return found ? Number(found[0]) : 999;
  }

  function sideFromTeam(match, teamId, teamName) {
    if (teamId && match.team1Id && String(teamId) === String(match.team1Id)) return 'home';
    if (teamId && match.team2Id && String(teamId) === String(match.team2Id)) return 'away';
    if (teamName && normalizeName(teamName) === normalizeName(match.team1)) return 'home';
    if (teamName && normalizeName(teamName) === normalizeName(match.team2)) return 'away';
    return 'neutral';
  }

  function renderFactTimeline(match, facts) {
    return `<div class="facts-card">${facts.map(item => renderFactRow(match, item)).join('')}</div>`;
  }

  function renderFactRow(match, item) {
    const side = item.side === 'away' ? 'away' : item.side === 'home' ? 'home' : 'neutral';
    return `<div class="fact-row ${side}"><div class="fact-minute">${escapeHtml(item.minute || '')}</div><div class="fact-body">${renderFactBody(match, item)}</div></div>`;
  }

  function renderFactBody(match, item) {
    if (item.kind === 'goal') return `<div class="fact-main"><span class="fact-icon">⚽</span><strong>${escapeHtml(item.player)}</strong>${item.score ? ` <em>(${escapeHtml(item.score)})</em>` : ''}</div>${item.note ? `<div class="fact-sub">${escapeHtml(item.note)}</div>` : ''}`;
    if (item.kind === 'sub') return `<div class="sub-lines"><span class="sub-in">↗ ${escapeHtml(item.in)}</span><span class="sub-out">↙ ${escapeHtml(item.out)}</span></div>`;
    if (item.kind === 'card') {
      const cardIcon = String(item.label || '').toLowerCase().includes('rød') ? '🟥' : '🟨';
      return `<div class="fact-main"><span class="fact-icon">${cardIcon}</span><strong>${escapeHtml(item.player)}</strong><small>${escapeHtml(item.label || '')}</small></div>`;
    }
    return `<div class="fact-main"><strong>${escapeHtml(item.label || 'Event')}</strong></div>`;
  }

  function extractGoals(match, side) {
    const teamId = side === 1 ? match.team1Id : match.team2Id;
    const teamName = side === 1 ? match.team1 : match.team2;
    const rawEvents = Array.isArray(match.goals) && match.goals.length ? match.goals : (Array.isArray(match.events) ? match.events.filter(isGoalEvent) : []);
    if (rawEvents.length) return rawEvents.filter(goal => eventBelongsToSide(goal, side, teamId, teamName)).map(normalizeGoal).filter(Boolean);
    const raw = match[`goals${side}`] || match[`goals_${side}`] || match[side === 1 ? 'home_goals' : 'away_goals'];
    return Array.isArray(raw) ? raw.map(normalizeGoal).filter(Boolean) : [];
  }

  function eventBelongsToSide(event, side, teamId, teamName) {
    const sideText = side === 1 ? 'home' : 'away';
    const values = [event?.side, event?.homeAway, event?.home_away, event?.teamSide, event?.team_side, event?.team_type];
    if (values.some(value => String(value || '').toLowerCase() === sideText)) return true;
    const eventTeam = event?.team ?? event?.teamName ?? event?.team_name ?? event?.teamId ?? event?.team_id;
    if (sameTeam(eventTeam, teamId, teamName)) return true;
    if (teamId && (String(event?.team_id) === String(teamId) || String(event?.teamId) === String(teamId))) return true;
    if (normalizeName(event?.team_name || event?.teamName) === normalizeName(teamName)) return true;
    return false;
  }

  function normalizeGoal(goal) {
    if (typeof goal === 'string') return { name: goal, minute: '' };
    if (!goal || typeof goal !== 'object') return null;
    const scorer = goal.scorer?.name || goal.player?.name || goal.playerName || goal.player_name || goal.name || (typeof goal.player === 'string' ? goal.player : '') || (typeof goal.scorer === 'string' ? goal.scorer : '') || 'Ukendt';
    const assist = goal.assist?.name || goal.assistName || (typeof goal.assist === 'string' ? goal.assist : '') || '';
    const minuteValue = goal.minute ?? goal.time?.elapsed ?? goal.time ?? goal.minutes ?? goal.min;
    const offset = goal.extraTime ?? goal.time?.extra ?? goal.offset ?? goal.extra ?? goal.extra_time ?? goal.added;
    let minute = minuteValue !== undefined && minuteValue !== null && minuteValue !== '' ? `${minuteValue}'` : '';
    if (offset !== undefined && offset !== null && offset !== '') minute = minute ? `${minute}+${offset}'` : `${offset}'`;
    const tags = [];
    const type = String(goal.detail || goal.type || '').toUpperCase();
    if (goal.penalty || goal.pen || type.includes('PENALTY')) tags.push('straffe');
    if (goal.own_goal || goal.owngoal || type.includes('OWN')) tags.push('selvmål');
    if (assist) tags.push(`oplæg: ${assist}`);
    if (tags.length) minute = minute ? `${minute} · ${tags.join(', ')}` : tags.join(', ');
    return { name: scorer, minute };
  }

  function sameTeam(team, teamId, teamName) {
    if (!team) return false;
    if (typeof team === 'string') return normalizeName(team) === normalizeName(teamName);
    if (teamId && (String(team.id) === String(teamId) || String(team.team_id) === String(teamId) || String(team.teamId) === String(teamId))) return true;
    return normalizeName(team.name || team.shortName || team.short_name || team.team_name) === normalizeName(teamName);
  }

  function normalizeName(value = '') {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function extractBookings(match) {
    const raw = Array.isArray(match.bookings) ? match.bookings : (Array.isArray(match.events) ? match.events.filter(isCardEvent) : []);
    return raw.map(item => {
      if (!item || typeof item !== 'object') return null;
      const rawCard = String(item.card || item.detail || item.comments || item.comment || item.type || item.eventType || item.event_type || item.kind || '').toUpperCase();
      const isYellow = rawCard.includes('YELLOW') || rawCard.includes('GULT');
      const isRed = rawCard.includes('RED') || rawCard.includes('RØD') || rawCard.includes('ROED');
      if (!isYellow && !isRed && !rawCard.includes('CARD')) return null;
      const player = item.player?.name || item.playerName || item.player_name || item.name || '';
      const teamId = item.team?.id || item.teamId || item.team_id || '';
      const team = item.team?.shortName || item.team?.short_name || item.team?.name || item.teamName || item.team_name || '';
      return { minute: formatMinute(item.minute ?? item.time?.elapsed ?? item.elapsed ?? item.time ?? item.minutes ?? item.min), team, teamId, player, card: rawCard, label: cardLabel(rawCard) };
    }).filter(Boolean);
  }

  function cardLabel(card) {
    const value = String(card || '').toUpperCase();
    if (value.includes('SECOND') || value.includes('YELLOW_RED')) return 'Andet gule kort';
    if (value.includes('RED')) return 'Rødt kort';
    if (value.includes('YELLOW')) return 'Gult kort';
    return 'Kort';
  }

  function extractSubstitutions(match) {
    const raw = Array.isArray(match.substitutions) ? match.substitutions : (Array.isArray(match.events) ? match.events.filter(isSubstitutionEvent) : []);
    return raw.map(item => {
      const teamId = item.team?.id || item.teamId || item.team_id || '';
      return {
        minute: formatMinute(item.minute ?? item.time?.elapsed ?? item.elapsed ?? item.time ?? item.minutes ?? item.min),
        teamId,
        team: item.team?.shortName || item.team?.short_name || item.team?.name || item.teamName || item.team_name || '',
        out: item.playerOut?.name || item.player_out?.name || item.assist?.name || item.assistName || item.assist_name || item.out || '',
        in: item.playerIn?.name || item.player_in?.name || item.player?.name || item.playerName || item.player_name || item.in || ''
      };
    }).filter(item => item.in || item.out || item.team);
  }

  function formatMinute(value) {
    return value !== undefined && value !== null && value !== '' ? `${value}'` : '';
  }

  function extractTeamStatistics(match) {
    const raw = Array.isArray(match.fixtureStatistics) && match.fixtureStatistics.length ? match.fixtureStatistics : (Array.isArray(match.statistics) ? match.statistics : []);
    return raw.map(teamBlock => {
      const teamId = teamBlock.teamId || teamBlock.team_id || teamBlock.team?.id;
      const teamName = teamBlock.team?.name || teamBlock.teamName || teamBlock.team_name || (String(teamId) === String(match.team1Id) ? match.team1 : String(teamId) === String(match.team2Id) ? match.team2 : '');
      let stats = [];
      if (Array.isArray(teamBlock.statistics)) stats = teamBlock.statistics.filter(s => s && s.type && s.value !== null && s.value !== undefined);
      else if (teamBlock.statistics && typeof teamBlock.statistics === 'object') stats = Object.entries(teamBlock.statistics).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([type, value]) => ({ type, value }));
      return { team: teamName, stats };
    }).filter(block => block.team && block.stats.length);
  }

  function renderTeamStatistics(blocks) {
    const statTypes = Array.from(new Set(blocks.flatMap(block => block.stats.map(s => s.type))));
    return `<table class="table"><thead><tr><th>Statistik</th>${blocks.map(block => `<th>${escapeHtml(block.team)}</th>`).join('')}</tr></thead><tbody>${statTypes.map(type => `<tr><td>${escapeHtml(translateStatType(type))}</td>${blocks.map(block => `<td>${escapeHtml(statValue(block, type))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function statValue(block, type) {
    const found = block.stats.find(s => s.type === type);
    return found?.value !== null && found?.value !== undefined ? String(found.value) : '–';
  }

  function translateStatType(type) {
    const map = { 'Shots on Goal': 'Skud på mål', 'Shots off Goal': 'Skud forbi', 'Total Shots': 'Skud i alt', 'Blocked Shots': 'Blokerede skud', 'Shots insidebox': 'Skud i feltet', 'Shots outsidebox': 'Skud udenfor feltet', 'Fouls': 'Frispark imod', 'Corner Kicks': 'Hjørnespark', 'Offsides': 'Offside', 'Ball Possession': 'Boldbesiddelse', 'Yellow Cards': 'Gule kort', 'Red Cards': 'Røde kort', 'Goalkeeper Saves': 'Redninger', 'Total passes': 'Afleveringer', 'Passes accurate': 'Præcise afleveringer', 'Passes %': 'Afleveringsprocent', expected_goals: 'xG' };
    return map[type] || type;
  }

  function extractLineups(match) {
    const raw = Array.isArray(match.lineups) && match.lineups.length ? match.lineups : (Array.isArray(match.rawDetail?.lineups) ? match.rawDetail.lineups : []);
    if (!Array.isArray(raw)) return [];
    const firstArray = (...values) => values.find(Array.isArray) || [];
    const normalizePlayer = p => {
      const player = p?.player || p || {};
      const name = player.name || player.playerName || player.player_name || p?.playerName || p?.name || '';
      return { name, number: player.number || player.shirtNumber || player.shirt_number || p?.number || p?.shirtNumber || '', pos: player.pos || player.position || p?.pos || p?.position || '', grid: player.grid || p?.grid || '', photo: player.photo || player.image || player.avatar || p?.photo || p?.image || '' };
    };
    return raw.map(item => {
      const teamId = item.teamId || item.team_id || item.team?.id;
      const team = item.team?.name || item.team?.shortName || item.teamName || item.team_name || (String(teamId) === String(match.team1Id) ? match.team1 : String(teamId) === String(match.team2Id) ? match.team2 : '');
      const startRaw = firstArray(item.startXI, item.startXi, item.start_xi, item.startingXI, item.startingXi, item.starting_xi, item.start11, item.lineup, item.players);
      const subsRaw = firstArray(item.substitutes, item.subs, item.bench, item.benchPlayers, item.bench_players);
      return { team, teamId, formation: item.formation || item.system || '', coach: item.coach?.name || item.coachName || item.coach_name || '', startXI: startRaw.map(normalizePlayer).filter(p => p.name), substitutes: subsRaw.map(normalizePlayer).filter(p => p.name) };
    }).filter(item => item.team && (item.startXI.length || item.substitutes.length || item.formation));
  }

  function renderStandingLineups(lineups, match) {
    const home = pickLineup(lineups, match.team1, match.team1Id) || lineups[0];
    const away = pickLineup(lineups, match.team2, match.team2Id) || lineups.find(l => l !== home) || lineups[1];
    return `<div class="standing-lineups">${home ? renderStandingLineup(home, 'home') : ''}${away ? renderStandingLineup(away, 'away') : ''}</div>`;
  }

  function renderStandingLineup(lineup, side) {
    const rows = buildLineupRows(lineup);
    return `<article class="standing-lineup-card ${side}"><header class="standing-lineup-head"><strong>${flag(lineup.team)} ${escapeHtml(lineup.team)}</strong>${lineup.formation ? `<span>${escapeHtml(lineup.formation)}</span>` : ''}</header><div class="standing-pitch"><div class="standing-pitch-lines"></div>${rows.map((row, rowIndex) => renderStandingRow(row, rowIndex, rows.length)).join('')}</div>${lineup.coach ? `<p class="lineup-coach"><strong>Træner:</strong> ${escapeHtml(lineup.coach)}</p>` : ''}${lineup.substitutes.length ? `<details class="standing-bench"><summary>Bænk (${lineup.substitutes.length})</summary><div>${lineup.substitutes.map(player => `<span>${player.number ? `<strong>${escapeHtml(player.number)}</strong> ` : ''}${escapeHtml(player.name)}</span>`).join('')}</div></details>` : ''}</article>`;
  }

  function buildLineupRows(lineup) {
    const players = (lineup.startXI || []).slice();
    if (!players.length) return [];
    const withGrid = players.filter(player => /^\d+:\d+$/.test(String(player.grid || '')));
    if (withGrid.length >= Math.min(8, players.length)) {
      const grouped = new Map();
      players.forEach(player => {
        const [rowRaw, colRaw] = String(player.grid || '9:9').split(':').map(Number);
        const row = Number.isFinite(rowRaw) ? rowRaw : 9;
        const col = Number.isFinite(colRaw) ? colRaw : 9;
        if (!grouped.has(row)) grouped.set(row, []);
        grouped.get(row).push({ ...player, gridCol: col });
      });
      return Array.from(grouped.entries()).sort(([a], [b]) => a - b).map(([, rowPlayers]) => rowPlayers.sort((a, b) => (a.gridCol || 0) - (b.gridCol || 0)));
    }
    const rows = rowsFromFormation(lineup.formation, players.length);
    const ordered = players.slice().sort((a, b) => positionRank(a.pos) - positionRank(b.pos));
    let index = 0;
    return rows.map(count => ordered.slice(index, index += count)).filter(row => row.length);
  }

  function rowsFromFormation(formation, total) {
    const nums = String(formation || '').match(/\d+/g)?.map(Number).filter(n => n > 0) || [];
    const wanted = nums.length ? [1, ...nums] : [1, 4, 4, Math.max(total - 9, 1)];
    const sum = wanted.reduce((a, b) => a + b, 0);
    if (sum === total) return wanted;
    if (sum < total) return wanted.concat(total - sum);
    const result = [];
    let remaining = total;
    for (const count of wanted) {
      if (remaining <= 0) break;
      const next = Math.min(count, remaining);
      result.push(next);
      remaining -= next;
    }
    return result;
  }

  function positionRank(pos = '') {
    const value = String(pos).toUpperCase();
    if (value.startsWith('G')) return 1;
    if (value.startsWith('D')) return 2;
    if (value.startsWith('M')) return 3;
    if (value.startsWith('F') || value.startsWith('A')) return 4;
    return 5;
  }

  function renderStandingRow(players, rowIndex, rowCount) {
    const y = rowCount <= 1 ? 50 : 11 + rowIndex * (78 / Math.max(rowCount - 1, 1));
    return players.map((player, index) => {
      const x = players.length <= 1 ? 50 : 14 + index * (72 / Math.max(players.length - 1, 1));
      return renderStandingPlayer(player, x, y);
    }).join('');
  }

  function renderStandingPlayer(player, x, y) {
    const meta = [player.number ? player.number : '', player.pos].filter(Boolean).join(' · ');
    return `<div class="standing-player" style="left:${x}%; top:${y}%" title="${escapeAttr(player.name)}"><div class="player-avatar">${player.photo ? `<img src="${escapeAttr(player.photo)}" alt="">` : `<span>${escapeHtml(player.number || '•')}</span>`}</div><div class="player-name">${escapeHtml(shortPlayerName(player.name))}</div>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</div>`;
  }

  function pickLineup(lineups, teamName, teamId) {
    return lineups.find(lineup => normalizeName(lineup.team) === normalizeName(teamName) || (teamId && String(lineup.teamId) === String(teamId)));
  }

  function shortPlayerName(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return name;
    return `${parts[0][0]}. ${parts.at(-1)}`.trim();
  }

  function scorePart(part) {
    if (!part || typeof part !== 'object') return '';
    const home = part.home ?? part.homeTeam;
    const away = part.away ?? part.awayTeam;
    return isNumberLike(home) && isNumberLike(away) ? `${home}-${away}` : '';
  }

  function durationLabel(value) {
    const map = { REGULAR: 'Ordinær tid', EXTRA_TIME: 'Ekstra tid', PENALTY_SHOOTOUT: 'Straffesparkskonkurrence' };
    return map[value] || value;
  }

  function winnerLabel(match, value) {
    if (value === 'HOME_TEAM' || value === 'home') return match.team1;
    if (value === 'AWAY_TEAM' || value === 'away') return match.team2;
    if (value === 'DRAW') return 'Uafgjort';
    return value;
  }

  function statusLabel(status) {
    const map = { NS: 'Ikke startet', TBD: 'Ikke fastlagt', '1H': '1. halvleg', HT: 'Pause', '2H': '2. halvleg', ET: 'Forlænget', BT: 'Pause i forlænget', P: 'Straffespark', FT: 'Slut', AET: 'Slut efter forlænget', PEN: 'Slut efter straffe', PST: 'Udsat', CANC: 'Aflyst', SCHEDULED: 'Planlagt', TIMED: 'Fastlagt', LIVE: 'Live', IN_PLAY: 'Spilles', PAUSED: 'Pause', FINISHED: 'Slut', MATCH_FINISHED: 'Slut', POSTPONED: 'Udsat', SUSPENDED: 'Afbrudt', CANCELLED: 'Aflyst' };
    return map[normalizeStatusCode(status)] || map[status] || status;
  }

  function buildGroupCardRows(group) {
    return group.table.map(row => `<tr><td>${flag(row.team)} ${escapeHtml(row.team)}</td><td>${row.played}</td><td>${row.wins}-${row.draws}-${row.losses}</td><td>${row.goalsFor}:${row.goalsAgainst}</td><td><strong>${row.points}</strong></td></tr>`).join('');
  }

  function renderGroupCard(group) {
    return `<section class="card group-card"><div class="group-title"><h3>${escapeHtml(group.name.replace('Group', 'Gruppe'))}</h3><span class="badge">${group.teams.length} hold</span></div><table class="table" aria-label="${escapeAttr(group.name)} tabel"><thead><tr><th>Hold</th><th>K</th><th>P</th><th>Mål</th><th>Pts</th></tr></thead><tbody>${buildGroupCardRows(group)}</tbody></table></section>`;
  }

  function buildGroups() {
    const grouped = groupBy(state.matches.filter(match => match.group), match => match.group);
    return Object.keys(grouped).sort(localeSort).map(name => {
      const teams = Array.from(new Set(grouped[name].flatMap(match => [match.team1, match.team2]).filter(isRealTeam))).sort(localeSort);
      const table = teams.map(team => ({ team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }));
      const rows = Object.fromEntries(table.map(row => [row.team, row]));
      grouped[name].forEach(match => {
        const score = displayScoreFor(match);
        if (!score || !rows[match.team1] || !rows[match.team2]) return;
        const home = rows[match.team1];
        const away = rows[match.team2];
        home.played += 1; away.played += 1;
        home.goalsFor += score.a; home.goalsAgainst += score.b;
        away.goalsFor += score.b; away.goalsAgainst += score.a;
        if (score.a > score.b) { home.wins += 1; away.losses += 1; home.points += 3; }
        else if (score.a < score.b) { away.wins += 1; home.losses += 1; away.points += 3; }
        else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
      });
      table.forEach(row => row.goalDiff = row.goalsFor - row.goalsAgainst);
      table.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || localeSort(a.team, b.team));
      return { name, teams, table };
    });
  }

  function sortedMatches() {
    return [...state.matches].sort((a, b) => (a.kickoff?.getTime?.() || 0) - (b.kickoff?.getTime?.() || 0) || a.index - b.index);
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

  function parseKickoffApiInstant(item, fixture = {}) {
    const timezone = fixture.timezone || item.timezone || 'UTC';
    const rawDate = fixture.date || item.date || item.utcDate || item.kickoff || item.start_time || item.startTime;
    const rawTime = item.time || fixture.time || item.kickoff_time || item.startTime;
    const parsed = parseApiDateTime(rawDate, rawTime, timezone);
    if (parsed) return parsed;
    const fallbackDate = extractDatePart(rawDate || item.date);
    if (fallbackDate) return parseKickoff(fallbackDate, rawTime);
    return null;
  }

  function parseApiDateTime(rawDate, rawTime, timezone = 'UTC') {
    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) return rawDate;
    if (typeof rawDate === 'number' && Number.isFinite(rawDate)) return new Date(rawDate > 10_000_000_000 ? rawDate : rawDate * 1000);
    if (!rawDate) return null;
    const value = String(rawDate).trim();
    const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
    if (hasExplicitZone) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const isoParts = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoParts) {
      const [, y, m, d, h = null, min = '00', sec = '00'] = isoParts;
      if (h !== null) return zonedTimeToUtc(Number(y), Number(m), Number(d), Number(h), Number(min), Number(sec), timezone || 'UTC');
      if (rawTime) {
        const timeParts = String(rawTime).match(/(\d{1,2}):(\d{2})/);
        if (timeParts) return zonedTimeToUtc(Number(y), Number(m), Number(d), Number(timeParts[1]), Number(timeParts[2]), 0, timezone || 'UTC');
      }
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
    }
    return null;
  }

  function parseKickoff(date, time) {
    if (!date) return null;
    const [year, month, day] = String(date).split('-').map(Number);
    if (!year || !month || !day) return null;
    if (!time) return new Date(Date.UTC(year, month - 1, day, 12, 0));
    const match = String(time).match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) {
      const parsed = new Date(`${date}T${String(time).slice(0, 5)}:00Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const offsetHour = Number(match[3]);
    const sign = offsetHour < 0 ? -1 : 1;
    const offsetMinute = Number(match[4] || 0) * sign;
    return new Date(Date.UTC(year, month - 1, day, hour - offsetHour, minute - offsetMinute));
  }

  function extractDatePart(value) {
    if (!value) return '';
    const found = String(value).match(/\d{4}-\d{2}-\d{2}/);
    return found ? found[0] : '';
  }

  function zonedTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, timeZone = 'UTC') {
    const offsetMatch = String(timeZone || '').match(/^UTC\s*([+-]\d{1,2})(?::?(\d{2}))?$/i);
    if (offsetMatch) {
      const offsetHour = Number(offsetMatch[1]);
      const sign = offsetHour < 0 ? -1 : 1;
      const offsetMinute = Number(offsetMatch[2] || 0) * sign;
      return new Date(Date.UTC(year, month - 1, day, hour - offsetHour, minute - offsetMinute, second));
    }
    if (!timeZone || String(timeZone).toUpperCase() === 'UTC') return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    try {
      const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      const offset = getTimeZoneOffsetMs(timeZone, utcGuess);
      return new Date(utcGuess.getTime() - offset);
    } catch {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    }
  }

  function getTimeZoneOffsetMs(timeZone, date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    let hour = Number(get('hour'));
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), hour, Number(get('minute')), Number(get('second')));
    return asUtc - date.getTime();
  }

  function kickoffDateForMatch(match) {
    if (match?.kickoff instanceof Date) return match.kickoff;
    if (match?.utcDate) {
      const date = new Date(match.utcDate);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return parseKickoff(match?.date, match?.time);
  }

  function matchHasProbablyFinished(match) {
    const kickoff = kickoffDateForMatch(match);
    if (!(kickoff instanceof Date) || Number.isNaN(kickoff.getTime())) return false;
    return kickoff.getTime() + 150 * 60 * 1000 < Date.now();
  }

  function dateKeyCph(date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function startOfTodayCph() {
    const [year, month, day] = dateKeyCph(new Date()).split('-').map(Number);
    return zonedTimeToUtc(year, month, day, 0, 0, 0, DEFAULT_TZ);
  }

  function isSameCopenhagenDate(a, b) {
    return dateKeyCph(a) === dateKeyCph(b);
  }

  function formatTime(date) {
    if (!date) return 'Tid ukendt';
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(date);
  }

  function formatDateLong(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatDateKeyLong(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    const date = zonedTimeToUtc(year, month, day, 12, 0, 0, DEFAULT_TZ);
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function formatCopenhagenToday() {
    return new Intl.DateTimeFormat('da-DK', { timeZone: DEFAULT_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  }

  async function testKickoffConnection() {
    try {
      const fixtures = await kickoffGet('fixtures', { league: KICKOFF_LEAGUE, season: KICKOFF_SEASON, timezone: DEFAULT_TZ });
      toast(`KickoffAPI virker. ${fixtures.length} kampe modtaget.`);
    } catch (error) {
      toast(`KickoffAPI fejler: ${error.message}`);
    }
  }

  function renderDataCard() {
    const meta = readRequestMeta();
    const now = Date.now();
    const calls = readRequestTimestamps().filter(ts => now - ts < 24 * 60 * 60 * 1000);
    const minuteCalls = calls.filter(ts => now - ts < 60 * 1000).length;
    return `
      <section class="card flat data-card">
        <h3>Data</h3>
        <p>Kilde: <strong>${escapeHtml(state.dataSource)}</strong>. Sidst opdateret: <strong>${state.lastUpdated ? formatDateTime(new Date(state.lastUpdated)) : 'ukendt'}</strong>.</p>
        <p>API-kald lokalt: ${minuteCalls}/${MAX_API_CALLS_PER_MINUTE} sidste minut · ${calls.length}/${MAX_API_CALLS_PER_DAY} sidste døgn.</p>
        ${meta.minuteRemaining !== undefined ? `<p>API-header: ${escapeHtml(meta.minuteRemaining)} kald tilbage i nuværende vindue.</p>` : ''}
        <div class="api-actions">
          <label for="kickoffKey">KickoffAPI-nøgle</label>
          <input id="kickoffKey" type="password" placeholder="KickoffAPI key" value="${escapeAttr(getKickoffKey())}">
          <button type="button" class="link-button" data-save-kickoff-key>Gem nøgle</button>
          <button type="button" class="link-button" data-test-kickoff>Test KickoffAPI</button>
          <button type="button" class="link-button danger" data-reset-api-cache>Ryd API-cache</button>
        </div>
      </section>
    `;
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function localeSort(a, b) {
    return String(a).localeCompare(String(b), 'da');
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function setRefreshLoading(isLoading) {
    if (!els.refreshBtn) return;
    els.refreshBtn.classList.toggle('loading', isLoading);
    els.refreshBtn.disabled = isLoading;
  }

  function toast(message) {
    if (!els.toast) return;
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
