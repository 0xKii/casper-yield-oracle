# CVO Dashboard (frontend)

A zero-dependency, single-page dashboard for the Casper Verifiable Yield Oracle.
It renders the **on-chain attestation feed** — every row links to its real
Casper transaction on `testnet.cspr.live`, so anyone can verify the exact APY,
risk, confidence and rationale the AI agent stored on-chain.

![dashboard](../docs/assets/dashboard.png)

## How it works

- The autonomous agent (`../agent`) writes every successful on-chain `publish`
  into `ledger.json` (tx hash + explorer link + scored values).
- `index.html` fetches `ledger.json` and renders the feed + summary stats,
  auto-refreshing every 15s.
- No build step, no framework. Host the folder on any static server
  (GitHub Pages, Netlify, `python3 -m http.server`, etc.).

## Run locally

```bash
# from the project root, after the agent has published at least once:
cd frontend
python3 -m http.server 8899
# open http://127.0.0.1:8899
```

The committed `ledger.json` already contains real testnet attestations, so the
dashboard shows live verifiable data out of the box.
