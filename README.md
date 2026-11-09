# Monito

A React + Vite + Tailwind CSS demo for Monito / Monita gift exchanges.

Create a room and share its code. Each friend signs in with their own account and joins using that code; joined accounts are automatically the raffle names. Every member can add and remove items on their private room wishlist. When everyone is present, the organizer opens the draw. Every account can reveal only its own recipient and that recipient's wishlist.

Authentication uses Supabase email and password accounts without sending verification emails. Sign-up calls the Vercel server function in `api/signup.js`, which creates an already-confirmed Supabase user, then the browser logs in with the supplied email and password. The email is used only as the account's login identifier. Existing sessions are restored automatically and logout ends the Supabase session.

Password recovery is supervised by a superadmin and sends no email. The superadmin resets an account from the protected user-management panel and receives a one-time temporary password to share privately with the user. After logging in with that password and the same email address, the user must choose a new password before MONITO allows access to any room.

## Deploying to Vercel

Import the Git repository in Vercel and set the project **Root Directory** to `hello`. Vercel will detect Vite; `vercel.json` also declares the production build, `dist` output, and SPA fallback.

Add these variables in **Project Settings → Environment Variables** for Production and Preview, then redeploy:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPERADMIN_EMAILS=owner@example.com
```

`VITE_SUPABASE_PUBLISHABLE_KEY` is included in the frontend bundle and protected by Row Level Security. `SUPABASE_SECRET_KEY` is available only to Vercel server functions; never prefix it with `VITE_`, commit it, or return it to the browser. `SUPERADMIN_EMAILS` is a comma-separated allowlist and must also remain server-only. Sign up or create the superadmin account using the same email, set this variable, and redeploy. That account will then see **Superadmin** in the dashboard header. In Supabase, set **Authentication → URL Configuration → Site URL** to the final Vercel production URL.

For local sign-up and superadmin controls through `npm run dev`, add `SUPABASE_SECRET_KEY` and `SUPERADMIN_EMAILS` to the ignored `.env` file. The Vite development middleware uses them only on the local Node process; Vite exposes only variables prefixed with `VITE_` to browser code. Restart the development server after changing `.env`.

Rooms, membership, wishlists, and assignments live in Supabase. The database assigns joined members when the organizer opens the draw, prevents self-matches and duplicate recipients, and returns only the authenticated caller's recipient. Wishlist policies allow access only to the wishlist owner and their assigned gifter after that gifter reveals the draw. The UI contains no participant selector.

## Supabase setup

The repository now includes the official Supabase browser client and a secure initial schema. To connect a project:

1. Create a Supabase project.
2. Open its SQL Editor and run the migration files in filename order. Existing projects should run any newer migration files they have not applied yet.
3. Copy `.env.example` to `.env.local` and add the Project URL and **publishable** key from the project's Connect dialog.
4. Restart the Vite development server.

Never put a Supabase secret key or legacy service-role key in a `VITE_` variable. Those keys bypass Row Level Security and must stay on a trusted server. The migration enables RLS, removes anonymous table access, restricts room data to members, and exposes recipient names only through an authenticated function that returns the caller's own assignment.

`src/lib/monitoApi.js` contains the Auth and database operations used by the application.

```sh
npm install
npm run dev
```

Run `npm run build` to create the production site in `dist/`.
