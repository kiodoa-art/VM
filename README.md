# VM 2026 Kampcenter

Lys, mobilvenlig PWA til VM 2026 med KickoffAPI-data.

## Sådan bruger du den

1. Upload hele mappen til GitHub Pages, Netlify eller en anden statisk webhost.
2. Åbn appen.
3. Gå til **Indstillinger**.
4. Slå **Brug demo-data** fra.
5. Indsæt din KickoffAPI-nøgle.
6. Lad **League ID** være tom første gang. Appen prøver selv at finde VM 2026 via `/leagues?search=World Cup&season=2026`.
7. Tryk **Gem** og derefter **Opdatér**.

Standard-tidszone er `Europe/Copenhagen`, så kampstart vises dansk tid.

## Vigtigt om API-nøgle

En ren front-end-app kan ikke skjule en API-nøgle. Hvis appen ligger offentligt, kan nøglen læses i browserens netværkskald eller i kildekoden, hvis du hardcoder den.

Den sikreste løsning er derfor:

- Brug appens Indstillinger til lokal test.
- Brug en proxy, f.eks. Cloudflare Worker, hvis appen skal deles offentligt.
- Gem API-nøglen som environment variable i proxyen.

Se `cloudflare-worker-example.js`.

## Hvad appen henter

- `/fixtures` til kampoversigt og resultater
- `/fixtures/events` til mål, kort og udskiftninger
- `/fixtures/lineups` til opstillinger
- `/fixtures/statistics` til kampstatistik
- `/standings` til grupper
- `/teams` til hold
- `/leagues` til automatisk søgning efter league ID
- `/timezone` til API-test

## Cache og opdatering

- Appens egne filer caches af service worker.
- Kampdata caches i localStorage.
- Næste 5 ikke-færdigspillede kampe opdateres hvert 10. minut, når live-data og auto-opdatering er slået til.
- Under **Data** kan du rydde cache eller eksportere JSON.

## Filer

- `index.html` – app shell
- `app.css` – layout og lys VM-stil
- `app.js` – datahentning, routing, views og cache
- `config.js` – valgfri standardkonfiguration
- `manifest.json` – PWA-installation
- `service-worker.js` – offline app shell
- `cloudflare-worker-example.js` – proxy-eksempel


## Hardcoded API

Nøglen ligger i `config.js`, og appen starter på live-data som standard. Lokal storage-versionen er bumpet, så gamle demo-indstillinger ikke hænger fast fra tidligere builds.
