## Utvikling

```bash
# Vanlig utvikling (krever API på http://localhost:4000)
pnpm dev
```

Appen er tilgjengelig på [http://localhost:3000](http://localhost:3000).

## Miljøvariabler

| Variabel                | Beskrivelse                                              |
| ----------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | URL til backend via Next-proxy eller direkte API. Standard er `/api`. |
| `MEALS_API_INTERNAL_ORIGIN` | Intern origin for Next-rewrites i Docker eller SSR. |

## Tester

```bash
# Enhetstester for logikken i lib/ (kjøres også i CI)
pnpm --filter web test
```

### Ende-til-ende-tester

Playwright-testene i `tests/` kjører mot en ekte API, web-app og database, og
er derfor ikke med i CI. De logger inn med engangskode, som leses rett fra
databasen, så e-postutsending trenger ikke å virke.

```bash
DATABASE_URL=postgresql://... \
E2E_EMAIL=<e-post på tilgangslisten, med husstand og oppskrifter> \
pnpm --filter web test:e2e -- --trace off
```

Testene genererer middager for tomme dager i inneværende uke og krysser av og
på varer i handlelisten, så bruk en utviklingsdatabase. Uten `E2E_EMAIL` og
`DATABASE_URL` hoppes de over. Sett `E2E_CHROMIUM_PATH` for å bruke en
nettleser som allerede er installert.
