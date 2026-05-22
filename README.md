# Flame Project

Flame is a full-stack React + Node dating app with signup-only accounts, swipe discovery, matching, chat, profile settings, privacy controls, verification, boosts, and support tickets.

## Folder Structure

- `Frontend/` - React 18 + Vite app
- `Backend/` - Node HTTP API and MongoDB persistence

## Run Locally

```bash
npm install
npm run dev           # One website link: http://localhost:4000
```

Create an account from the Sign Up screen, then log in with that account.

`npm run dev` builds `Frontend/dist` first, then serves the website, API, and realtime chat from the backend on one port.

You can still run individual services when needed:

```bash
npm run dev:backend
npm run dev:frontend
```

## Production

```bash
npm run build
npm start       # Serves the API and the built Frontend/dist app on http://localhost:4000
```

## Backend

The backend uses Node's built-in HTTP and crypto modules, Socket.IO realtime events, and MongoDB persistence.

- Token-based sessions
- Password hashing with `scrypt`
- MongoDB persistence configured with `MONGODB_URI` and `MONGODB_DB`
- Local JSON fallback at `.flame-data/flame users/flame-users.json` when MongoDB is unavailable or `FLAME_DATASTORE=local`
- Auth, profile, privacy, verification, swipes, matches, chat, boosts, and support ticket APIs
- Mutual swipe matching, reciprocal match records, and `likesYou` discovery state
- Socket.IO realtime messaging, typing indicators, read receipts, and online presence on the same backend port
- Support ticket creation and ticket history
- Static production hosting for the Vite build

## Frontend

- React 18 + Vite
- framer-motion swipe and match animations
- API-backed state in `Frontend/src/store.js`
- The default local website, API, and `/socket.io` realtime endpoint all use `http://localhost:4000`
