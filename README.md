# D&D Magic Item Generator

A full stack web app that generates randomized (or customized) magic weapons and armor for Dungeons & Dragons 5th Edition, with user accounts to save, edit, and share generated items.

**[Live demo →](https://dnd-magic-item-generator.onrender.com)**
**[Repository →](https://github.com/s-AustinAvery/dnd-magic-item-gen)**

> Please Note: this is hosted on Render's free tier, so the first load after inactivity may take a moment while the server wakes up.

<!-- ill put a screenshot here -->

## Overview

Base weapon and armor data comes from the [D&D 5e SRD API](https://www.dnd5eapi.co/). Affixes are custom designed and stored in a MySQL database, and can be combined onto a base item to modify its properties either randomly or with control over each slot. Generated items can be saved to a personal collection, given a custom name and flavor text, and shared with anyone via a unique link.

## Features

- **Weighted random generation** — fully random items are generated with modifying affixes; each affix slot can also be independently forced to a specific value, forced random, forced to none, or left to its own 50/50 chance
- **Rarity system** — items are colored and labeled (Common/Uncommon/Rare) based on how many affixes they landed, based on the item's own data rather than stored separately
- **User accounts** — registration and login with hashed passwords and session based authentication
- **Personal item collection** — save generated items, edit their name and add custom flavor text, delete them, or share a public view only link. Other users can save a shared item to their own collection.
- **Server-side caching** of SRD API responses, so repeated requests for the same weapon/armor data don't keep hitting the external API

## Tech Stack

- **Backend:** Node.js, Express, MySQL (`mysql2`)
- **Views:** EJS
- **Frontend:** Vanilla JavaScript (no framework); the item generation logic (`generatorcore.js`) is written to run identically in the browser and on the server
- **Auth:** `express-session` with a MySQL backed session store, `bcrypt` for password hashing
- **Hosting:** Render (app) + a MySQL instance (database)

## How It Works

A few things worth pointing out if you're reading through the code:

- **`generatorcore.js` is isomorphic** — the exact same file runs in the browser (for live generation) and is `require`'d on the server (for computing an item's rarity when rendering a shared page), so there's one source of truth for the generation logic instead of two implementations that could drift apart.
- **`itemDisplay.js`** holds small, dependency-free helpers (rarity lookup, base-name normalization) used purely for *displaying* an item, split out from `generatorcore.js` so pages that only need to show a saved item don't have to load the full generation engine.
- **Affix resolution is data-driven** — prefixes and suffixes are grouped into "bundles" from raw database rows, filtered by item type and slot, then resolved according to whichever combination of forced/random/unforced state each slot is in.

## Getting Started

### Prerequisites

- Node.js
- A MySQL database

### Installation

```bash
git clone https://github.com/s-AustinAvery/dnd-magic-item-gen.git
cd dnd-magic-item-gen
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
SESSION_SECRET=some_long_random_string
PORT=3000
```

### Database Setup

You'll need three tables: `users`, `affixes`, and `user_items`. At minimum:

- **`users`** — `id`, `username` (unique), `email` (unique), `password_hash`
- **`affixes`** — `id`, `display_name`, `affix_slot` (`prefix`/`suffix`), `applies_to` (`weapon`/`armor`/`both`), `effect_category` (`stat`/`weapon_die`/`utility`/`damage`), `effect_target`, `effect_value`, `damage_mode`, `description`
- **`user_items`** — `id`, `user_id`, `item_name`, `item_data` (JSON), `item_description`, `saved_at`, `share_token`

> This project doesn't yet include a schema migration file — the tables above were built incrementally. Adding a proper `schema.sql` is on the roadmap.

The generator won't produce any prefixes/suffixes until the `affixes` table has rows in it — the base item generation works without any, but affixes are what make items "magic."

### Running Locally

```bash
node index.mjs
```

Visit `http://localhost:3000`.

## Project Structure

```
├── index.mjs              # Express app, routes, DB queries
├── public/
│   ├── css/style.css
│   └── js/
│       ├── generatorcore.js   # Generation engine (isomorphic - runs client + server)
│       ├── itemDisplay.js     # Display-only helpers (rarity, name normalization)
│       ├── main.js            # Generator page logic
│       └── collection.js      # Collection page logic
└── views/                 # EJS templates
```

## Known Limitations

- No email verification (as a portfolio demo rather than a production app handling real user emails the email field is format validated only)
- No password reset / account recovery flow
- No automated tests yet

## Roadmap

- Unit tests for `generatorcore.js`
- Password format restrictions
- 3-4 combined affix 'Epic' tier rarity
- User page 'equipped' items to show all stacked effects

## Credits

- Item data via the [D&D 5e SRD API](https://www.dnd5eapi.co/)
- Not affiliated with or endorsed by Wizards of the Coast

## License

MIT — see [LICENSE](./LICENSE)

