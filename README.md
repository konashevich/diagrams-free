# diagrams.free

**diagrams.free** — hand-drawn diagrams in your browser.

Live site (in progress): **[https://diagrams.free](https://diagrams.free)**  
Staging on GitHub Pages: **[https://konashevich.github.io/excalidraw-save/](https://konashevich.github.io/excalidraw-save/)**

This repository ([konashevich/excalidraw-save](https://github.com/konashevich/excalidraw-save)) is a fork of [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT License). See [NOTICE](./NOTICE) for attribution.

- **Branding & IP clearance:** [docs/diagrams-free-branding-and-ip-clearance.md](./docs/diagrams-free-branding-and-ip-clearance.md)
- **Scene vault design:** [docs/scene-vault-design.md](./docs/scene-vault-design.md)
- **Feature flag:** `VITE_APP_SCENE_VAULT=true`

## excalidraw-save (this fork)

This fork adds **local, browser-only multi-canvas storage** (“scene vault”) so reset/new does not permanently lose drawings.

Upstream development docs: [Excalidraw Development Guide](https://docs.excalidraw.com/docs/introduction/development).

### Hosting

Pushes to `master` deploy automatically via [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml). Details: [docs/github-pages-hosting.md](docs/github-pages-hosting.md).

Production builds use **diagrams.free** branding and disable official Excalidraw cloud backends (see `.env.production`). Drawings stay in your browser (IndexedDB / localStorage) unless you explicitly export them.

### Development (excalidraw-save)

```bash
yarn install
yarn start
```

If `yarn install` fails with `ENOSPC` (full disk on `/tmp` or home), use a writable temp and cache directory:

```bash
mkdir -p /path/to/writable/tmp
TMPDIR=/path/to/writable/tmp YARN_CACHE_FOLDER=/path/to/writable/.yarn-cache yarn install
```

Open the URL printed by Vite (default port from `VITE_APP_PORT` in `.env.development`, often `3001`).

To work on the scene vault while it is being implemented, enable the flag in `.env.development.local` (not committed):

```bash
VITE_APP_SCENE_VAULT=true
```

When the flag is `false`, the app behaves like upstream Excalidraw.

### How scene vault storage works

When `VITE_APP_SCENE_VAULT=true`:

- The **active canvas** still autosaves to browser `localStorage` (same as upstream) for fast reload and tab sync.
- **My scenes** stores additional named snapshots in **IndexedDB** on your device only.
- **New canvas** archives the current drawing into the vault, then clears the editor.
- **My scenes** dialog: Open, Rename, Duplicate, Delete, Download, and **Import file** (adds `.excalidraw` to the vault without replacing the active canvas).
- Nothing is uploaded unless you explicitly export or use a sync feature you enable.

## Features (from Excalidraw)

- 💯&nbsp;Free & open-source.
- 🎨&nbsp;Infinite, canvas-based whiteboard.
- ✍️&nbsp;Hand-drawn like style.
- 🌓&nbsp;Dark mode.
- 🏗️&nbsp;Customizable.
- 📷&nbsp;Image support.
- 😀&nbsp;Shape libraries support.
- 🌐&nbsp;Localization (i18n) support.
- 🖼️&nbsp;Export to PNG, SVG & clipboard.
- 💾&nbsp;Open format - export drawings as an `.excalidraw` json file.
- ⚒️&nbsp;Wide range of tools - rectangle, circle, diamond, arrow, line, free-draw, eraser...
- ➡️&nbsp;Arrow-binding & labeled arrows.
- 🔙&nbsp;Undo / Redo.
- 🔍&nbsp;Zoom and panning support.

## Excalidraw.com

The app hosted at [excalidraw.com](https://excalidraw.com) is a minimal showcase of what you can build with Excalidraw. Its [source code](https://github.com/excalidraw/excalidraw/tree/master/excalidraw-app) is part of this repository as well, and the app features:

- 📡&nbsp;PWA support (works offline).
- 🤼&nbsp;Real-time collaboration.
- 🔒&nbsp;End-to-end encryption.
- 💾&nbsp;Local-first support (autosaves to the browser).
- 🔗&nbsp;Shareable links (export to a readonly link you can share with others).

We'll be adding these features as drop-in plugins for the npm package in the future.

## Quick start

**Note:** following instructions are for installing the Excalidraw [npm package](https://www.npmjs.com/package/@excalidraw/excalidraw) when integrating Excalidraw into your own app. To run the repository locally for development, please refer to our [Development Guide](https://docs.excalidraw.com/docs/introduction/development).

Use `npm` or `yarn` to install the package.

```bash
npm install react react-dom @excalidraw/excalidraw
# or
yarn add react react-dom @excalidraw/excalidraw
```

Check out our [documentation](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation) for more details!

## Contributing

- Missing something or found a bug? [Report here](https://github.com/excalidraw/excalidraw/issues).
- Want to contribute? Check out our [contribution guide](https://docs.excalidraw.com/docs/introduction/contributing) or let us know on [Discord](https://discord.gg/UexuTaE).
- Want to help with translations? See the [translation guide](https://docs.excalidraw.com/docs/introduction/contributing#translating).

## Integrations

- [VScode extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor)
- [npm package](https://www.npmjs.com/package/@excalidraw/excalidraw)

## Who's integrating Excalidraw

[Google Cloud](https://googlecloudcheatsheet.withgoogle.com/architecture) • [Meta](https://meta.com/) • [CodeSandbox](https://codesandbox.io/) • [Obsidian Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) • [Replit](https://replit.com/) • [Slite](https://slite.com/) • [Notion](https://notion.so/) • [HackerRank](https://www.hackerrank.com/) • and many others

## Sponsors & support

If you like the project, you can become a sponsor at [Open Collective](https://opencollective.com/excalidraw) or use [Excalidraw+](https://plus.excalidraw.com/).

## Thank you for supporting Excalidraw

[<img src="https://opencollective.com/excalidraw/tiers/sponsors/0/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/0/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/1/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/1/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/2/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/2/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/3/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/3/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/4/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/4/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/5/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/5/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/6/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/6/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/7/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/7/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/8/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/8/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/9/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/9/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/10/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/10/website)

<a href="https://opencollective.com/excalidraw#category-CONTRIBUTE" target="_blank"><img src="https://opencollective.com/excalidraw/tiers/backers.svg?avatarHeight=32"/></a>

Last but not least, we're thankful to these companies for offering their services for free:

[![Vercel](./.github/assets/vercel.svg)](https://vercel.com) [![Sentry](./.github/assets/sentry.svg)](https://sentry.io) [![Crowdin](./.github/assets/crowdin.svg)](https://crowdin.com)
