-- Add the two academic reviewer application roles.
-- Kept in its own migration because newly-added PostgreSQL enum values must
-- commit before another migration can use them.
alter type public.peran_akun add value if not exists 'kaprodi';
alter type public.peran_akun add value if not exists 'dekan';
