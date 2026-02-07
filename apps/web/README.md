## Utvikling

```bash
# Vanlig utvikling (krever API på http://localhost:4000)
pnpm dev

# Kun frontend med mock-data (ingen backend nødvendig)
pnpm dev:mock
```

Appen er tilgjengelig på [http://localhost:3000](http://localhost:3000).

## Miljøvariabler

| Variabel                | Beskrivelse                                              |
| ----------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | URL til tRPC-backend. Brukes når mock-modus **ikke** er på. |
| `NEXT_PUBLIC_MOCK_MODE` | Sett til `true` for å bruke seed-data og mock-server lokalt/ved deploy. |

## Deploy uten backend

For eksempel på Vercel:

1. Sett `NEXT_PUBLIC_MOCK_MODE=true` i prosjektets miljøvariabler.
2. Deploy som vanlig – appen kjører da på mock-data og trenger ikke API/DB.

Ønsker du ekte backend senere, fjern variabelen og pek `NEXT_PUBLIC_API_URL` mot API-et ditt.
