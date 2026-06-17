(() => {
  'use strict';

  const KICKOFF_BASE = 'https://api.kickoffapi.com/api/v1';
  const KICKOFF_LEAGUE = '1';
  const KICKOFF_SEASON = '2026';
  const DEFAULT_KICKOFF_KEY = 'ft_kiodoa_2f917696298d3baa5ac9f9eb9dcb33200a4275de';
  const KICKOFF_KEY_STORAGE = 'vm2026:kickoffApiKey:v1';
  function getKickoffKey() {
    return localStorage.getItem(KICKOFF_KEY_STORAGE) || DEFAULT_KICKOFF_KEY;
  }
  const DATA_URL = `${KICKOFF_BASE}/fixtures?league=${KICKOFF_LEAGUE}&season=${KICKOFF_SEASON}`;
  const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
  const CACHE_KEY = 'vm2026:data:kickoff:v13-preload-details';
  const RATE_LIMIT_KEY = 'vm2026:kickoffRateLimit:v1';
  const REQUEST_META_KEY = 'vm2026:kickoffRequestMeta:v1';
  const REQUEST_TIMESTAMPS_KEY = 'vm2026:kickoffRequestTimestamps:v1';
  const MATCH_DETAILS_CACHE_KEY = 'vm2026:kickoffMatchDetails:v13-preload-details';
  const MAX_API_CALLS_PER_MINUTE = 60;
  const MAX_API_CALLS_PER_DAY = 100000;
  const MIN_API_INTERVAL_MS = 250;
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
  const LIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const MANUAL_REFRESH_MIN_MS = 15 * 1000;
  const MATCH_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const PRELOAD_KICKOFF_DETAILS = true;
  const MATCH_DETAILS_PRELOAD_CONCURRENCY = 4;
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

  const detailFetchesInFlight = new Map();
  let detailPreloadRunId = 0;
  let detailPreloadRenderTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindNavigation();
    els.refreshBtn.addEventListener('click', () => refreshData(true));
    document.addEventListener('click', handleGlobalClick);
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
      const cached = readCache();
      if (cached && !shouldFetchFreshData(cached, manual)) {
        useData(cached.data, cached.source || 'gemt cache', cached.lastUpdated);
        startKickoffDetailsPreload({ force: manual });
        if (manual) toast('Bruger gemte data for ikke at ramme rate-limit.');
        return;
      }

      const data = await fetchKickoffData(manual);
      useData(data, 'KickoffAPI');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, lastUpdated: new Date().toISOString(), source: 'KickoffAPI' }));
      startKickoffDetailsPreload({ force: true });
      if (manual) toast('Data opdateret fra KickoffAPI.');
    } catch (error) {
      try {
        const data = await fetchOpenFootballData();
        useData(data, 'OpenFootball fallback');
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, lastUpdated: new Date().toISOString(), source: 'OpenFootball fallback' }));
        state.error = `KickoffAPI kunne ikke hentes (${error.message}). Viser OpenFootball fallback.`;
        if (manual) toast('KickoffAPI fejlede. Viser fallback-data.');
      } catch {
        const cached = readCache();
        if (cached) {
          useData(cached.data, 'gemt cache', cached.lastUpdated);
          startKickoffDetailsPreload({ force: manual });
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


  async function fetchKickoffData(manual = false) {
    if (!getKickoffKey()) throw new Error('mangler KickoffAPI nøgle');
    const throttledUntil = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0);
    if (throttledUntil && Date.now() < throttledUntil) throw new Error('rate-limit pause');
    const fixtures = await kickoffGet('fixtures', { league: KICKOFF_LEAGUE, season: KICKOFF_SEASON });
    if (!Array.isArray(fixtures) || fixtures.length === 0) throw new Error('KickoffAPI returnerede 0 kampe for league=1 & season=2026');
    return {
      name: 'FIFA World Cup 2026',
      source: 'KickoffAPI',
      api: 'kickoff',
      matches: fixtures.map(normalizeKickoffMatch),
      raw: { response: fixtures }
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
    const meta = readRequestMeta();
    writeRequestMeta({
      ...meta,
      lastRequestAt: Date.now(),
      requestsAvailableMinute: Number.isNaN(available) ? meta.requestsAvailableMinute : available,
      resetSeconds: Number.isNaN(reset) ? meta.resetSeconds : reset,
      lastHeaderReadAt: new Date().toISOString()
    });
    if (!Number.isNaN(available) && available <= 1 && !Number.isNaN(reset) && reset > 0) {
      localStorage.setItem(RATE_LIMIT_KEY, String(Date.now() + (reset + 5) * 1000));
    } else {
      localStorage.removeItem(RATE_LIMIT_KEY);
    }
  }

  function readRequestMeta() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REQUEST_META_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
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

  async function waitForApiBudget() {
    const now = Date.now();
    let all = readRequestTimestamps().filter(ts => now - ts < 24 * 60 * 60 * 1000);
    const meta = readRequestMeta();
    if (all.length >= MAX_API_CALLS_PER_DAY) throw new Error('lokal dagsgrænse nået');

    const recent = all.filter(ts => now - ts < 60 * 1000);
    if (recent.length >= MAX_API_CALLS_PER_MINUTE) {
      const waitMs = 60000 - (now - recent[0]) + 250;
      await delay(Math.max(waitMs, 1000));
      return waitForApiBudget();
    }

    const sinceLast = now - (meta.lastRequestAt || 0);
    if (sinceLast < MIN_API_INTERVAL_MS) {
      await delay(MIN_API_INTERVAL_MS - sinceLast + 100);
      return waitForApiBudget();
    }

    const stamp = Date.now();
    all = readRequestTimestamps().filter(ts => stamp - ts < 24 * 60 * 60 * 1000);
    all.push(stamp);
    localStorage.setItem(REQUEST_TIMESTAMPS_KEY, JSON.stringify(all));
    writeRequestMeta({ ...meta, lastRequestAt: stamp });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function readMatchDetailsCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MATCH_DETAILS_CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeMatchDetailsCache(cache) {
    localStorage.setItem(MATCH_DETAILS_CACHE_KEY, JSON.stringify(cache));
  }

  function shouldFetchFreshData(cached, manual) {
    if (!cached?.lastUpdated) return true;
    const age = Date.now() - new Date(cached.lastUpdated).getTime();
    const matches = cached.data?.matches || [];
    const hasLive = matches.some(match => isLiveStatus(match.apiStatus || match.status));
    const lastUpdate = new Date(cached.lastUpdated).getTime();
    const matchProbablyFinishedSince = matches.some(match => {
      const kickoff = match.utcDate ? new Date(match.utcDate).getTime() : parseKickoff(match.date, match.time)?.getTime();
      return kickoff && kickoff + 150 * 60 * 1000 > lastUpdate && kickoff + 150 * 60 * 1000 < Date.now();
    });
    if (manual) return age > MANUAL_REFRESH_MIN_MS || cached.source !== 'KickoffAPI';
    if (matchProbablyFinishedSince) return age > 60 * 60 * 1000;
    const ttl = hasLive ? LIVE_CACHE_TTL_MS : CACHE_TTL_MS;
    return age >= ttl;
  }


  function normalizeKickoffMatch(item) {
    const fixture = item.fixture || item;
    const league = item.league || {};
    const teams = item.teams || {};
    const home = teams.home || item.homeTeam || item.home || fixture.homeTeam || fixture.home || {};
    const away = teams.away || item.awayTeam || item.away || fixture.awayTeam || fixture.away || {};
    const events = collectKickoffEvents(item);
    const stats = collectKickoffList(item.statistics || item.fixtureStatistics || item.rawDetail?.statistics);
    const lineups = collectKickoffList(item.lineups || item.rawDetail?.lineups);

    const homeName = teamNameFrom(home, item.team1 || item.home_name || item.homeName || item.home_team || item.home) || 'TBD';
    const awayName = teamNameFrom(away, item.team2 || item.away_name || item.awayName || item.away_team || item.away) || 'TBD';
    const fixtureId = fixture.id || item.num || item.id || item.fixtureId || item.fixture_id;
    const rawStatus = fixture.status?.short || item.statusShort || fixture.statusShort || item.status_short || fixture.status_short || item.status || fixture.status?.long;
    const kickoffDate = fixture.date || item.date || item.utcDate || item.kickoff || item.start_time;

    return {
      ...item,
      num: fixtureId,
      sourceType: 'kickoff',
      team1: homeName,
      team2: awayName,
      team1Id: teamIdFrom(home) || item.team1Id || item.homeTeamId || item.home_team_id || item.homeId || item.home_id || null,
      team2Id: teamIdFrom(away) || item.team2Id || item.awayTeamId || item.away_team_id || item.awayId || item.away_id || null,
      utcDate: kickoffDate,
      date: kickoffDate ? String(kickoffDate).slice(0, 10) : '',
      round: kickoffRoundLabel(league.round || item.round || item.stage || item.roundName),
      group: kickoffGroupLabel(league.round || item.round || item.group || item.groupName),
      ground: [fixture.venue?.name || item.venue?.name || item.stadium, fixture.venue?.city || item.venue?.city || item.city].filter(Boolean).join(', '),
      apiStatus: rawStatus,
      liveMinute: fixture.status?.elapsed || item.elapsed || item.minute,
      lastUpdated: item.updatedAt || item.lastUpdated || item.updated || '',
      score: kickoffScoreFromItem(item, home, away, events),
      rawGoals: getKickoffGoalsObject(item),
      goals: events.filter(isGoalEvent),
      bookings: events.filter(isCardEvent),
      substitutions: events.filter(isSubstitutionEvent),
      fixtureStatistics: stats,
      lineups,
      referee: fixture.referee || item.referee || '',
      timezone: fixture.timezone || 'UTC'
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
    const goalsObj = getKickoffGoalsObject(item);
    const fixtureScore = fixture.score || {};

    const full = firstScorePair(
      [goalsObj.home, goalsObj.away],
      [goalsObj.homeTeam, goalsObj.awayTeam],
      [goalsObj.for, goalsObj.against],
      [home.goals, away.goals],
      [home.score, away.score],
      [item.homeTeam?.goals, item.awayTeam?.goals],
      [item.homeTeam?.score, item.awayTeam?.score],
      [item.teams?.home?.goals, item.teams?.away?.goals],
      [item.teams?.home?.score, item.teams?.away?.score],
      [fixture.homeTeam?.goals, fixture.awayTeam?.goals],
      [fixture.homeTeam?.score, fixture.awayTeam?.score],
      [item.home_score, item.away_score],
      [item.homeScore, item.awayScore],
      [item.score1, item.score2],
      [item.goals1, item.goals2],
      [score.a, score.b],
      [score.home, score.away],
      [score.homeTeam, score.awayTeam],
      [score.fullTime?.home, score.fullTime?.away],
      [score.fullTime?.homeTeam, score.fullTime?.awayTeam],
      [score.fulltime?.home, score.fulltime?.away],
      [score.fulltime?.homeTeam, score.fulltime?.awayTeam],
      [score.full_time?.home, score.full_time?.away],
      [score.ft?.home, score.ft?.away],
      [score.final?.home, score.final?.away],
      [score.current?.home, score.current?.away],
      [fixtureScore.fullTime?.home, fixtureScore.fullTime?.away],
      [fixtureScore.fulltime?.home, fixtureScore.fulltime?.away],
      [fixtureScore.full_time?.home, fixtureScore.full_time?.away],
      [fixtureScore.home, fixtureScore.away],
      Array.isArray(score) ? [score[0], score[1]] : [],
      Array.isArray(score.ft) ? [score.ft[0], score.ft[1]] : [],
      Array.isArray(score.final) ? [score.final[0], score.final[1]] : []
    );

    const halfTime = firstScorePart(
      [score.halftime?.home, score.halftime?.away],
      [score.halfTime?.home, score.halfTime?.away],
      [score.half_time?.home, score.half_time?.away],
      [item.halftime?.home, item.halftime?.away],
      [item.halfTime?.home, item.halfTime?.away],
      [fixtureScore.halftime?.home, fixtureScore.halftime?.away]
    );
    const regularTime = firstScorePart(
      [score.fulltime?.home, score.fulltime?.away],
      [score.fullTime?.home, score.fullTime?.away],
      [score.full_time?.home, score.full_time?.away],
      full ? [full.home, full.away] : []
    );
    const extraTime = firstScorePart(
      [score.extratime?.home, score.extratime?.away],
      [score.extraTime?.home, score.extraTime?.away],
      [score.extra_time?.home, score.extra_time?.away]
    );
    const penalties = firstScorePart(
      [score.penalty?.home, score.penalty?.away],
      [score.penalties?.home, score.penalties?.away],
      [score.penalties?.homeTeam, score.penalties?.awayTeam],
      [score.p?.home, score.p?.away]
    );

    if (full) {
      return {
        a: full.home,
        b: full.away,
        label: `${full.rawHome}-${full.rawAway}`,
        fullTime: { home: full.home, away: full.away },
        halfTime,
        regularTime,
        extraTime,
        penalties,
        winner: score.winner || item.winner || item.result?.winner,
        duration: score.duration || item.duration || item.result?.duration
      };
    }

    const goalEvents = events.filter(isGoalEvent);
    if (goalEvents.length) {
      const homeId = teamIdFrom(home) || item.team1Id || item.homeTeamId || item.home_team_id || item.homeId || item.home_id;
      const awayId = teamIdFrom(away) || item.team2Id || item.awayTeamId || item.away_team_id || item.awayId || item.away_id;
      const homeName = teamNameFrom(home, item.team1 || item.home_name || item.homeName || item.home_team || item.home);
      const awayName = teamNameFrom(away, item.team2 || item.away_name || item.awayName || item.away_team || item.away);
      const homeGoals = goalEvents.filter(event => eventBelongsToSide(event, 1, homeId, homeName)).length;
      const awayGoals = goalEvents.filter(event => eventBelongsToSide(event, 2, awayId, awayName)).length;
      if (homeGoals || awayGoals) {
        return {
          a: homeGoals,
          b: awayGoals,
          label: `${homeGoals}-${awayGoals}`,
          inferredFromEvents: true,
          halfTime,
          regularTime,
          extraTime,
          penalties
        };
      }
    }

    return null;
  }

  function firstScorePair(...pairs) {
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [home, away] = pair;
      if (isNumberLike(home) && isNumberLike(away)) {
        return { home: Number(home), away: Number(away), rawHome: home, rawAway: away };
      }
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
    return [];
  }

  function collectKickoffEvents(item) {
    const candidates = [
      item.events,
      item.response,
      item.data,
      item.matchEvents,
      item.timeline,
      item.incidents,
      item.fixture?.events,
      item.rawDetail?.events
    ];
    if (Array.isArray(item.goals)) candidates.push(item.goals);
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
    if (/group/i.test(round)) return 'Matchday';
    return round.replace('Round of 32', 'Round of 32');
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
    let score = extractScore(match);
    if (!score) score = deriveScoreFromEvents(match);
    const isGroup = Boolean(match.group);
    const now = new Date();
    const apiStatus = match.apiStatus || match.status;
    const status = isLiveStatus(apiStatus) ? 'live' : (score || isFinishedStatus(apiStatus)) ? 'result' : kickoff && isSameCopenhagenDate(kickoff, now) ? 'today' : 'scheduled';
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

    if (match.goals && !Array.isArray(match.goals) && isNumberLike(match.goals.home) && isNumberLike(match.goals.away)) {
      return { a: Number(match.goals.home), b: Number(match.goals.away), label: `${match.goals.home}-${match.goals.away}` };
    }

    if (match.score && typeof match.score === 'object') {
      if (isNumberLike(match.score.a) && isNumberLike(match.score.b)) {
        return { a: Number(match.score.a), b: Number(match.score.b), label: match.score.label || `${match.score.a}-${match.score.b}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      }
      if (isNumberLike(match.score.home) && isNumberLike(match.score.away)) {
        return { a: Number(match.score.home), b: Number(match.score.away), label: `${match.score.home}-${match.score.away}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      }
      const fullTimeObj = match.score.fullTime || match.score.fulltime || match.score.full_time;
      if (fullTimeObj && isNumberLike(fullTimeObj.home) && isNumberLike(fullTimeObj.away)) {
        return { a: Number(fullTimeObj.home), b: Number(fullTimeObj.away), label: `${fullTimeObj.home}-${fullTimeObj.away}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
      }
      if (fullTimeObj && isNumberLike(fullTimeObj.homeTeam) && isNumberLike(fullTimeObj.awayTeam)) {
        return { a: Number(fullTimeObj.homeTeam), b: Number(fullTimeObj.awayTeam), label: `${fullTimeObj.homeTeam}-${fullTimeObj.awayTeam}`, winner: match.score.winner, duration: match.score.duration, halfTime: match.score.halfTime, regularTime: match.score.regularTime, extraTime: match.score.extraTime, penalties: match.score.penalties };
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

  function deriveScoreFromEvents(match) {
    // Some KickoffAPI endpoints return fixture/event details without a clean score object.
    // In that case, derive the visible result from the actual goal events instead of showing dashes.
    try {
      const goals1 = extractGoals(match, 1);
      const goals2 = extractGoals(match, 2);
      if (!goals1.length && !goals2.length) return null;
      return {
        a: goals1.length,
        b: goals2.length,
        label: `${goals1.length}-${goals2.length}`,
        inferredFromEvents: true,
        halfTime: match.score?.halfTime,
        regularTime: match.score?.regularTime,
        extraTime: match.score?.extraTime,
        penalties: match.score?.penalties,
        duration: match.score?.duration,
        winner: match.score?.winner
      };
    } catch {
      return null;
    }
  }

  function displayScoreFor(match) {
    // Final safety net: the main fixture endpoint may omit a score even though
    // details/events contain goals. All UI must use this rather than match.score directly.
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



  function startKickoffDetailsPreload({ force = false } = {}) {
    if (!PRELOAD_KICKOFF_DETAILS || !getKickoffKey()) return;
    if (!state.matches.length || !state.matches.some(match => match.sourceType === 'kickoff')) return;

    const targets = state.matches.filter(match => shouldPreloadKickoffDetails(match, force));
    if (!targets.length) return;

    const runId = ++detailPreloadRunId;
    toast(`Henter kampdetaljer og resultater for ${targets.length} kampe i baggrunden.`);

    runWithConcurrency(targets, MATCH_DETAILS_PRELOAD_CONCURRENCY, async match => {
      if (runId !== detailPreloadRunId) return;
      try {
        const detailMatch = await fetchFootballMatchDetails(match);
        if (runId !== detailPreloadRunId) return;
        mergeDetailMatchIntoState(detailMatch);
        scheduleDetailPreloadRender();
      } catch (error) {
        // Preload må aldrig ødelægge appen. Fejl vises stadig, hvis brugeren åbner kampen manuelt.
        console.warn('Kickoff detail preload fejlede:', match.id, error);
      }
    }).then(() => {
      if (runId !== detailPreloadRunId) return;
      persistCurrentKickoffDataToCache();
      render();
      toast('Kampdetaljer/resultater er hentet og gemt lokalt.');
    }).catch(error => {
      if (runId === detailPreloadRunId) console.warn('Kickoff detail preload stoppede:', error);
    });
  }

  function shouldPreloadKickoffDetails(match, force = false) {
    if (!match || match.sourceType !== 'kickoff') return false;

    const cache = readMatchDetailsCache();
    const cached = cache[match.id];
    if (!force && cached?.savedAt && cached?.data && matchAlreadyHasDetailData(match)) {
      const age = Date.now() - new Date(cached.savedAt).getTime();
      const ttl = match.status === 'live' ? LIVE_CACHE_TTL_MS : MATCH_DETAILS_CACHE_TTL_MS;
      if (age < ttl) return false;
    }

    if (force) return true;
    if (match.status === 'live' || match.status === 'result') return true;
    if (isLiveStatus(match.apiStatus) || isFinishedStatus(match.apiStatus)) return true;
    if (displayScoreFor(match)) return true;
    if (matchHasProbablyFinished(match)) return true;
    return false;
  }

  function matchAlreadyHasDetailData(match) {
    return Boolean(
      match?.rawDetail ||
      (Array.isArray(match?.goals) && match.goals.length) ||
      (Array.isArray(match?.bookings) && match.bookings.length) ||
      (Array.isArray(match?.substitutions) && match.substitutions.length) ||
      (Array.isArray(match?.fixtureStatistics) && match.fixtureStatistics.length) ||
      (Array.isArray(match?.lineups) && match.lineups.length)
    );
  }

  function matchHasProbablyFinished(match) {
    const kickoff = match.kickoff instanceof Date ? match.kickoff : match.utcDate ? new Date(match.utcDate) : parseKickoff(match.date, match.time);
    if (!(kickoff instanceof Date) || Number.isNaN(kickoff.getTime())) return false;
    return kickoff.getTime() + 150 * 60 * 1000 < Date.now();
  }

  async function runWithConcurrency(items, concurrency, worker) {
    const queue = [...items];
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await worker(item);
      }
    });
    await Promise.all(workers);
  }

  function mergeDetailMatchIntoState(detailMatch) {
    if (!detailMatch?.id) return;
    const idx = state.matches.findIndex(item => item.id === detailMatch.id);
    if (idx === -1) return;
    state.matches[idx] = withDisplayScore({ ...state.matches[idx], ...detailMatch });
    if (state.data && Array.isArray(state.data.matches)) {
      state.data.matches[idx] = state.matches[idx];
    }
  }

  function scheduleDetailPreloadRender() {
    if (detailPreloadRenderTimer) return;
    detailPreloadRenderTimer = setTimeout(() => {
      detailPreloadRenderTimer = null;
      persistCurrentKickoffDataToCache();
      render();
    }, 600);
  }

  function persistCurrentKickoffDataToCache() {
    if (!state.data || !state.matches.some(match => match.sourceType === 'kickoff')) return;
    const data = { ...state.data, matches: state.matches };
    state.data = data;
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      lastUpdated: state.lastUpdated || new Date().toISOString(),
      source: state.dataSource || 'KickoffAPI'
    }));
  }

  function handleGlobalClick(event) {
    const reset = event.target.closest('[data-reset-api-cache]');
    if (reset) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(MATCH_DETAILS_CACHE_KEY);
      localStorage.removeItem(RATE_LIMIT_KEY);
      localStorage.removeItem(REQUEST_TIMESTAMPS_KEY);
      localStorage.removeItem(REQUEST_META_KEY);
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
    if (!save) return;
    const input = document.getElementById('kickoffKey');
    const value = input?.value?.trim() || '';
    if (value) {
      localStorage.setItem(KICKOFF_KEY_STORAGE, value);
    } else {
      localStorage.removeItem(KICKOFF_KEY_STORAGE);
    }
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(MATCH_DETAILS_CACHE_KEY);
    localStorage.removeItem(RATE_LIMIT_KEY);
    localStorage.removeItem(REQUEST_TIMESTAMPS_KEY);
    localStorage.removeItem(REQUEST_META_KEY);
    toast(value ? 'KickoffAPI nøgle gemt. Cache og lokal rate-limit er ryddet.' : 'API-nøgle fjernet. Bruger indbygget nøgle. Cache og lokal rate-limit er ryddet.');
    refreshData(true);
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
    const next = sorted.find(match => !displayScoreFor(match) && match.kickoff && match.kickoff >= startOfTodayCph()) || sorted.find(match => !displayScoreFor(match));
    const recent = sorted.filter(match => displayScoreFor(match)).slice(-3).reverse();
    const favoriteUpcoming = sorted.filter(match => isFavoriteRelated(match) && !displayScoreFor(match)).slice(0, 3);
    const groupCount = new Set(state.matches.filter(m => m.group).map(m => m.group)).size;

    return `
      <section class="hero">
        <p class="eyebrow">Kampprogram & resultater</p>
        <h2>VM i Nordamerika – uden bøvl</h2>
        <p>Henter VM 2026-data fra KickoffAPI. Ingen live-spam — appen opdaterer manuelt eller når en kamp burde være færdig.</p>
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
    const displayScore = displayScoreFor(match);
    const badge = match.status === 'live' ? '<span class="badge today">Live</span>' : displayScore ? '<span class="badge result">Resultat</span>' : match.status === 'today' ? '<span class="badge today">I dag</span>' : match.group ? `<span class="badge">${escapeHtml(match.groupDa || 'Gruppe')}</span>` : '<span class="badge knockout">Slutspil</span>';
    return `
      <article class="match-card" data-match-details="${escapeAttr(match.id)}" tabindex="0" role="button" aria-label="Vis kampdetaljer">
        <div class="match-top">
          <span>${escapeHtml(match.roundDa)}</span>
          <button type="button" class="favorite-btn ${isFav ? 'active' : ''}" data-fav-match="${escapeAttr(match.id)}" aria-label="${isFav ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}">★</button>
        </div>
        <div class="teams">
          <div class="team-row">
            <div class="team-name"><span class="flag">${flag(match.team1)}</span><span>${escapeHtml(match.team1 || 'TBD')}</span></div>
            <div class="score ${displayScore ? '' : 'empty'}">${displayScore ? displayScore.a : '–'}</div>
          </div>
          <div class="team-row">
            <div class="team-name"><span class="flag">${flag(match.team2)}</span><span>${escapeHtml(match.team2 || 'TBD')}</span></div>
            <div class="score ${displayScore ? '' : 'empty'}">${displayScore ? displayScore.b : '–'}</div>
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
    wrapper.dataset.matchId = match.id;
    wrapper.innerHTML = renderMatchDetails(match, ['football-data','kickoff','kickoff'].includes(match.sourceType));
    document.body.appendChild(wrapper);
    document.body.classList.add('modal-open');
    wrapper.addEventListener('click', event => {
      if (event.target === wrapper || event.target.closest('[data-close-modal]')) closeMatchDetails();
    });
    document.addEventListener('keydown', closeOnEscape);
    if (['football-data','kickoff','kickoff'].includes(match.sourceType)) {
      fetchFootballMatchDetails(match).then(detailMatch => {
        mergeDetailMatchIntoState(detailMatch);
        persistCurrentKickoffDataToCache();
        render();
        const current = document.querySelector(`.modal-backdrop[data-match-id="${CSS.escape(match.id)}"]`);
        if (current) current.innerHTML = renderMatchDetails(detailMatch, false);
      }).catch(error => {
        const current = document.querySelector(`.modal-backdrop[data-match-id="${CSS.escape(match.id)}"] .match-modal`);
        if (current && !current.querySelector('.data-note')) {
          current.insertAdjacentHTML('beforeend', `<p class="data-note">Kunne ikke hente ekstra kampdata lige nu: ${escapeHtml(error.message)}</p>`);
        }
      });
    }
  }

  async function fetchFootballMatchDetails(match) {
    const key = match?.id || match?.num || match?.fixtureId;
    if (key && detailFetchesInFlight.has(key)) return detailFetchesInFlight.get(key);
    const promise = fetchFootballMatchDetailsInner(match);
    if (key) {
      detailFetchesInFlight.set(key, promise);
      promise.then(
        () => detailFetchesInFlight.delete(key),
        () => detailFetchesInFlight.delete(key)
      );
    }
    return promise;
  }

  async function fetchFootballMatchDetailsInner(match) {
    const cache = readMatchDetailsCache();
    const cached = cache[match.id];
    if (cached?.savedAt && cached?.data) {
      const age = Date.now() - new Date(cached.savedAt).getTime();
      const ttl = match.status === 'live' ? LIVE_CACHE_TTL_MS : MATCH_DETAILS_CACHE_TTL_MS;
      if (age < ttl) {
        if (match.sourceType === 'kickoff') return withDisplayScore(normalizeMatch({ ...match, ...normalizeKickoffMatch(cached.data), rawDetail: cached.data }, match.index));
        return normalizeMatch({ ...match, ...cached.data }, match.index);
      }
    }

    if (match.sourceType === 'kickoff') {
      if (!getKickoffKey()) throw new Error('mangler KickoffAPI nøgle');
      const detail = await fetchKickoffFullMatchDetails(match);
      cache[match.id] = { savedAt: new Date().toISOString(), data: detail };
      writeMatchDetailsCache(cache);
      return withDisplayScore(normalizeMatch({ ...match, ...normalizeKickoffMatch(detail), rawDetail: detail }, match.index));
    }

    throw new Error('ekstra kampdata kræver KickoffAPI-kilde');
  }

  async function kickoffGet(path, params = {}) {
    await waitForApiBudget();
    const cleanPath = String(path).replace(/^\/+/, '');
    const url = new URL(`${KICKOFF_BASE}/${cleanPath}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const response = await fetch(url.toString(), {
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
    if (!Array.isArray(data)) throw new Error(`ukendt KickoffAPI format ved ${cleanPath}`);
    return data;
  }

  function unwrapKickoffPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload.response)) return payload.response;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.fixtures)) return payload.fixtures;
    if (payload.response && typeof payload.response === 'object') return [payload.response];
    if (payload.data && typeof payload.data === 'object') return [payload.data];
    return null;
  }

  function formatApiError(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const errors = payload.errors || payload.error;
    if (!errors || (Array.isArray(errors) && errors.length === 0)) return '';
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

  async function fetchKickoffFullMatchDetails(match) {
    const fixtureId = match.num || match.fixture?.id || match.fixtureId || match.id;
    const combined = { ...match };
    if (!fixtureId) throw new Error('mangler fixture-id til kampdetaljer');
    const status = match.apiStatus || match.status || '';
    const kickoff = match.kickoff instanceof Date ? match.kickoff : null;
    const now = Date.now();
    const minutesToKickoff = kickoff ? (kickoff.getTime() - now) / 60000 : null;
    const hasRecordedScore = Boolean(displayScoreFor(match));
    const isPastEnoughToHaveResult = matchHasProbablyFinished(match);
    const isFinishedOrLive = isLiveStatus(status) || isFinishedStatus(status) || hasRecordedScore;
    const isLikelyUseful = isFinishedOrLive || isPastEnoughToHaveResult;
    const lineupsMayExist = isLikelyUseful || (minutesToKickoff !== null && minutesToKickoff <= 90);

    const endpointCalls = [
      [`fixtures/${fixtureId}/events`, 'events', isLikelyUseful],
      [`fixtures/${fixtureId}/statistics`, 'statistics', isLikelyUseful],
      [`fixtures/${fixtureId}/lineups`, 'lineups', lineupsMayExist]
    ];

    for (const [endpoint, key, shouldCall] of endpointCalls) {
      if (!shouldCall) continue;
      try {
        combined[key] = await kickoffGet(endpoint);
      } catch (error) {
        combined.extraErrors = combined.extraErrors || [];
        combined.extraErrors.push(`${endpoint}: ${error.message}`);
      }
    }

    return combined;
  }


  function closeOnEscape(event) {
    if (event.key === 'Escape') closeMatchDetails();
  }

  function closeMatchDetails() {
    document.querySelector('.modal-backdrop')?.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', closeOnEscape);
  }

  function renderMatchDetails(match, loadingExtra = false) {
    const goals1 = extractGoals(match, 1);
    const goals2 = extractGoals(match, 2);
    const bookings = extractBookings(match);
    const cardStats = extractCardStats(match);
    const substitutions = extractSubstitutions(match);
    const teamStats = extractTeamStatistics(match);
    const lineups = extractLineups(match);
    const hasGoals = goals1.length || goals2.length;
    const fields = extractAvailableMatchFields(match);
    return `
      <section class="match-modal" role="dialog" aria-modal="true" aria-label="Kampdetaljer">
        <button type="button" class="modal-close" data-close-modal aria-label="Luk">×</button>
        <p class="eyebrow">${escapeHtml(match.roundDa)}${match.status === 'live' && match.liveMinute ? ` · ${escapeHtml(match.liveMinute)}'` : ''}</p>
        <h2>${flag(match.team1)} ${escapeHtml(match.team1 || 'TBD')} <span>mod</span> ${flag(match.team2)} ${escapeHtml(match.team2 || 'TBD')}</h2>
        <div class="modal-score">${displayScoreFor(match) ? escapeHtml(displayScoreFor(match).label) : '–'}</div>
        <div class="modal-meta">
          <span>${formatDateLong(match.kickoff) || 'Tid ukendt'}</span>
          ${match.ground ? `<span>${escapeHtml(match.ground)}</span>` : ''}
          ${match.groupDa ? `<span>${escapeHtml(match.groupDa)}</span>` : ''}
          ${match.apiStatus ? `<span>${escapeHtml(statusLabel(match.apiStatus))}</span>` : ''}
        </div>

        ${fields.length ? `<div class="detail-grid">${fields.map(renderDetailBox).join('')}</div>` : ''}
        ${loadingExtra ? '<p class="data-note">Henter ekstra kampdata fra KickoffAPI uden at bruge unødige kald…</p>' : ''}
        ${Array.isArray(match.rawDetail?.extraErrors) && match.rawDetail.extraErrors.length ? `<p class="data-note">Noget ekstra data manglede fra KickoffAPI: ${escapeHtml(match.rawDetail.extraErrors.join(' · '))}</p>` : ''}
        ${!loadingExtra && match.rawDetail && !hasGoals && !bookings.length && !substitutions.length && !teamStats.length && !lineups.length ? '<p class="data-note">KickoffAPI har ikke sendt detaljer for denne kamp endnu. Appen viser derfor kun basisdata.</p>' : ''}

        ${hasGoals ? `
          <h3>Målscorere</h3>
          <div class="goals-wrap">
            ${renderGoalList(match.team1, goals1)}
            ${renderGoalList(match.team2, goals2)}
          </div>
        ` : ''}

        ${bookings.length ? `
          <h3>Kort</h3>
          <div class="event-list">${bookings.map(renderBooking).join('')}</div>
        ` : cardStats.length ? `
          <h3>Kort</h3>
          <div class="detail-grid">${cardStats.map(renderDetailBox).join('')}</div>
        ` : ''}

        ${substitutions.length ? `
          <h3>Udskiftninger</h3>
          <div class="event-list">${substitutions.map(renderSubstitution).join('')}</div>
        ` : ''}

        ${teamStats.length ? `
          <h3>Kampstatistik</h3>
          <div class="stats-table">${renderTeamStatistics(teamStats)}</div>
        ` : ''}

        ${lineups.length ? `
          <h3>Startopstillinger</h3>
          <div class="lineup-grid">${lineups.map(renderLineup).join('')}</div>
        ` : ''}
      </section>
    `;
  }

  function renderDetailBox(item) {
    return `<div class="detail-box"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`;
  }

  function extractAvailableMatchFields(match) {
    const fields = [];
    const add = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      fields.push({ label, value: String(value) });
    };
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
    if (Array.isArray(match.referees) && match.referees.length) {
      add('Dommer', match.referees.map(ref => ref.name).filter(Boolean).join(', '));
    }
    return fields;
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
    if (value === 'HOME_TEAM') return match.team1;
    if (value === 'AWAY_TEAM') return match.team2;
    if (value === 'DRAW') return 'Uafgjort';
    return value;
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
    const teamId = side === 1 ? match.team1Id : match.team2Id;
    const teamName = side === 1 ? match.team1 : match.team2;

    if (Array.isArray(match.goals)) {
      return match.goals
        .filter(goal => eventBelongsToSide(goal, side, teamId, teamName))
        .map(goal => normalizeGoal(goal))
        .filter(Boolean);
    }

    if (Array.isArray(match.events)) {
      return match.events
        .filter(isGoalEvent)
        .filter(goal => eventBelongsToSide(goal, side, teamId, teamName))
        .map(goal => normalizeGoal(goal))
        .filter(Boolean);
    }

    const raw = match[`goals${side}`] || match[`goals_${side}`] || match[side === 1 ? 'home_goals' : 'away_goals'];
    if (!Array.isArray(raw)) return [];
    return raw.map(goal => normalizeGoal(goal)).filter(Boolean);
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
    const assist = goal.assist?.name || goal.assistName || goal.assist || '';
    const minuteValue = goal.minute ?? goal.time?.elapsed ?? goal.time ?? goal.minutes ?? goal.min;
    const offset = goal.extraTime ?? goal.time?.extra ?? goal.offset ?? goal.extra ?? goal.extra_time ?? goal.added;
    let minute = minuteValue !== undefined && minuteValue !== null && minuteValue !== '' ? `${minuteValue}'` : '';
    if (offset !== undefined && offset !== null && offset !== '') minute = minute ? `${minute}+${offset}'` : `${offset}'`;
    const tags = [];
    const type = String(goal.detail || goal.type || '').toUpperCase();
    if (goal.penalty || goal.pen || type.includes('PENALTY')) tags.push('straffe');
    if (goal.own_goal || goal.owngoal || type.includes('OWN')) tags.push('selvmål');
    if (assist) tags.push(`assist: ${assist}`);
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
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }


  function extractTeamStatistics(match) {
    if (!Array.isArray(match.fixtureStatistics)) return [];
    return match.fixtureStatistics.map(teamBlock => {
      const teamId = teamBlock.teamId || teamBlock.team?.id;
      const teamName = teamBlock.team?.name || (String(teamId) === String(match.team1Id) ? match.team1 : String(teamId) === String(match.team2Id) ? match.team2 : '');
      let stats = [];
      if (Array.isArray(teamBlock.statistics)) {
        stats = teamBlock.statistics.filter(s => s && s.type && s.value !== null && s.value !== undefined);
      } else if (teamBlock.statistics && typeof teamBlock.statistics === 'object') {
        stats = Object.entries(teamBlock.statistics)
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([type, value]) => ({ type, value }));
      }
      return { team: teamName, stats };
    }).filter(block => block.team && block.stats.length);
  }


  function renderTeamStatistics(blocks) {
    const statTypes = Array.from(new Set(blocks.flatMap(block => block.stats.map(s => s.type))));
    return `
      <table class="table">
        <thead><tr><th>Statistik</th>${blocks.map(block => `<th>${escapeHtml(block.team)}</th>`).join('')}</tr></thead>
        <tbody>
          ${statTypes.map(type => `
            <tr>
              <td>${escapeHtml(translateStatType(type))}</td>
              ${blocks.map(block => `<td>${escapeHtml(statValue(block, type))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function statValue(block, type) {
    const found = block.stats.find(s => s.type === type);
    return found?.value !== null && found?.value !== undefined ? String(found.value) : '–';
  }

  function translateStatType(type) {
    const map = {
      'Shots on Goal': 'Skud på mål', 'Shots off Goal': 'Skud forbi', 'Total Shots': 'Skud i alt',
      'Blocked Shots': 'Blokerede skud', 'Shots insidebox': 'Skud i feltet', 'Shots outsidebox': 'Skud udenfor feltet',
      'Fouls': 'Frispark imod', 'Corner Kicks': 'Hjørnespark', 'Offsides': 'Offside',
      'Ball Possession': 'Boldbesiddelse', 'Yellow Cards': 'Gule kort', 'Red Cards': 'Røde kort',
      'Goalkeeper Saves': 'Redninger', 'Total passes': 'Afleveringer', 'Passes accurate': 'Præcise afleveringer',
      'Passes %': 'Afleveringsprocent', 'expected_goals': 'xG'
    };
    return map[type] || type;
  }

  function extractLineups(match) {
    const raw = match.lineups || match.rawDetail?.lineups;
    if (!Array.isArray(raw)) return [];
    const normalizePlayer = p => {
      const player = p?.player || p || {};
      return {
        name: player.name || player.playerName || p?.playerName || '',
        number: player.number || p?.number || '',
        pos: player.pos || player.position || p?.pos || p?.position || '',
        grid: player.grid || p?.grid || '',
        photo: player.photo || player.image || player.avatar || p?.photo || p?.image || ''
      };
    };
    return raw.map(item => {
      const teamId = item.teamId || item.team?.id;
      const team = item.team?.name || item.teamName || (String(teamId) === String(match.team1Id) ? match.team1 : String(teamId) === String(match.team2Id) ? match.team2 : '');
      const startRaw = Array.isArray(item.startXI) ? item.startXI : (Array.isArray(item.start_xi) ? item.start_xi : []);
      const subsRaw = Array.isArray(item.substitutes) ? item.substitutes : (Array.isArray(item.bench) ? item.bench : []);
      return {
        team,
        teamId,
        formation: item.formation || '',
        coach: item.coach?.name || item.coachName || '',
        startXI: startRaw.map(normalizePlayer).filter(p => p.name),
        substitutes: subsRaw.map(normalizePlayer).filter(p => p.name)
      };
    }).filter(item => item.team && (item.startXI.length || item.substitutes.length || item.formation));
  }


  function renderLineup(lineup) {
    return `
      <div class="goal-team lineup-card">
        <h4>${flag(lineup.team)} ${escapeHtml(lineup.team)}</h4>
        ${lineup.formation ? `<p><strong>Formation:</strong> ${escapeHtml(lineup.formation)}</p>` : ''}
        ${lineup.coach ? `<p><strong>Træner:</strong> ${escapeHtml(lineup.coach)}</p>` : ''}
        ${lineup.startXI.length ? `
          <div class="lineup-section-title">Start-11</div>
          <ol class="lineup-list">
            ${lineup.startXI.map(player => renderLineupPlayer(player)).join('')}
          </ol>
        ` : ''}
        ${lineup.substitutes.length ? `
          <details class="lineup-subs">
            <summary>Udskiftere (${lineup.substitutes.length})</summary>
            <ol class="lineup-list">
              ${lineup.substitutes.map(player => renderLineupPlayer(player)).join('')}
            </ol>
          </details>
        ` : ''}
      </div>
    `;
  }

  function renderLineupPlayer(player) {
    const meta = [player.number ? `#${player.number}` : '', player.pos, player.grid ? `grid ${player.grid}` : ''].filter(Boolean).join(' · ');
    return `<li><span>${escapeHtml(player.name)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</li>`;
  }

  function extractCardStats(match) {
    const stats = [];
    const addTeamStats = (teamLabel, statistics) => {
      if (!statistics || typeof statistics !== 'object') return;
      const yellow = statistics.yellow_cards ?? statistics.yellowCards ?? statistics.yellows;
      const yellowRed = statistics.yellow_red_cards ?? statistics.yellowRedCards;
      const red = statistics.red_cards ?? statistics.redCards ?? statistics.reds;
      const parts = [];
      if (isNumberLike(yellow)) parts.push(`🟨 ${yellow}`);
      if (isNumberLike(yellowRed)) parts.push(`🟨🟥 ${yellowRed}`);
      if (isNumberLike(red)) parts.push(`🟥 ${red}`);
      if (parts.length) stats.push({ label: teamLabel, value: parts.join(' · ') });
    };
    addTeamStats(match.team1 || 'Hjemmehold', match.homeTeam?.statistics || match.homeStatistics || match.statistics?.homeTeam || match.statistics?.home);
    addTeamStats(match.team2 || 'Udehold', match.awayTeam?.statistics || match.awayStatistics || match.statistics?.awayTeam || match.statistics?.away);
    if (!stats.length && match.statistics && typeof match.statistics === 'object') {
      addTeamStats('Kort i kampen', match.statistics);
    }
    return stats;
  }

  function extractBookings(match) {
    if (!Array.isArray(match.bookings)) return [];
    return match.bookings
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const rawCard = String(item.card || item.detail || item.comments || item.type || '').toUpperCase();
        const isYellow = rawCard.includes('YELLOW');
        const isRed = rawCard.includes('RED');
        if (!isYellow && !isRed) return null;
        const player = item.player?.name || item.playerName || item.name || '';
        const team = item.team?.shortName || item.team?.name || item.teamName || '';
        const minute = formatMinute(item.minute ?? item.time?.elapsed ?? item.time ?? item.minutes);
        return {
          minute,
          team,
          player,
          card: rawCard,
          label: cardLabel(rawCard)
        };
      })
      .filter(Boolean);
  }

  function cardLabel(card) {
    if (card.includes('SECOND') || card.includes('YELLOW_RED')) return 'Andet gule kort';
    if (card.includes('RED')) return 'Rødt kort';
    if (card.includes('YELLOW')) return 'Gult kort';
    return 'Kort';
  }

  function renderBooking(item) {
    const icon = String(item.card).includes('RED') ? '🟥' : '🟨';
    const main = [item.player, item.team].filter(Boolean).join(' · ');
    return `<div class="event-row"><span>${icon} ${escapeHtml(item.label)}${main ? ` · ${escapeHtml(main)}` : ''}</span><small>${escapeHtml(item.minute)}</small></div>`;
  }

  function extractSubstitutions(match) {
    if (!Array.isArray(match.substitutions)) return [];
    return match.substitutions.map(item => ({
      minute: formatMinute(item.minute ?? item.time?.elapsed ?? item.time),
      team: item.team?.shortName || item.team?.name || item.teamName || (String(item.teamId) === String(match.team1Id) ? match.team1 : String(item.teamId) === String(match.team2Id) ? match.team2 : ''),
      out: item.playerOut?.name || item.assist?.name || item.assistName || '',
      in: item.playerIn?.name || item.player?.name || item.playerName || ''
    })).filter(item => item.in || item.out || item.team);
  }


  function renderSubstitution(item) {
    return `<div class="event-row"><span>🔁 ${escapeHtml(item.in || 'Ind')} ind / ${escapeHtml(item.out || 'Ud')} ud${item.team ? ` · ${escapeHtml(item.team)}` : ''}</span><small>${escapeHtml(item.minute)}</small></div>`;
  }

  function formatMinute(value) {
    return value !== undefined && value !== null && value !== '' ? `${value}'` : '';
  }

  function statusLabel(status) {
    const map = { NS: 'Ikke startet', TBD: 'Ikke fastlagt', '1H': '1. halvleg', HT: 'Pause', '2H': '2. halvleg', ET: 'Forlænget', BT: 'Pause i forlænget', P: 'Straffespark', FT: 'Slut', AET: 'Slut efter forlænget', PEN: 'Slut efter straffe', PST: 'Udsat', CANC: 'Aflyst', SCHEDULED: 'Planlagt', TIMED: 'Fastlagt', LIVE: 'Live', IN_PLAY: 'Spilles', PAUSED: 'Pause', FINISHED: 'Slut', 'Match Finished': 'Slut', POSTPONED: 'Udsat', SUSPENDED: 'Afbrudt', CANCELLED: 'Aflyst' };
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


  async function testKickoffConnection() {
    try {
      toast('Tester KickoffAPI…');
      const fixtures = await kickoffGet('fixtures', { league: KICKOFF_LEAGUE, season: KICKOFF_SEASON });
      const finished = fixtures.filter(f => ['FT','AET','PEN'].includes(f.fixture?.status?.short || f.statusShort || f.status)).length;
      state.error = `KickoffAPI-test OK. Fandt ${fixtures.length} VM-kampe for season=${KICKOFF_SEASON}${finished ? `, heraf ${finished} færdige` : ''}.`;
      render();
      toast('KickoffAPI-test OK.');
    } catch (error) {
      state.error = `KickoffAPI-test fejlede: ${error.message}`;
      render();
      toast('KickoffAPI-test fejlede. Se Data-kortet.');
    }
  }


  function renderApiDiagnostics() {
    const meta = readRequestMeta();
    const todayCalls = readRequestTimestamps().filter(ts => Date.now() - ts < 24 * 60 * 60 * 1000).length;
    const minuteCalls = readRequestTimestamps().filter(ts => Date.now() - ts < 60 * 1000).length;
    const usingDefault = getKickoffKey() === DEFAULT_KICKOFF_KEY;
    return `
      <div class="data-note" style="margin-top:10px">
        API-kald lokalt: ${minuteCalls}/8 sidste minut · ${todayCalls}/90 sidste døgn.<br>
        Nøgle: ${usingDefault ? 'indbygget KickoffAPI nøgle' : 'gemt i browseren'}.
        ${meta.requestsAvailableMinute !== undefined ? `<br>API header: ${escapeHtml(String(meta.requestsAvailableMinute))} kald tilbage i minut.` : ''}
      </div>
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
        <div class="source-box">${state.dataSource.includes('KickoffAPI') ? DATA_URL : OPENFOOTBALL_URL}</div>
        ${renderApiDiagnostics()}
        <p style="margin-top:10px">KickoffAPI bruges som primær kilde. Appen henter kampoversigt sjældent og henter først events, kort, statistik og opstillinger, når du åbner en kamp.</p>
        <div class="api-key-box">
          <label for="kickoffKey">KickoffAPI nøgle</label>
          <input id="kickoffKey" type="password" placeholder="KickoffAPI key" value="${escapeAttr(getKickoffKey())}">
          <button type="button" class="link-button" data-save-kickoff-key>Gem nøgle</button>
          <button type="button" class="link-button" data-test-kickoff>Test KickoffAPI</button>
          <button type="button" class="link-button" data-reset-api-cache>Ryd cache og hent igen</button>
        </div>
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

  /* --- v9 UI override: mobile facts timeline + standing lineups --- */
  function renderMatchDetails(match, loadingExtra = false) {
    const goals1 = extractGoals(match, 1);
    const goals2 = extractGoals(match, 2);
    const bookings = extractBookings(match);
    const substitutions = extractSubstitutions(match);
    const teamStats = extractTeamStatistics(match);
    const lineups = extractLineups(match);
    const fields = extractAvailableMatchFields(match).filter(item => !['Resultat', 'Runde', 'Gruppe'].includes(item.label));
    const displayScore = displayScoreFor(match);
    const facts = buildMatchFacts(match, goals1, goals2, bookings, substitutions);
    const matchKey = safeDomId(match.id || match.num || 'kamp');

    return `
      <section class="match-modal match-modal-mobile" role="dialog" aria-modal="true" aria-label="Kampdetaljer">
        <button type="button" class="modal-close mobile-close" data-close-modal aria-label="Luk">←</button>

        <header class="mobile-match-header">
          <div class="mobile-score-line">
            <span class="mobile-flag">${flag(match.team1)}</span>
            <strong>${displayScore ? escapeHtml(displayScore.a) : '–'}</strong>
            <small>${escapeHtml(match.apiStatus ? statusLabel(match.apiStatus) : match.statusDa || '')}</small>
            <strong>${displayScore ? escapeHtml(displayScore.b) : '–'}</strong>
            <span class="mobile-flag">${flag(match.team2)}</span>
          </div>
          <div class="mobile-team-line">
            <span>${escapeHtml(match.team1 || 'TBD')}</span>
            <span>${escapeHtml(match.team2 || 'TBD')}</span>
          </div>
          <div class="mobile-match-subline">
            <span>${escapeHtml(match.roundDa || match.groupDa || 'VM 2026')}</span>
            ${match.ground ? `<span>· ${escapeHtml(match.ground)}</span>` : ''}
          </div>
        </header>

        <nav class="detail-tabbar" aria-label="Kampdetaljer">
          <a class="active" href="#facts-${matchKey}">Fakta</a>
          ${lineups.length ? `<a href="#lineups-${matchKey}">Startopstilling</a>` : ''}
          ${teamStats.length ? `<a href="#stats-${matchKey}">Statistik</a>` : ''}
          ${fields.length ? `<a href="#info-${matchKey}">Info</a>` : ''}
        </nav>

        ${loadingExtra ? '<p class="data-note mobile-note">Henter ekstra kampdata fra KickoffAPI…</p>' : ''}
        ${Array.isArray(match.rawDetail?.extraErrors) && match.rawDetail.extraErrors.length ? `<p class="data-note mobile-note">Noget ekstra data manglede fra KickoffAPI: ${escapeHtml(match.rawDetail.extraErrors.join(' · '))}</p>` : ''}

        <section id="facts-${matchKey}" class="mobile-detail-section">
          <div class="mobile-section-title"><h3>Fakta</h3><p>Kampforløb i kronologisk rækkefølge</p></div>
          ${facts.length ? renderFactTimeline(match, facts) : emptyMobilePanel('Ingen kampforløb endnu', 'Når KickoffAPI sender mål, kort og udskiftninger, vises de her.')}
        </section>

        ${lineups.length ? `
          <section id="lineups-${matchKey}" class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Startopstilling</h3><p>Stående banevisning som i en kamp-app</p></div>
            ${renderStandingLineups(lineups, match)}
          </section>
        ` : ''}

        ${teamStats.length ? `
          <section id="stats-${matchKey}" class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Statistik</h3><p>Kun statistik som findes i datakilden</p></div>
            <div class="stats-table mobile-card-panel">${renderTeamStatistics(teamStats)}</div>
          </section>
        ` : ''}

        ${fields.length ? `
          <section id="info-${matchKey}" class="mobile-detail-section">
            <div class="mobile-section-title"><h3>Kampinfo</h3><p>Øvrige registrerede oplysninger</p></div>
            <div class="detail-grid mobile-info-grid">${fields.map(renderDetailBox).join('')}</div>
          </section>
        ` : ''}
      </section>
    `;
  }

  function safeDomId(value = '') {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function emptyMobilePanel(title, text) {
    return `<div class="mobile-card-panel empty-mobile-panel"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
  }

  function buildMatchFacts(match, goals1, goals2, bookings, substitutions) {
    const events = [];
    goals1.forEach(goal => events.push({ kind: 'goal', side: 'home', team: match.team1, ...goalInfo(goal) }));
    goals2.forEach(goal => events.push({ kind: 'goal', side: 'away', team: match.team2, ...goalInfo(goal) }));
    bookings.forEach(item => events.push({
      kind: 'card',
      side: sideFromTeam(match, item.teamId, item.team),
      team: item.team,
      minute: item.minute || '',
      minuteValue: minuteNumber(item.minute),
      player: item.player || 'Ukendt',
      label: item.label || cardLabel(item.card || '')
    }));
    substitutions.forEach(item => events.push({
      kind: 'sub',
      side: sideFromTeam(match, item.teamId, item.team),
      team: item.team,
      minute: item.minute || '',
      minuteValue: minuteNumber(item.minute),
      in: item.in || 'Ind',
      out: item.out || 'Ud'
    }));

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
    return {
      minute: parsed.minute,
      minuteValue: minuteNumber(parsed.minute),
      player: goal.name || 'Ukendt',
      note: parsed.note
    };
  }

  function splitMinuteAndNote(value = '') {
    const parts = String(value).split('·').map(part => part.trim()).filter(Boolean);
    return { minute: parts[0] || '', note: parts.slice(1).join(' · ') };
  }

  function minuteNumber(value = '') {
    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : 999;
  }

  function sideFromTeam(match, teamId, teamName) {
    if (teamId && match.team1Id && String(teamId) === String(match.team1Id)) return 'home';
    if (teamId && match.team2Id && String(teamId) === String(match.team2Id)) return 'away';
    if (teamName && normalizeName(teamName) === normalizeName(match.team1)) return 'home';
    if (teamName && normalizeName(teamName) === normalizeName(match.team2)) return 'away';
    return 'neutral';
  }

  function renderFactTimeline(match, facts) {
    return `
      <div class="facts-card">
        ${facts.map(item => renderFactRow(match, item)).join('')}
      </div>
    `;
  }

  function renderFactRow(match, item) {
    const side = item.side === 'away' ? 'away' : item.side === 'home' ? 'home' : 'neutral';
    const minute = item.minute ? escapeHtml(item.minute) : '';
    return `
      <div class="fact-row ${side}">
        <div class="fact-minute">${minute}</div>
        <div class="fact-body">
          ${renderFactBody(match, item)}
        </div>
      </div>
    `;
  }

  function renderFactBody(match, item) {
    if (item.kind === 'goal') {
      return `
        <div class="fact-main"><span class="fact-icon">⚽</span><strong>${escapeHtml(item.player)}</strong>${item.score ? ` <em>(${escapeHtml(item.score)})</em>` : ''}</div>
        ${item.note ? `<div class="fact-sub">${escapeHtml(item.note)}</div>` : ''}
      `;
    }
    if (item.kind === 'sub') {
      return `
        <div class="sub-lines">
          <span class="sub-in">↗ ${escapeHtml(item.in)}</span>
          <span class="sub-out">↙ ${escapeHtml(item.out)}</span>
        </div>
      `;
    }
    if (item.kind === 'card') {
      const cardIcon = String(item.label || '').toLowerCase().includes('rød') ? '🟥' : '🟨';
      return `<div class="fact-main"><span class="fact-icon">${cardIcon}</span><strong>${escapeHtml(item.player)}</strong><small>${escapeHtml(item.label || '')}</small></div>`;
    }
    return `<div class="fact-main"><strong>${escapeHtml(item.label || 'Event')}</strong></div>`;
  }

  function renderStandingLineups(lineups, match) {
    const home = pickLineup(lineups, match.team1, match.team1Id) || lineups[0];
    const away = pickLineup(lineups, match.team2, match.team2Id) || lineups.find(l => l !== home) || lineups[1];
    return `
      <div class="standing-lineups">
        ${home ? renderStandingLineup(home, 'home') : ''}
        ${away ? renderStandingLineup(away, 'away') : ''}
      </div>
    `;
  }

  function renderStandingLineup(lineup, side) {
    const rows = buildLineupRows(lineup);
    return `
      <article class="standing-lineup-card ${side}">
        <header class="standing-lineup-head">
          <strong>${flag(lineup.team)} ${escapeHtml(lineup.team)}</strong>
          ${lineup.formation ? `<span>${escapeHtml(lineup.formation)}</span>` : ''}
        </header>
        <div class="standing-pitch">
          <div class="standing-pitch-lines"></div>
          ${rows.map((row, rowIndex) => renderStandingRow(row, rowIndex, rows.length)).join('')}
        </div>
        ${lineup.coach ? `<p class="lineup-coach"><strong>Træner:</strong> ${escapeHtml(lineup.coach)}</p>` : ''}
        ${lineup.substitutes.length ? `
          <details class="standing-bench">
            <summary>Bænk (${lineup.substitutes.length})</summary>
            <div>${lineup.substitutes.map(player => `<span>${player.number ? `<strong>${escapeHtml(player.number)}</strong> ` : ''}${escapeHtml(player.name)}</span>`).join('')}</div>
          </details>
        ` : ''}
      </article>
    `;
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
      return Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([, rowPlayers]) => rowPlayers.sort((a, b) => (a.gridCol || 0) - (b.gridCol || 0)));
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
    return `
      <div class="standing-player" style="left:${x}%; top:${y}%" title="${escapeAttr(player.name)}">
        <div class="player-avatar">
          ${player.photo ? `<img src="${escapeAttr(player.photo)}" alt="">` : `<span>${escapeHtml(player.number || '•')}</span>`}
        </div>
        <div class="player-name">${escapeHtml(shortPlayerName(player.name))}</div>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
      </div>
    `;
  }

  function pickLineup(lineups, teamName, teamId) {
    return lineups.find(l => normalizeName(l.team) === normalizeName(teamName) || (teamId && String(l.teamId) === String(teamId)));
  }

  function shortPlayerName(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return name;
    const last = parts.at(-1);
    const first = parts[0]?.[0] ? `${parts[0][0]}.` : '';
    return `${first} ${last}`.trim();
  }

})();
