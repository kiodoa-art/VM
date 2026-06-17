VM2026 KickoffAPI v13 api-restored

- KickoffAPI basisforbindelse genoprettet.
- Events, kort og lineups hentes via KickoffAPI's /fixtures/:id/events, /fixtures/:id/lineups og /fixtures/:id/statistics.
- Kun næste/relevante 5 kampe auto-opdateres.
- Dansk tid bruges i visning og gruppering.
- LocalStorage/service-worker cache er bumpet, så gamle ødelagte detaljer ikke genbruges.
