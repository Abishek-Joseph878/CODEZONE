import React, { useState } from 'react';
import { usePartySystem, SquadInvite } from '@/hooks/usePartySystem';
import { useFriendSystem } from '@/hooks/useFriendSystem';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  X,
  Mail,
  MailOpen,
  Send,
  Check,
  XIcon,
  Clock,
  UserPlus,
  Loader2,
  Sparkles,
  ArrowRight,
  Ban,
} from 'lucide-react';

interface InvitationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const InvitationsPanel: React.FC<InvitationsPanelProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const {
    party,
    incomingInvites,
    outgoingInvites,
    invitesLoading,
    inviteToParty,
    cancelInvite,
    respondToInvite,
  } = usePartySystem();

  const { friends } = useFriendSystem();
  const { isUserOnline } = usePresence();

  const [quickInviteSearch, setQuickInviteSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // Filtered friends for quick invite (online, not already in squad, not already invited)
  const invitableFriends = friends.filter((f) => {
    const isOnline = f.isOnline || isUserOnline(f.friendId);
    const isInSquad = party?.members.some((m) => m.user_id === f.friendId);
    const isAlreadyInvited = outgoingInvites.some(
      (inv) => inv.receiver_id === f.friendId && inv.status === 'pending'
    );
    const matchesSearch = quickInviteSearch
      ? f.username.toLowerCase().includes(quickInviteSearch.toLowerCase()) ||
        f.uniqueId.toLowerCase().includes(quickInviteSearch.toLowerCase())
      : true;
    return isOnline && !isInSquad && !isAlreadyInvited && matchesSearch;
  });

  const handleQuickInvite = async (friendId: string) => {
    setSendingTo(friendId);
    const result = await inviteToParty(friendId);
    setSendingTo(null);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Invitation sent!');
    }
  };

  const handleAccept = async (inviteId: string) => {
    const result = await respondToInvite(inviteId, true);
    if (result.error) {
      toast.error(result.error);
    }
  };

  const handleDecline = async (inviteId: string) => {
    const result = await respondToInvite(inviteId, false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.info('Invitation declined');
    }
  };

  const handleCancel = async (inviteId: string) => {
    const result = await cancelInvite(inviteId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.info('Invitation cancelled');
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-[70px] w-[420px] max-w-full h-[calc(100vh-70px)] bg-surface/95 backdrop-blur-xl border-l border-border/50 z-50 transition-transform duration-300 overflow-hidden flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        id="invitations-panel"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
              <Mail size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-lg text-foreground">Invitations</h3>
              <p className="text-xs text-muted-foreground">
                {incomingInvites.length} incoming · {outgoingInvites.length} sent
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:scale-110 transition-all p-1"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {invitesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : (
            <Tabs defaultValue="incoming" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-5 bg-black/30 border border-border/30 rounded-lg">
                <TabsTrigger value="incoming" className="text-xs font-orbitron data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Incoming ({incomingInvites.length})
                </TabsTrigger>
                <TabsTrigger value="outgoing" className="text-xs font-orbitron data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Sent ({outgoingInvites.length})
                </TabsTrigger>
                <TabsTrigger value="invite" className="text-xs font-orbitron data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Quick Invite
                </TabsTrigger>
              </TabsList>

              {/* ── Incoming Invitations ── */}
              <TabsContent value="incoming" className="space-y-3">
                {incomingInvites.length === 0 ? (
                  <EmptyState
                    icon={<MailOpen size={36} className="text-muted-foreground/30" />}
                    title="No incoming invitations"
                    description="When friends invite you to their squad, they'll appear here"
                  />
                ) : (
                  incomingInvites.map((invite) => (
                    <InviteCard
                      key={invite.id}
                      invite={invite}
                      type="incoming"
                      onAccept={() => handleAccept(invite.id)}
                      onDecline={() => handleDecline(invite.id)}
                      formatTimeAgo={formatTimeAgo}
                    />
                  ))
                )}
              </TabsContent>

              {/* ── Outgoing Invitations ── */}
              <TabsContent value="outgoing" className="space-y-3">
                {outgoingInvites.length === 0 ? (
                  <EmptyState
                    icon={<Send size={36} className="text-muted-foreground/30" />}
                    title="No pending invitations"
                    description="Invitations you send will appear here"
                  />
                ) : (
                  outgoingInvites.map((invite) => (
                    <InviteCard
                      key={invite.id}
                      invite={invite}
                      type="outgoing"
                      onCancel={() => handleCancel(invite.id)}
                      formatTimeAgo={formatTimeAgo}
                    />
                  ))
                )}
              </TabsContent>

              {/* ── Quick Invite ── */}
              <TabsContent value="invite" className="space-y-4">
                <div className="relative">
                  <Input
                    placeholder="Search friends..."
                    value={quickInviteSearch}
                    onChange={(e) => setQuickInviteSearch(e.target.value)}
                    className="bg-black/30 border-border/40 font-mono text-sm pl-9"
                    id="quick-invite-search"
                  />
                  <UserPlus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>

                {!party ? (
                  <EmptyState
                    icon={<Ban size={36} className="text-muted-foreground/30" />}
                    title="No active squad"
                    description="Create a squad first to invite friends"
                  />
                ) : invitableFriends.length === 0 ? (
                  <EmptyState
                    icon={<Sparkles size={36} className="text-muted-foreground/30" />}
                    title={quickInviteSearch ? 'No matching friends' : 'No available friends'}
                    description={quickInviteSearch ? 'Try a different search' : 'All online friends are already in your squad or invited'}
                  />
                ) : (
                  <div className="space-y-2">
                    {invitableFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-border/30 hover:border-primary/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_hsla(142,71%,45%,0.5)]" />
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {friend.username}
                            </span>
                            <p className="text-xs text-muted-foreground font-mono">
                              {friend.uniqueId}
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleQuickInvite(friend.friendId)}
                          disabled={sendingTo === friend.friendId}
                          className="text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/40 px-3 transition-all"
                        >
                          {sendingTo === friend.friendId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Send size={14} className="mr-1.5" />
                              <span className="text-xs">Invite</span>
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

interface InviteCardProps {
  invite: SquadInvite;
  type: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  formatTimeAgo: (date: string) => string;
}

const InviteCard: React.FC<InviteCardProps> = ({
  invite,
  type,
  onAccept,
  onDecline,
  onCancel,
  formatTimeAgo,
}) => {
  const displayName = type === 'incoming' ? invite.senderUsername : invite.receiverUsername;
  const displayId = type === 'incoming' ? invite.senderUniqueId : invite.receiverUniqueId;

  return (
    <div className="p-4 rounded-xl bg-black/30 border border-border/30 hover:border-primary/20 transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            type === 'incoming'
              ? 'bg-primary/10 border border-primary/20'
              : 'bg-muted/20 border border-border/30'
          }`}>
            {type === 'incoming' ? (
              <ArrowRight size={16} className="text-primary" />
            ) : (
              <Send size={14} className="text-muted-foreground" />
            )}
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">{displayName}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">{displayId}</span>
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <Clock size={10} />
                {formatTimeAgo(invite.created_at)}
              </span>
            </div>
          </div>
        </div>

        <span className={`text-[10px] px-2 py-0.5 rounded-full font-orbitron border ${
          invite.status === 'pending'
            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
            : invite.status === 'accepted'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {invite.status.toUpperCase()}
        </span>
      </div>

      {/* Actions */}
      {invite.status === 'pending' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border/20">
          {type === 'incoming' ? (
            <>
              <Button
                size="sm"
                onClick={onAccept}
                className="flex-1 gradient-accent text-white text-xs font-orbitron hover:opacity-90 transition-opacity"
              >
                <Check size={14} className="mr-1.5" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDecline}
                className="flex-1 text-xs border-border/40 text-muted-foreground hover:text-red-400 hover:border-red-500/30"
              >
                <XIcon size={14} className="mr-1.5" />
                Decline
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="w-full text-xs border-border/40 text-muted-foreground hover:text-red-400 hover:border-red-500/30"
            >
              <Ban size={14} className="mr-1.5" />
              Cancel Invite
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    {icon}
    <p className="text-sm font-medium text-muted-foreground mt-3">{title}</p>
    <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">{description}</p>
  </div>
);

export default InvitationsPanel;
