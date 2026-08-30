# DukanSaathi frontend (Next.js)

Keyboard-first POS shell. FastAPI stays at `http://localhost:8000`. This app is a client SPA: one catch-all route mounts `src/App.js` so keep-alive screens (New Bill cart, Analyst chat) survive F1–F4. Screen components live in `src/screens/` so Next does not treat them as Pages Router files.

## Scripts

```bash
npm start          # next dev  → http://localhost:3000
npm run build      # next build
npm run preview    # next start (production server)
npm test           # Jest on src/lib/**/*.test.js
```

## Environment

Copy `.env.example` to `.env`. Next inlines `NEXT_PUBLIC_*`. CRA `REACT_APP_*` names still work during cutover via `next.config.js`.

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Backend `CORS_ORIGINS` should include `http://localhost:3000`.
