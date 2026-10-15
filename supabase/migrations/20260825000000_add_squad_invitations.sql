-- Squad Invitations table for persistent invite tracking
CREATE TABLE IF NOT EXISTS public.squad_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX idx_squad_invitations_receiver ON public.squad_invitations(receiver_id, status);
CREATE INDEX idx_squad_invitations_sender ON public.squad_invitations(sender_id, status);
CREATE INDEX idx_squad_invitations_party ON public.squad_invitations(party_id);

-- Enable RLS
ALTER TABLE public.squad_invitations ENABLE ROW LEVEL SECURITY;

-- Users can read invitations they sent or received
CREATE POLICY "Users can view own invitations" ON public.squad_invitations
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can insert invitations they send
CREATE POLICY "Users can send invitations" ON public.squad_invitations
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Users can update invitations they sent or received
CREATE POLICY "Users can update own invitations" ON public.squad_invitations
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can delete invitations they sent
CREATE POLICY "Users can delete own invitations" ON public.squad_invitations
  FOR DELETE USING (auth.uid() = sender_id);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_invitations;
