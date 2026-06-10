# VM 2026 – Kampe & resultater

Statisk PWA/webapp til VM 2026 i Canada, Mexico og USA.

## Hvad den gør

- Henter kampprogram/resultater fra OpenFootball `worldcup.json`
- Kræver ingen API-nøgle
- Viser tider i dansk tid
- Har overblik, kampe, grupper, slutspil og favoritter
- Kan installeres på telefon som PWA
- Gemmer seneste hentede data lokalt som cache

## Vigtigt

Dette er ikke livescore. Resultater vises først, når den åbne datakilde bliver opdateret.

## Upload til GitHub Pages

1. Pak zip-filen ud.
2. Upload alle filerne til et GitHub repository.
3. Gå til Settings → Pages.
4. Vælg branch `main` og root-folder.
5. Åbn GitHub Pages-linket på mobilen.
6. Tilføj siden til hjemmeskærmen.

## Datakilde

https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
