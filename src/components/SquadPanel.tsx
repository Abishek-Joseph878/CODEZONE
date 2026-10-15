import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import CharacterViewer from '@/components/CharacterViewer';
import { useAuth } from '@/contexts/AuthContext';
import { usePartySystem } from '@/hooks/usePartySystem';
import { Shield, LogOut, Check, UserMinus, UserPlus, Crown, Wifi, Copy, CheckCheck } from 'lucide-react';

interface SquadPanelProps {
  onInviteFriends: () => void;
}

const SquadPanel: React.FC<SquadPanelProps> = ({ onInviteFriends }) => {
  const { user } = useAuth();
  const {
    party,
    isLeader,
    toggleReady,
    leaveParty,
    kickMember,
  } = usePartySystem();

  const [codeCopied, setCodeCopied] = useState(false);

  if (!party) return null;

  const emptySlots = Math.max(0, party.team_size - party.members.length);

  const statusConfig = {
    forming: {
      label: 'FORMING',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      dot: 'bg-yellow-400',
    },
    queuing: {
      label: 'SEARCHING',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      dot: 'bg-blue-400 animate-pulse',
    },
    matched: {
      label: 'MATCHED',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      dot: 'bg-green-400',
    },
  };

  const statusInfo = statusConfig[party.status] || statusConfig.forming;

  const handleCopyCode = () => {
    if (!party.code) return;
    navigator.clipboard.writeText(party.code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <section className="glass-panel p-6 mb-6" id="squad-panel">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-orbitron font-bold text-primary text-xl flex items-center gap-2">
            <span>👥 {party.name || 'Squad Operatives'}</span>
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-muted-foreground">
              Slots: <strong className="text-foreground">{party.members.length}/{party.team_size}</strong>
            </span>
            <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-orbitron font-bold border ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
              {statusInfo.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Squad Code Badge */}
          {party.code && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-primary/30 hover:border-primary/60 transition-all group"
              title="Click to copy squad code"
              id="squad-code-badge"
            >
              <span className="text-[10px] text-muted-foreground font-orbitron">CODE</span>
              <span className="font-mono font-bold text-primary tracking-widest text-sm">
                {party.code}
              </span>
              {codeCopied ? (
                <CheckCheck size={14} className="text-green-400" />
              ) : (
                <Copy size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </button>
          )}

          <Button
            onClick={onInviteFriends}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/10 transition-all"
            id="invite-friends-btn"
          >
            <UserPlus size={16} />
            Invite
          </Button>
        </div>
      </div>

      {/* Members Grid */}
      <div className="flex flex-wrap justify-center items-stretch gap-4 min-h-[340px] py-4 bg-black/20 rounded-xl border border-border/30">
        {/* Active Members */}
        {party.members.map((member) => {
          const isCurrentUser = member.user_id === user?.id;
          return (
            <div
              key={member.user_id}
              className={`flex flex-col items-center justify-between p-4 bg-black/40 border rounded-xl w-[200px] transition-all duration-300 hover:scale-[1.02] ${
                isCurrentUser
                  ? 'border-primary/40 shadow-[0_0_15px_hsla(157,46%,56%,0.15)]'
                  : 'border-border/40'
              }`}
            >
              {/* Character 3D model */}
              <div className="w-[170px] h-[220px] bg-black/10 rounded-lg overflow-hidden relative">
                <CharacterViewer />
              </div>

              {/* Member details */}
              <div className="mt-3 text-center w-full flex flex-col items-center gap-2">
                <div>
                  <span className="font-medium text-sm text-foreground flex items-center justify-center gap-1.5">
                    {member.is_leader && (
                      <Crown size={14} className="text-yellow-400 fill-yellow-400" title="Squad Leader" />
                    )}
                    {member.username}
                    {isCurrentUser && <span className="text-xs text-primary/70">(You)</span>}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{member.unique_id}</p>
                </div>

                {/* Ready Status Badge */}
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-orbitron font-bold border transition-all ${
                  member.is_ready
                    ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_8px_hsla(142,71%,45%,0.2)]'
                    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                }`}>
                  {member.is_ready ? '● READY' : '○ NOT READY'}
                </span>

                {/* Inline actions */}
                <div className="flex gap-1.5 w-full mt-1.5">
                  {isCurrentUser && (
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        className={`flex-1 text-[11px] transition-all ${
                          member.is_ready
                            ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20'
                        }`}
                        onClick={toggleReady}
                      >
                        <Check size={12} className="mr-1" />
                        {member.is_ready ? 'Unready' : 'Ready'}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10 px-2"
                        onClick={leaveParty}
                        title="Leave Squad"
                      >
                        <LogOut size={12} />
                      </Button>
                    </>
                  )}

                  {isLeader && !isCurrentUser && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="w-full text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => kickMember(member.user_id)}
                    >
                      <UserMinus size={12} className="mr-1" />
                      Kick
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty Slot Placeholders */}
        {Array.from({ length: emptySlots }).map((_, idx) => (
          <button
            key={`empty-${idx}`}
            onClick={onInviteFriends}
            className="flex flex-col items-center justify-center p-4 bg-black/20 border-2 border-dashed border-border/30 rounded-xl w-[200px] min-h-[340px] transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 group cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border/40 flex items-center justify-center group-hover:border-primary/50 transition-colors mb-3">
              <UserPlus
                size={24}
                className="text-muted-foreground/50 group-hover:text-primary/70 transition-colors"
              />
            </div>
            <span className="text-xs text-muted-foreground/50 font-orbitron group-hover:text-primary/60 transition-colors">
              INVITE
            </span>
            <span className="text-[10px] text-muted-foreground/30 mt-1 group-hover:text-muted-foreground/50 transition-colors">
              Slot {party.members.length + idx + 1}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default SquadPanel;
