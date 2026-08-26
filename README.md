# D&D Magic Item Generator

A full stack web app that generates randomized (or customized) magic weapons and armor for Dungeons & Dragons 5th Edition. User accounts support saving, editing, and sharing generated items.

**[Live demo →](https://dnd-magic-item-generator.onrender.com)**
**[Repository →](https://github.com/s-AustinAvery/dnd-magic-item-gen)**

> Note: this is hosted on Render's free tier, so the first load after a period of inactivity may take a moment while the server wakes up.

<!-- going to add an image or something here -->

## Overview

Base weapon and armor data comes from the [D&D 5e SRD API](https://www.dnd5eapi.co/). 'Affixes' are stored in a MySQL database, and can be combined onto a base item either at random or with user control over each slot. Generated items can be saved to a personal collection, given a custom name and flavor text, and shared with anyone via a unique link.

## Features

- **Server authoritative generation and saving** - The client only ever sends the user's selections to the server which then resolves the base item, pulls affixes from the database, and runs the actual generation logic itself. Nothing the browser computes is trusted for what gets saved, so there's no way to tamper with a save by editing client side state
- **Minimal client side data exposure** - The browser never sees an affix's mechanical properties, only the `{ id, display_name }` pair needed to populate a dropdown. The full generation engine never loads in the browser due to being server only
- **Weighted random generation** - Fully random items are guaranteed at least one affix. Each affix slot can also be independently forced to a specific option, forced random, forced to none, or left to its own chance to appear
- **Rarity system** - Items are colored and labeled based on how many affixes they have
- **User accounts** - Registration and login with hashed passwords and session based authentication
- **Personal item collection** - Save generated items, edit their name and add custom flavor text, delete them, or share a public view only link
- **Server side caching** - Repeated requests for the same weapon/armor data don't keep accessing the external API
## Tech Stack

- **Backend:** Node.js, Express, MySQL (`mysql2`)
- **Views:** EJS
- **Frontend:** JavaScript (no framework). The generation engine (`generatorcore.js`) runs server only so the browser only loads the small `itemDisplay.js` helpers for showing an item's rarity
- **Auth:** `express-session` with a MySQL backed session store, `bcrypt` for password hashing
- **Hosting:** Render (app) + a MySQL instance (database)

## How It Works

A few things worth pointing out if you're reading through the code:

- **`generatorcore.js` runs server only.** Nothing in any page loads it. `POST /api/generate` `require`'s it directly to actually produce every item, and that's the only place it runs. The prefix/suffix dropdowns are populated from `GET /api/affixes/options`, which does the same bundling/filtering server side and returns only `{ id, display_name }` pairs rather than the mechanical affix data itself.
- **The server doesnt trust client supplied items.** `POST /api/generate` computes the item and stashes it in the user's session. `POST /api/items/save` saves that, ignoring what's in the request body. Saving a copy of someone else's shared item works the same way.
- **`itemDisplay.js`** holds small, dependency free helpers and is used for displaying an item.

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

The full table structure is in [`schema.sql`](./schema.sql) — run it against a fresh database to create all four tables (`users`, `affixes`, `user_items`, `sessions`):

```bash
mysql -h YOUR_DB_HOST -u YOUR_DB_USER -p YOUR_DB_NAME < schema.sql
```

A couple of things worth knowing about the schema:

- **`sessions`** is created and managed automatically by `express-mysql-session`. it's included in `schema.sql` but you don't need to do anything with it manually.
- **`affixes.effect_category`** supports the values (`stat`, `weapon_die`, `utility`, `damage`)
- The generator won't produce any prefixes/suffixes until the `affixes` table actually has rows in it. The base item generation works fine without any, but affixes are what make items 'magic'.

### Running Locally

```bash
node index.mjs
```

Visit `http://localhost:3000`.

## Project Structure

```
├── index.mjs              # Express app, routes, DB queries
├── schema.sql              # Database table structure
├── public/
│   ├── css/style.css
│   └── js/
│       ├── generatorcore.js   # Generation engine (server-only)
│       ├── itemDisplay.js     # Display only helpers (rarity, name normalization)
│       ├── main.js            # Generator page logic
│       └── collection.js      # Collection page logic
└── views/                 # EJS templates
```

## Known Limitations

- No email verification. (Since this is a portfolio demo rather than a production app the email field is format validated only)
- No password reset or account recovery
- No automated tests yet

## Roadmap

- Unit tests for `generatorcore.js`
- 3-4 combined affix 'Epic' tier
- 'Equip' page where a user can see total stats stacked from multiple items

## Credits

- Item data via the [D&D 5e SRD API](https://www.dnd5eapi.co/)
- Not affiliated with or endorsed by Wizards of the Coast
