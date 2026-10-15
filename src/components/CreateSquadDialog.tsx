import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { usePartySystem } from '@/hooks/usePartySystem';
import { toast } from 'sonner';
import { Swords, Shield, Users, Lock, Sparkles, Loader2 } from 'lucide-react';

interface CreateSquadDialogProps {
  onSquadCreated?: () => void;
}

type GameMode = 'duel' | 'campaign' | 'practice';

interface ModeOption {
  mode: GameMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  disabledReason?: string;
}

interface SizeOption {
  size: number;
  label: string;
  description: string;
}

const modeOptions: ModeOption[] = [
  {
    mode: 'duel',
    label: 'Clash Code',
    description: 'Competitive squad vs squad',
    icon: <Swords size={22} />,
    disabled: false,
  },
  {
    mode: 'campaign',
    label: 'StudyGround',
    description: 'Coming soon...',
    icon: <Shield size={22} />,
    disabled: true,
    disabledReason: 'Coming Soon',
  },
  {
    mode: 'practice',
    label: 'Practice Arena',
    description: 'Coming soon...',
    icon: <Sparkles size={22} />,
    disabled: true,
    disabledReason: 'Coming Soon',
  },
];

const sizeOptions: SizeOption[] = [
  { size: 1, label: '1v1', description: 'Solo Duel' },
  { size: 3, label: '3v3', description: 'Trio Clash' },
  { size: 5, label: '5v5', description: 'Full Squad' },
];

const CreateSquadDialog: React.FC<CreateSquadDialogProps> = ({ onSquadCreated }) => {
  const { createParty } = usePartySystem();
  const [open, setOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GameMode>('duel');
  const [selectedSize, setSelectedSize] = useState(5);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const result = await createParty(selectedMode, selectedSize);
    setCreating(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Squad created! Invite your friends.');
      setOpen(false);
      onSquadCreated?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gradient-accent font-orbitron text-sm tracking-wide relative overflow-hidden group"
          id="create-squad-btn"
        >
          <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
          <Users size={16} className="mr-2" />
          Create Squad
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-card/95 backdrop-blur-xl border-primary/20 max-w-lg shadow-2xl" id="create-squad-dialog">
        <DialogHeader>
          <DialogTitle className="font-orbitron text-xl text-primary flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center shadow-glow">
              <Users size={20} className="text-white" />
            </div>
            CREATE SQUAD
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Assemble your team and dominate the arena together
          </DialogDescription>
        </DialogHeader>

        {/* Game Mode Selection */}
        <div className="space-y-3 mt-2">
          <label className="text-xs font-orbitron text-muted-foreground uppercase tracking-wider">
            Game Mode
          </label>
          <div className="grid grid-cols-3 gap-3">
            {modeOptions.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => !opt.disabled && setSelectedMode(opt.mode)}
                disabled={opt.disabled}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-300 group ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed border-border/30 bg-black/20'
                    : selectedMode === opt.mode
                    ? 'border-primary bg-primary/10 shadow-[0_0_20px_hsla(157,46%,56%,0.2)]'
                    : 'border-border/50 bg-black/30 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                {opt.disabled && (
                  <div className="absolute top-2 right-2">
                    <Lock size={12} className="text-muted-foreground" />
                  </div>
                )}
                <div className={`transition-colors ${
                  selectedMode === opt.mode ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`}>
                  {opt.icon}
                </div>
                <span className={`text-xs font-orbitron font-bold ${
                  selectedMode === opt.mode ? 'text-primary' : 'text-foreground'
                }`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  {opt.disabled ? opt.disabledReason : opt.description}
                </span>

                {/* Active indicator dot */}
                {selectedMode === opt.mode && !opt.disabled && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(157,46%,56%,0.6)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Team Size Selection */}
        <div className="space-y-3 mt-2">
          <label className="text-xs font-orbitron text-muted-foreground uppercase tracking-wider">
            Team Size
          </label>
          <div className="grid grid-cols-3 gap-3">
            {sizeOptions.map((opt) => (
              <button
                key={opt.size}
                onClick={() => setSelectedSize(opt.size)}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all duration-300 ${
                  selectedSize === opt.size
                    ? 'border-primary bg-primary/10 shadow-[0_0_20px_hsla(157,46%,56%,0.2)]'
                    : 'border-border/50 bg-black/30 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <span className={`text-2xl font-orbitron font-black ${
                  selectedSize === opt.size ? 'text-primary' : 'text-foreground'
                }`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{opt.description}</span>

                {selectedSize === opt.size && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(157,46%,56%,0.6)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Summary & Create */}
        <div className="mt-4 p-4 rounded-xl bg-black/30 border border-border/40 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Squad Config</p>
            <p className="text-sm font-orbitron text-foreground mt-0.5">
              {modeOptions.find(m => m.mode === selectedMode)?.label} · {sizeOptions.find(s => s.size === selectedSize)?.label}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="gradient-accent font-orbitron text-sm px-6 py-2.5 glow-accent relative overflow-hidden group"
            id="confirm-create-squad-btn"
          >
            <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
            {creating ? (
              <Loader2 className="animate-spin mr-2" size={16} />
            ) : (
              <Swords size={16} className="mr-2" />
            )}
            {creating ? 'CREATING...' : 'DEPLOY SQUAD'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSquadDialog;
