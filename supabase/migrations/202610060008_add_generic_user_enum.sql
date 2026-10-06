-- Add generic restricted application user role.
alter type public.peran_akun add value if not exists 'user';
