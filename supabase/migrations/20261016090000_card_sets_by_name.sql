-- The set codes behind the set names a store's inventory export uses.
--
-- The founder: make the singles upload "read all games already on the
-- site". One Piece and Flesh and Blood print numbers that name a card on
-- their own (OP01-016, WTR001). Magic, Pokémon, Lorcana and Riftbound
-- print a number that only means something inside its set ("123" in
-- Modern Horizons 3), and the export names the set in words. The
-- catalogue keys those cards as SETCODE-NUMBER and keeps each printing's
-- set_code beside its set_name, so this returns the codes whose name
-- matches, compared as lowercase letters and digits only ("SV07: Stellar
-- Crown" is sent as both "sv07stellarcrown" and "stellarcrown").
--
-- Distinct over the printings of one game: a store's export names a few
-- hundred sets at most, and this runs once per upload.

create or replace function public.card_sets_by_name(p_game text, p_names text[])
returns table (set_code text, set_name text)
language sql
stable
set search_path = public
as $$
  select distinct p.set_code, p.set_name
  from public.card_printings p
  join public.cards c on c.id = p.card_id
  where c.game = p_game
    and p.set_code is not null
    and p.set_name is not null
    and regexp_replace(lower(p.set_name), '[^a-z0-9]', '', 'g') = any (p_names);
$$;

-- The upload runs with the service role; nobody else needs it.
revoke all on function public.card_sets_by_name(text, text[]) from public, anon, authenticated;
grant execute on function public.card_sets_by_name(text, text[]) to service_role;
