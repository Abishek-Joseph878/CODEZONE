-- Migration: Squad System & Atomic Matchmaking RPC
-- Adds squad code/name to parties, direct join capability, and atomic squad vs squad matchmaking.

-- 1. Add squad metadata columns to parties
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Squad';
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS code TEXT;

-- Create index for quick code lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_code ON public.parties(UPPER(code)) WHERE code IS NOT NULL;

-- 2. Ensure RLS on parties allows finding queuing parties
DROP POLICY IF EXISTS "Party members can view their party" ON public.parties;
CREATE POLICY "Party members can view their party" 
ON public.parties FOR SELECT USING (
  leader_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.party_members WHERE party_id = id AND user_id = auth.uid()) OR
  status = 'queuing' OR
  status = 'forming'
);

-- Ensure RLS on party_members allows viewing members of queuing parties
DROP POLICY IF EXISTS "Party members can view members" ON public.party_members;
CREATE POLICY "Party members can view members" 
ON public.party_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.parties 
    WHERE id = party_id 
      AND (
        leader_id = auth.uid() OR 
        status = 'queuing' OR
        EXISTS (SELECT 1 FROM public.party_members pm WHERE pm.party_id = party_id AND pm.user_id = auth.uid())
      )
  )
);

-- 3. Atomic Squad Matchmaking RPC
-- Finds a waiting opponent squad with identical game mode and team size,
-- locks it with FOR UPDATE SKIP LOCKED to prevent race conditions,
-- creates the match, registers all players, and marks both squads matched.
CREATE OR REPLACE FUNCTION public.find_or_create_squad_match(
  p_party_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_party RECORD;
  v_opponent_party RECORD;
  v_match_id UUID;
  v_team_a UUID[];
  v_team_b UUID[];
  v_user_id UUID;
BEGIN
  -- 1. Fetch current party
  SELECT * INTO v_my_party
  FROM public.parties
  WHERE id = p_party_id;

  IF v_my_party IS NULL THEN
    RETURN NULL;
  END IF;

  -- If already matched (e.g. opponent matched us concurrently), return the match_id
  IF v_my_party.status = 'matched' AND v_my_party.match_id IS NOT NULL THEN
    RETURN v_my_party.match_id;
  END IF;

  -- Ensure caller is the party leader and status is queuing
  IF v_my_party.status != 'queuing' THEN
    RETURN NULL;
  END IF;

  IF v_my_party.leader_id != auth.uid() THEN
    RAISE EXCEPTION 'Only party leader can initiate squad matchmaking';
  END IF;

  -- 2. Find and lock an opponent party
  SELECT *
    INTO v_opponent_party
    FROM public.parties
   WHERE status = 'queuing'
     AND id != p_party_id
     AND game_mode = v_my_party.game_mode
     AND team_size = v_my_party.team_size
     AND updated_at > now() - INTERVAL '5 minutes'
   ORDER BY updated_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  -- If no opponent party available right now, return NULL (continue queuing)
  IF v_opponent_party IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Gather member IDs
  SELECT array_agg(user_id ORDER BY joined_at ASC)
    INTO v_team_a
    FROM public.party_members
   WHERE party_id = v_my_party.id;

  SELECT array_agg(user_id ORDER BY joined_at ASC)
    INTO v_team_b
    FROM public.party_members
   WHERE party_id = v_opponent_party.id;

  -- Both squads must have at least 1 member
  IF v_team_a IS NULL OR array_length(v_team_a, 1) = 0 OR
     v_team_b IS NULL OR array_length(v_team_b, 1) = 0 THEN
    RETURN NULL;
  END IF;

  -- 4. Create the match
  INSERT INTO public.matches (
    game_mode,
    team_size,
    status,
    team_a,
    team_b,
    started_at
  ) VALUES (
    v_my_party.game_mode,
    v_my_party.team_size,
    'in_progress',
    v_team_a,
    v_team_b,
    now()
  )
  RETURNING id INTO v_match_id;

  -- 5. Insert players into match_players with status 'active'
  FOREACH v_user_id IN ARRAY v_team_a LOOP
    INSERT INTO public.match_players (match_id, user_id, team, status)
    VALUES (v_match_id, v_user_id, 'team_a', 'active')
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH v_user_id IN ARRAY v_team_b LOOP
    INSERT INTO public.match_players (match_id, user_id, team, status)
    VALUES (v_match_id, v_user_id, 'team_b', 'active')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 6. Update both parties atomically to matched
  UPDATE public.parties
     SET status = 'matched',
         match_id = v_match_id,
         updated_at = now()
   WHERE id IN (v_my_party.id, v_opponent_party.id);

  RETURN v_match_id;
END;
$$;

-- 4. Direct Join Squad By Code RPC
CREATE OR REPLACE FUNCTION public.join_party_by_code(
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_current_count INTEGER;
  v_user_id UUID := auth.uid();
  v_old_party_id UUID;
  v_old_party_leader UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find forming party by code
  SELECT * INTO v_party
    FROM public.parties
   WHERE UPPER(code) = UPPER(TRIM(p_code))
     AND status = 'forming';

  IF v_party IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Squad not found or match already started');
  END IF;

  -- Count current members
  SELECT count(*) INTO v_current_count
    FROM public.party_members
   WHERE party_id = v_party.id;

  IF v_current_count >= v_party.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Squad is full (' || v_current_count || '/' || v_party.team_size || ')');
  END IF;

  -- Check if already member
  IF EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_party.id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', true, 'party_id', v_party.id);
  END IF;

  -- Leave previous party if any
  SELECT party_id INTO v_old_party_id
    FROM public.party_members
   WHERE user_id = v_user_id
   LIMIT 1;

  IF v_old_party_id IS NOT NULL THEN
    SELECT leader_id INTO v_old_party_leader FROM public.parties WHERE id = v_old_party_id;
    DELETE FROM public.party_members WHERE party_id = v_old_party_id AND user_id = v_user_id;
    IF v_old_party_leader = v_user_id THEN
      DELETE FROM public.parties WHERE id = v_old_party_id;
    END IF;
  END IF;

  -- Join new party
  INSERT INTO public.party_members (party_id, user_id, is_ready)
  VALUES (v_party.id, v_user_id, false);

  RETURN jsonb_build_object('success', true, 'party_id', v_party.id);
END;
$$;
