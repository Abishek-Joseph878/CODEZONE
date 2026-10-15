import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PartyMember {
  id: string;
  user_id: string;
  username: string;
  unique_id: string;
  is_ready: boolean;
  is_leader: boolean;
}

interface Party {
  id: string;
  leader_id: string;
  game_mode: string;
  team_size: number;
  status: 'forming' | 'queuing' | 'matched';
  match_id: string | null;
  members: PartyMember[];
  code: string | null;
  name: string;
}

// Generate a short alphanumeric squad code
function generateSquadCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface SquadInvite {
  id: string;
  party_id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  created_at: string;
  // Enriched fields
  senderUsername?: string;
  senderUniqueId?: string;
  receiverUsername?: string;
  receiverUniqueId?: string;
}

export const usePartySystem = () => {
  const { user, profile } = useAuth();
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<{ partyId: string; leaderName: string }[]>([]);
  const [squadInvites, setSquadInvites] = useState<SquadInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  // Fetch current party
  const fetchParty = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Check if user is in a party
      const { data: memberData } = await supabase
        .from('party_members')
        .select('party_id')
        .eq('user_id', user.id)
        .single();

      if (!memberData) {
        setParty(null);
        return;
      }

      // Fetch party details
      const { data: partyData } = await supabase
        .from('parties')
        .select('*')
        .eq('id', memberData.party_id)
        .single();

      if (!partyData) {
        setParty(null);
        return;
      }

      // Fetch all members
      const { data: members } = await supabase
        .from('party_members')
        .select('id, user_id, is_ready')
        .eq('party_id', partyData.id);

      if (!members) {
        setParty(null);
        return;
      }

      // Fetch profiles for members
      const memberIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, unique_id')
        .in('user_id', memberIds);

      const partyMembers: PartyMember[] = members.map(m => {
        const p = profiles?.find(pr => pr.user_id === m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          username: p?.username || 'Unknown',
          unique_id: p?.unique_id || '',
          is_ready: m.is_ready,
          is_leader: m.user_id === partyData.leader_id,
        };
      });

      setParty({
        id: partyData.id,
        leader_id: partyData.leader_id,
        game_mode: partyData.game_mode,
        team_size: partyData.team_size,
        status: partyData.status as 'forming' | 'queuing' | 'matched',
        match_id: partyData.match_id,
        members: partyMembers,
        code: (partyData as Record<string, unknown>).code as string | null,
        name: ((partyData as Record<string, unknown>).name as string) || 'Squad',
      });
    } catch (err) {
      console.error('Error fetching party:', err);
      setParty(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new party
  const createParty = useCallback(async (gameMode: string = 'duel', teamSize: number = 5) => {
    if (!user || !profile) return { error: 'Not authenticated' };

    setLoading(true);

    // Remove current membership if it exists.
    // This prevents duplicate memberships without relying on the leaveParty callback.
    await supabase
      .from('party_members')
      .delete()
      .eq('user_id', user.id);

    // Generate a unique squad code
    const squadCode = generateSquadCode();

    // Try to create party with code/name columns first; fall back without them
    // if the migration hasn't been applied yet.
    let partyData: Record<string, unknown> | null = null;
    let partyError: unknown = null;

    const baseInsert = {
      leader_id: user.id,
      game_mode: gameMode,
      team_size: teamSize,
      status: 'forming',
    };

    // Attempt 1: with code + name columns
    const res1 = await supabase
      .from('parties')
      .insert({
        ...baseInsert,
        code: squadCode,
        name: `${profile.username}'s Squad`,
      } as Record<string, unknown>)
      .select()
      .single();

    if (res1.error) {
      console.warn('[Party] Insert with code/name failed, retrying without:', res1.error.message);
      // Attempt 2: without code/name (migration not applied)
      const res2 = await supabase
        .from('parties')
        .insert(baseInsert)
        .select()
        .single();
      partyData = res2.data as Record<string, unknown> | null;
      partyError = res2.error;
    } else {
      partyData = res1.data as Record<string, unknown> | null;
    }

    if (partyError || !partyData) {
      setLoading(false);
      console.error('[Party] Failed to create party:', partyError);
      return { error: 'Failed to create party' };
    }

    // Add leader as member
    const { error: memberError } = await supabase
      .from('party_members')
      .insert({
        party_id: partyData.id,
        user_id: user.id,
        is_ready: true,
      });

    if (memberError) {
      // Cleanup party if member insert fails
      await supabase.from('parties').delete().eq('id', partyData.id);
      setLoading(false);
      return { error: 'Failed to join party' };
    }

    await fetchParty();
    setLoading(false);
    return { error: null, partyId: partyData.id };
  }, [user, profile, fetchParty]);

  // ─── Squad Invitations System ─────────────────────────────────────

  // Fetch all invitations (sent and received)
  const fetchInvites = useCallback(async () => {
    if (!user) return;
    setInvitesLoading(true);
    try {
      const { data, error } = await supabase
        .from('squad_invitations')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .in('status', ['pending'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching squad invites:', error);
        setSquadInvites([]);
        setInvitesLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setSquadInvites([]);
        setInvitesLoading(false);
        return;
      }

      // Collect all unique user IDs to fetch profiles
      const userIds = new Set<string>();
      data.forEach(inv => {
        userIds.add(inv.sender_id);
        userIds.add(inv.receiver_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, unique_id')
        .in('user_id', Array.from(userIds));

      const enriched: SquadInvite[] = data.map(inv => {
        const sender = profiles?.find(p => p.user_id === inv.sender_id);
        const receiver = profiles?.find(p => p.user_id === inv.receiver_id);
        return {
          id: inv.id,
          party_id: inv.party_id,
          sender_id: inv.sender_id,
          receiver_id: inv.receiver_id,
          status: inv.status as SquadInvite['status'],
          created_at: inv.created_at,
          senderUsername: sender?.username || 'Unknown',
          senderUniqueId: sender?.unique_id || '',
          receiverUsername: receiver?.username || 'Unknown',
          receiverUniqueId: receiver?.unique_id || '',
        };
      });

      // Filter out expired invites (>5 minutes old)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const valid = enriched.filter(inv => inv.created_at > fiveMinAgo);

      setSquadInvites(valid);
    } catch (err) {
      console.error('Error fetching invites:', err);
      setSquadInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [user]);

  // Send an invite to a friend (persistent + broadcast)
  const inviteToParty = useCallback(async (friendUserId: string) => {
    if (!party || party.leader_id !== user?.id) {
      return { error: 'Only party leader can invite' };
    }

    if (party.members.length >= party.team_size) {
      return { error: 'Party is full' };
    }

    // Check if already in party
    if (party.members.some(m => m.user_id === friendUserId)) {
      return { error: 'Already in party' };
    }

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from('squad_invitations')
      .select('id')
      .eq('party_id', party.id)
      .eq('receiver_id', friendUserId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return { error: 'Invite already sent' };
    }

    // Create persistent invitation record
    const { error: insertError } = await supabase
      .from('squad_invitations')
      .insert({
        party_id: party.id,
        sender_id: user.id,
        receiver_id: friendUserId,
        status: 'pending',
      });

    if (insertError) {
      console.error('Failed to create invite:', insertError);
      return { error: 'Failed to send invite' };
    }

    // Also send real-time broadcast for instant toast notification
    const channel = supabase.channel(`invites-${friendUserId}`);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'invite',
          payload: {
            partyId: party.id,
            leaderName: profile?.username || 'Opponent',
          }
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 1000);
      }
    });

    await fetchInvites();
    return { error: null };
  }, [party, user, profile, fetchInvites]);

  // Cancel a sent invite
  const cancelInvite = useCallback(async (inviteId: string) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('squad_invitations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('sender_id', user.id);

    if (error) {
      return { error: 'Failed to cancel invite' };
    }

    await fetchInvites();
    return { error: null };
  }, [user, fetchInvites]);

  // Respond to an invite (accept or decline)
  const respondToInvite = useCallback(async (inviteId: string, accept: boolean) => {
    if (!user) return { error: 'Not authenticated' };

    // Get the invite details
    const { data: invite, error: fetchError } = await supabase
      .from('squad_invitations')
      .select('*')
      .eq('id', inviteId)
      .eq('receiver_id', user.id)
      .single();

    if (fetchError || !invite) {
      return { error: 'Invite not found' };
    }

    if (accept) {
      // Leave current party if any
      const { data: currentMember } = await supabase
        .from('party_members')
        .select('party_id')
        .eq('user_id', user.id)
        .single();

      if (currentMember) {
        // Check if leader of current party
        const { data: currentParty } = await supabase
          .from('parties')
          .select('leader_id')
          .eq('id', currentMember.party_id)
          .single();

        // Remove from current party
        await supabase
          .from('party_members')
          .delete()
          .eq('user_id', user.id)
          .eq('party_id', currentMember.party_id);

        // If was leader, delete old party
        if (currentParty?.leader_id === user.id) {
          await supabase
            .from('parties')
            .delete()
            .eq('id', currentMember.party_id);
        }
      }

      // Join the new party
      const { error: joinError } = await supabase
        .from('party_members')
        .insert({
          party_id: invite.party_id,
          user_id: user.id,
          is_ready: false,
        });

      if (joinError) {
        if (joinError.code === '23505') {
          // Already in party (race condition)
          await supabase
            .from('squad_invitations')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', inviteId);
          await fetchParty();
          await fetchInvites();
          return { error: null };
        }
        return { error: 'Failed to join squad: ' + joinError.message };
      }
    }

    // Update invite status
    const { error: updateError } = await supabase
      .from('squad_invitations')
      .update({
        status: accept ? 'accepted' : 'declined',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inviteId);

    if (updateError) {
      return { error: 'Failed to update invite' };
    }

    if (accept) {
      await fetchParty();
      toast.success('Joined squad!');
    }

    await fetchInvites();
    return { error: null };
  }, [user, fetchParty, fetchInvites]);

  // Leave the party
  const leaveParty = useCallback(async () => {
    if (!user) return;

    // Get current party membership
    const { data: memberData } = await supabase
      .from('party_members')
      .select('party_id')
      .eq('user_id', user.id)
      .single();

    if (!memberData) return;

    // Check if user is leader
    const { data: partyData } = await supabase
      .from('parties')
      .select('leader_id')
      .eq('id', memberData.party_id)
      .single();

    // Remove from party
    await supabase
      .from('party_members')
      .delete()
      .eq('user_id', user.id)
      .eq('party_id', memberData.party_id);

    // If leader left, delete the party
    if (partyData?.leader_id === user.id) {
      await supabase
        .from('parties')
        .delete()
        .eq('id', memberData.party_id);
    }

    setParty(null);
  }, [user]);

  // Toggle ready status
  const toggleReady = useCallback(async () => {
    if (!user || !party) return;

    const member = party.members.find(m => m.user_id === user.id);
    if (!member) return;

    await supabase
      .from('party_members')
      .update({ is_ready: !member.is_ready })
      .eq('party_id', party.id)
      .eq('user_id', user.id);

    await fetchParty();
  }, [user, party, fetchParty]);

  // Start queue (leader only)
  const startQueue = useCallback(async () => {
    if (!party || party.leader_id !== user?.id) {
      return { error: 'Only party leader can start queue' };
    }

    const allReady = party.members.every(m => m.is_ready);
    if (!allReady) {
      return { error: 'All members must be ready' };
    }

    await supabase
      .from('parties')
      .update({ status: 'queuing' })
      .eq('id', party.id);

    await fetchParty();
    return { error: null };
  }, [party, user, fetchParty]);

  // Kick member (leader only)
  const kickMember = useCallback(async (userId: string) => {
    if (!party || party.leader_id !== user?.id) {
      return { error: 'Only party leader can kick members' };
    }

    if (userId === user.id) {
      return { error: "Can't kick yourself" };
    }

    await supabase
      .from('party_members')
      .delete()
      .eq('party_id', party.id)
      .eq('user_id', userId);

    await fetchParty();
    return { error: null };
  }, [party, user, fetchParty]);

  // Initial fetch
  useEffect(() => {
    fetchParty();
    fetchInvites();
  }, [fetchParty, fetchInvites]);

  // Subscribe to our own party membership changes (for joins, kicks, surrenders)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-party-membership-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[Party] My membership row changed, refetching party details...');
          fetchParty();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchParty]);

  // Subscribe to party changes
  useEffect(() => {
    if (!party) return;

    const channel = supabase
      .channel(`party-${party.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${party.id}`,
        },
        () => fetchParty()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parties',
          filter: `id=eq.${party.id}`,
        },
        () => fetchParty()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [party, fetchParty]);

  // Subscribe to squad invitations changes (realtime)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`squad-invites-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'squad_invitations',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Invites] Received invite change:', payload);
          fetchInvites();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'squad_invitations',
          filter: `sender_id=eq.${user.id}`,
        },
        () => fetchInvites()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchInvites]);

  // Poll for matchmaking when queuing (leader only) — uses atomic RPC
  useEffect(() => {
    if (!party || party.status !== 'queuing' || party.leader_id !== user?.id) return;

    let cancelled = false;

    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        // Touch updated_at so our party stays "alive" in the queue
        await supabase
          .from('parties')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', party.id);

        // Call the atomic RPC
        const { data: matchId, error: rpcError } = await supabase.rpc(
          'find_or_create_squad_match' as never,
          { p_party_id: party.id } as never
        );

        if (rpcError) {
          // If RPC doesn't exist yet, fall back to client-side matching
          if (rpcError.message?.includes('function') || rpcError.code === '42883') {
            console.warn('[Squad Match] RPC not available, trying client-side fallback');
            await tryClientSideSquadMatch();
            return;
          }
          console.error('[Squad Match] RPC error:', rpcError);
          return;
        }

        if (matchId) {
          console.log('[Squad Match] RPC matched! Match ID:', matchId);
          // Refetch party to pick up matched status + match_id
          await fetchParty();
        }
      } catch (err) {
        console.error('Squad matchmaking poll error:', err);
      }
    }, 3000);

    // Client-side fallback (in case the RPC migration hasn't been applied)
    const tryClientSideSquadMatch = async () => {
      try {
        const { data: opponents, error } = await supabase
          .from('parties')
          .select('*')
          .eq('status', 'queuing')
          .eq('game_mode', party.game_mode)
          .eq('team_size', party.team_size)
          .neq('id', party.id)
          .order('created_at', { ascending: true })
          .limit(1);

        if (error || !opponents || opponents.length === 0) return;

        const opponentParty = opponents[0];

        const { data: opponentMembers } = await supabase
          .from('party_members')
          .select('user_id')
          .eq('party_id', opponentParty.id);

        if (!opponentMembers || opponentMembers.length === 0) return;

        const myMemberIds = party.members.map(m => m.user_id);
        const opponentMemberIds = opponentMembers.map(m => m.user_id);

        console.log('[Squad Match] Client-side fallback: matching with', opponentParty.id);

        const { data: match, error: matchError } = await supabase
          .from('matches')
          .insert({
            game_mode: party.game_mode,
            team_size: party.team_size,
            status: 'in_progress',
            team_a: myMemberIds,
            team_b: opponentMemberIds,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (matchError || !match) {
          console.error('Failed to create match for parties:', matchError);
          return;
        }

        await Promise.all([
          supabase
            .from('parties')
            .update({ status: 'matched', match_id: match.id })
            .eq('id', party.id),
          supabase
            .from('parties')
            .update({ status: 'matched', match_id: match.id })
            .eq('id', opponentParty.id)
        ]);

        console.log('[Squad Match] Client-side fallback: matched!');
        await fetchParty();
      } catch (err) {
        console.error('Client-side squad match error:', err);
      }
    };

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [party, user, fetchParty]);

  // Join a squad by code
  const joinByCode = useCallback(async (code: string) => {
    if (!user) return { error: 'Not authenticated' };

    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) {
      return { error: 'Invalid squad code' };
    }

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'join_party_by_code' as never,
        { p_code: trimmed } as never
      );

      if (rpcError) {
        // RPC not available — fallback to client-side join
        if (rpcError.message?.includes('function') || rpcError.code === '42883') {
          console.warn('[JoinByCode] RPC not available, using client-side fallback');
          return await joinByCodeClientFallback(trimmed);
        }
        return { error: rpcError.message || 'Failed to join' };
      }

      const result = data as unknown as { success: boolean; error?: string; party_id?: string };
      if (!result?.success) {
        return { error: result?.error || 'Failed to join squad' };
      }

      await fetchParty();
      toast.success('Joined squad!');
      return { error: null };
    } catch (err) {
      console.error('[JoinByCode] Error:', err);
      return { error: 'Failed to join squad' };
    }
  }, [user, fetchParty]);

  // Client-side fallback for join by code (when RPC not deployed yet)
  const joinByCodeClientFallback = useCallback(async (code: string) => {
    if (!user) return { error: 'Not authenticated' };

    // Find the party by code
    const { data: parties, error: findError } = await supabase
      .from('parties')
      .select('*')
      .eq('status', 'forming');

    if (findError || !parties) {
      return { error: 'Could not search for squad' };
    }

    // Filter by code match (case-insensitive) using raw column access
    const targetParty = parties.find((p: Record<string, unknown>) => {
      const partyCode = (p.code as string || '').toUpperCase();
      return partyCode === code;
    });

    if (!targetParty) {
      return { error: 'Squad not found or match already started' };
    }

    // Check capacity
    const { count } = await supabase
      .from('party_members')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', targetParty.id);

    if ((count || 0) >= targetParty.team_size) {
      return { error: 'Squad is full' };
    }

    // Check if already in this party
    const { data: existingMember } = await supabase
      .from('party_members')
      .select('id')
      .eq('party_id', targetParty.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      await fetchParty();
      return { error: null };
    }

    // Leave current party
    const { data: currentMember } = await supabase
      .from('party_members')
      .select('party_id')
      .eq('user_id', user.id)
      .single();

    if (currentMember) {
      const { data: currentParty } = await supabase
        .from('parties')
        .select('leader_id')
        .eq('id', currentMember.party_id)
        .single();

      await supabase.from('party_members').delete().eq('user_id', user.id);
      if (currentParty?.leader_id === user.id) {
        await supabase.from('parties').delete().eq('id', currentMember.party_id);
      }
    }

    // Join
    const { error: joinError } = await supabase
      .from('party_members')
      .insert({ party_id: targetParty.id, user_id: user.id, is_ready: false });

    if (joinError) {
      return { error: 'Failed to join: ' + joinError.message };
    }

    await fetchParty();
    toast.success('Joined squad!');
    return { error: null };
  }, [user, fetchParty]);

  const isLeader = party?.leader_id === user?.id;
  const isFull = party ? party.members.length >= party.team_size : false;
  const allReady = party?.members.every(m => m.is_ready) || false;

  const incomingInvites = squadInvites.filter(inv => inv.receiver_id === user?.id);
  const outgoingInvites = squadInvites.filter(inv => inv.sender_id === user?.id);

  return {
    party,
    loading,
    invites,
    isLeader,
    isFull,
    allReady,
    createParty,
    joinByCode,
    inviteToParty,
    cancelInvite,
    respondToInvite,
    leaveParty,
    toggleReady,
    startQueue,
    kickMember,
    fetchParty,
    fetchInvites,
    squadInvites,
    incomingInvites,
    outgoingInvites,
    invitesLoading,
  };
};
