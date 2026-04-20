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
