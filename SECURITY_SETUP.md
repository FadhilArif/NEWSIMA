# NEWSIMA Security & Deployment

The application is fail-closed: there is no demo login and an arbitrary email cannot open the application.

## Browser configuration

`config.js` contains only the public Supabase URL and publishable/anon key.

Never put a Supabase secret/service-role key in browser code.

## Authentication

Browser login calls the `secure-login` Edge Function.

The function:
- rate-limits by IP and normalized email;
- verifies credentials with Supabase Auth;
- resets the counters after successful authentication;
- returns only the user session tokens.

There is no direct browser `signUp()` flow and no client-side fake login.

## Rate limiting

The production limiter is server-side:

- IP: 5 failed attempts / 15 minutes
- normalized email: 5 failed attempts / 15 minutes

Both limits must allow the request.

## Roles

The live SIMAWA schema uses:

- `admin`
- `wakil_rektor`
- `pembimbing`
- `staf_keuangan`
- `mahasiswa`

Frontend visibility is only convenience. Authorization is enforced with PostgreSQL RLS.

## Account creation

Administrators create accounts through `admin-create-user`.

Each new account receives:
- a random temporary password;
- `wajib_ganti_sandi = true`;
- the selected role;
- optional organization + position membership.

The password completion step is handled by the authenticated `complete-password-change` Edge Function.

## Data isolation

RLS protects profiles, organizations and periods, memberships, proker and collaborators, documents and approvals, meetings, budgets and payouts, notifications, and audit logs.

Legacy public policies that caused recursive `proker` evaluation were removed.

## Notifications and audit

Server-side database triggers create notifications for new proker, collaboration invitations, and proposal decisions.
Audit triggers record important insert/update/delete actions in `jejak_audit`.

## Profile photos

The `avatars` Storage bucket is public-read, while writes are restricted to the authenticated user's own UUID folder.

## Remaining Supabase dashboard recommendation

Supabase Security Advisor currently has one remaining warning: **Leaked Password Protection is disabled**.

Enable it under the Supabase Auth password-security settings to reject passwords found in known compromised-password datasets.

This is an Auth dashboard setting, not an RLS/database migration.

## Migration note

The production project has already received the security hardening directly through Supabase migrations. The GitHub migration directory is kept for reproducibility, but its historical migration names do not exactly match the production migration history. Do not blindly run `supabase db push` against production without reconciling the migration history first.