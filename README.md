# VM 2026 app – KickoffAPI v11

Rettet udgave baseret på `VM-main-kickoffapi-v10-reviewed`.

Ændringer i v11:

- `kickoffGet()` er kontrolleret og findes nu korrekt i `app.js`.
- Authentication følger KickoffAPI-dokumentationen: `x-api-key` header.
- Fixture-detaljer bruger nu de korrekte REST-stier:
  - `/api/v1/fixtures/:id/events`
  - `/api/v1/fixtures/:id/statistics`
  - `/api/v1/fixtures/:id/lineups`
- Appen behandler ikke længere et almindeligt `message`-felt som en API-fejl.
- Detalje-cache er nulstillet til v11, så gamle tomme/fejlede details ikke genbruges.
- Ekstra kampdata hentes kun for kampe hvor det giver mening, så API-budgettet ikke spildes på planlagte kampe langt ude i fremtiden.
- Opstillingsmatch på hold-id er forbedret.

Upload hele mappen til GitHub Pages.
