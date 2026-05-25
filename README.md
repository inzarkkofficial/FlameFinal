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

## Deployment Configuration

The Vercel deployment includes the REST API handler in `api/[...path].js`. For normal login, Feed, Discover, and account API calls, route the frontend to its same-origin Vercel API so it does not depend on a sleeping Render web service.

Set these values in Vercel for Production and Preview:

```env
VITE_API_URL=/api
VITE_SOCKET_URL=https://your-render-service.onrender.com
VITE_REALTIME_ENABLED=false
```

Vercel API/serverless environment variables:

```env
FLAME_DATASTORE=mongo
MONGODB_URI=mongodb+srv://...
MONGODB_DB=flame
```

Render persistent realtime service environment variables:

```env
FLAME_DATASTORE=mongo
MONGODB_URI=mongodb+srv://...
MONGODB_DB=flame
CORS_ORIGINS=https://flamedating.vercel.app,https://your-preview-domain.vercel.app
FRONTEND_URL=https://flamedating.vercel.app
```

`JWT_SECRET` is not required by the current backend because authentication uses opaque, random session tokens stored in MongoDB. Cloudinary variables are not required until media storage is moved away from bounded inline persistence.

Render must remain active only for Socket.IO realtime updates and call signaling configured through `VITE_SOCKET_URL`; ordinary Vercel API requests continue through `/api`. Set `VITE_REALTIME_ENABLED=true` after the persistent realtime service is active again.

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
