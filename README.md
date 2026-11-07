# Mehmet IPA

Mehmet IPA is an iOS IPA signing platform with a browser-based local signing workflow and an account portal.

## Current architecture

- React + Vite frontend.
- Local IPA signing using zsign compiled to WebAssembly in a browser worker.
- Member login, administrator-managed accounts, and device registry through Cloudflare Pages Functions.
- Cloudflare D1 for account and signing metadata.
- Private Cloudflare R2 storage reserved for administrator-managed signing assets.
- No member IPA files are intended to be retained on the server.

## Development

```bash
npm install
npm run dev
npm run build
```

## Deployment

The production site is hosted on Cloudflare Pages:

https://mehmetipa-signer.pages.dev

Configure the Pages bindings and secrets using `docs/MEHMET-IPA-SETUP-TR.md`. Never commit certificates, private keys, passwords, API tokens, or real IPA files.

## Signing status

The existing browser-based signing flow processes the member's IPA and personal certificate locally in the browser. The separate VIP/server-side signing workflow is not considered operational until its upload, encryption, signing engine, and end-to-end tests have all passed.

## Licensing and notices

This repository contains modified and combined open-source components. The upstream MIT copyright and license notice in [LICENSE](LICENSE) is retained as required. Third-party notices and component-specific licenses remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), `licenses/`, `vendor/zsign/LICENSE`, and the relevant source directories. Do not remove or rewrite third-party copyright notices.

The WebAssembly signing engine is based on [zsign](https://github.com/zhlynn/zsign). Other dependencies retain their respective licenses.
