# NEWSIMA Security Setup

This repository now fails closed: the browser cannot authenticate in demo mode and no arbitrary email/password can open the application.

## 1. Configure the browser client

Edit `config.js` with the Supabase project URL and the **anon/publishable** key.

Never put a `service_role` or secret key in `config.js`.

## 2. Apply the database migration

Run:

```bash
supabase db push
```

or paste `supabase/migrations/202610060001_security_baseline.sql` into the Supabase SQL Editor.

The migration adds:
- role validation for `admin`, `pembimbing`, `staf_keuangan`, `mahasiswa`
- RLS for profiles, organizations, memberships, proker, and notifications
- protection against self-assigning an administrator role
- server-side login rate-limit storage/functions

## 3. Deploy the two Edge Functions

```bash
supabase functions deploy secure-login
supabase functions deploy admin-create-user
```

`secure-login` is intentionally public at the Edge gateway because it is the credential-verification endpoint. It applies the database rate limiter before attempting authentication.

`admin-create-user` keeps the default JWT verification and only accepts an authenticated administrator.

## 4. Login rate limit

The server-side limiter uses two keys:
- IP address: 5 attempts / 15 minutes
- normalized email: 5 attempts / 15 minutes

Both must be allowed. Successful authentication resets both counters.

## 5. Role authorization

The client hides menus that a role cannot use, but the real protection is PostgreSQL RLS. Never rely on the JavaScript role check alone.

## 6. Account creation

Administrators create accounts through `admin-create-user`. The old client-side `signUp()` flow is no longer used for account provisioning.

Each created account receives a unique temporary password and `wajib_ganti_sandi = true`.
