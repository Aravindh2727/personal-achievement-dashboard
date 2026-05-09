# Personal Achievement Dashboard with Firebase Auto-Update

A beginner-friendly full-stack mini project that tracks personal achievements with Firebase Firestore real-time updates and multi-platform profile import.

## Features

- Real-time dashboard updates using Firestore `onSnapshot`
- Add achievement manually from UI form
- Import from links (backend importer API):
  - LeetCode profile URL
  - HackerRank profile URL
  - LinkedIn profile URL (profile reference entry)
  - Any public JSON URL returning achievement objects
- Dynamic dashboard stats, list, filters, and Chart.js charts
- Responsive, portfolio-style UI

## Tech Stack

- HTML5, CSS3, JavaScript
- Firebase Firestore
- Node.js + Express (local dev) / Netlify Functions (production)

## Files

```text
personal-achievement-dashboard/
|-- index.html
|-- style.css
|-- script.js
|-- server.js
|-- package.json
`-- README.md
```

## Firestore Collection Format

Collection name: `achievements`

Each document:
- `type` (string): `Certificate` / `LeetCode` / `Project`
- `title` (string)
- `count` (number)
- `link` (string URL)

## Setup

1. Install backend dependencies:

```bash
npm install
```

2. Start importer backend:

```bash
npm start
```

For local dev backend runs at `http://localhost:3000`. On Netlify it runs as `/.netlify/functions/import`.

3. Open frontend with Live Server (`index.html`).

4. Paste any supported URL in **Import from Link** and click import.

## Admin Login (Firebase Auth)

1. Enable **Email/Password** in Firebase Console:
   - Authentication -> Sign-in method -> Email/Password -> Enable
2. Create an admin user in Firebase Authentication.
3. Open `admin.js` and add your admin email in `ALLOWED_ADMIN_EMAILS`.
4. Open `admin.html` and log in.

## Supported Import Behavior

- **LeetCode**: Fetches solved count from GraphQL and creates a `LeetCode` record.
- **HackerRank**: Adds a profile tracking record.
- **LinkedIn**: Adds a profile tracking record (LinkedIn blocks public scraping/API without OAuth app setup).
- **Other URLs**: Treated as JSON source and imported if JSON contains valid fields (`type`, `title`, `count`, `link`).

## Notes

- Browser CORS restrictions are handled by backend (`server.js`).
- Keep Firestore rules suitable for your use case (read/write during development, lock down for production).
