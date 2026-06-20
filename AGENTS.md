# Repository Guidelines

## Project Structure & Module Organization

XFMS 2.0 is a Node.js firmware management system with an Express backend and static frontend. Backend code lives in `server/`, with `server/app.js` as the entry point and `server/init-db.js` for SQLite setup and seed data. Frontend files are under `www/`: shared JavaScript in `www/js/`, page HTML in `www/pages/`, CSS in `www/css/`, and login/index assets at the top of `www/`. Runtime data is stored in `database/` and uploaded firmware files go to `uploads/`. Release artifacts are placed in `release/`; avoid editing generated `.deb` files directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run init-db`: create or migrate `database/xfms.db` and insert default data when needed.
- `npm start`: run the production-style server from `server/app.js`.
- `npm run dev`: run the server with `nodemon` for local development.
- `bash pack.sh`: build a Debian package using production dependencies and `xfms.service`.

The service listens on `PORT` from the environment, defaulting to `3000`.

## Coding Style & Naming Conventions

Use CommonJS modules and the existing Express callback style unless a broader refactor is planned. Follow current JavaScript formatting: 4-space indentation, semicolons, single quotes, and descriptive camelCase identifiers. Keep API paths grouped in `server/app.js` by feature, and name frontend page scripts after their pages, such as `firmware-list.js` for `firmware-list.html`.

## Testing Guidelines

There is currently no dedicated test script in `package.json`. For backend changes, at minimum run `npm run init-db` against a disposable database when schema logic changes, then start the app with `npm run dev` and exercise the affected API endpoints. For frontend changes, verify login, navigation, and the changed page in a browser. If adding tests, place project tests outside `node_modules/` and add a matching `npm test` script.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit-style messages such as `feat: ...`; keep using a short type prefix like `feat:`, `fix:`, or `chore:` followed by a focused summary. Pull requests should describe the user-visible change, list manual verification steps, note database or packaging impacts, and include screenshots for UI changes. Link related issues and call out any required deployment steps.

## Security & Configuration Tips

Do not commit secrets, production databases, or uploaded firmware payloads. Treat `database/xfms.db`, `uploads/`, and generated packages as environment-specific artifacts unless intentionally releasing them. When changing authentication, upload handling, or systemd packaging, check permissions and file paths used by `pack.sh` and `xfms.service`.
