import React, { useState } from 'react';
import { SmilePlus, ChevronDown, ChevronUp, Check } from 'lucide-react';

export const FIXED_REACTION_EMOJIS = [
  '❤️', '😋', '😒', '😎', '😴', '🤬', '🤮', '🤕', '🤫', '😈', '💩', '😏', '🔥', '💪'
] as const;

export type FixedReactionEmoji = typeof FIXED_REACTION_EMOJIS[number];

interface MediaReactionsProps {
  reactions?: Record<string, number>;
  reactedBy?: Record<string, string[]>;
  currentDeviceId?: string;
  currentUserId?: string;
  userSelectedEmoji?: string | null;
  onToggleReaction: (emoji: string) => void;
  className?: string;
  isViewer?: boolean;
}

export const MediaReactions: React.FC<MediaReactionsProps> = ({
  reactions = {},
  reactedBy = {},
  currentDeviceId,
  currentUserId,
  userSelectedEmoji,
  onToggleReaction,
  className = '',
  isViewer = false
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const effectiveId = currentDeviceId || currentUserId || 'dev_guest';

  // Determine which emoji this device has reacted with
  const activeDeviceEmoji = userSelectedEmoji || FIXED_REACTION_EMOJIS.find(
    (emoji) => reactedBy[emoji]?.includes(effectiveId)
  ) || null;

  // Emojis that have at least 1 count
  const activeEmojisWithCounts = FIXED_REACTION_EMOJIS.filter(
    (emoji) => (reactions[emoji] || 0) > 0
  );

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {/* Active Reactions Pills & Toggle Picker Button */}
      <div className="flex items-center flex-wrap gap-1.5">
        {activeEmojisWithCounts.map((emoji) => {
          const count = reactions[emoji] || 0;
          const isThisDeviceReaction = activeDeviceEmoji === emoji;

          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggleReaction(emoji)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs font-mono text-xs border transition-all cursor-pointer active:scale-95 ${
                isThisDeviceReaction
                  ? 'bg-acid/20 border-acid text-white font-bold shadow-[2px_2px_0px_var(--color-acid)] ring-1 ring-acid/50'
                  : 'bg-asphalt border-bunker hover:border-neutral-600 text-stencil hover:text-chalk'
              }`}
              title={
                isThisDeviceReaction
                  ? `Sua reação neste aparelho: ${emoji} (clique para remover)`
                  : `Reagir com ${emoji}`
              }
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className={`text-[11px] font-bold ${isThisDeviceReaction ? 'text-acid' : 'text-stencil'}`}>
                {count}
              </span>
              {isThisDeviceReaction && (
                <span className="w-1.5 h-1.5 rounded-full bg-acid animate-ping"></span>
              )}
            </button>
          );
        })}

        {/* Button to open / toggle the 14 emojis tray */}
        <button
          type="button"
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs font-mono text-[11px] border transition-all cursor-pointer ${
            isPickerOpen
              ? 'bg-acid text-asphalt font-bold border-acid shadow-[2px_2px_0px_var(--color-asphalt)]'
              : 'bg-asphalt border-bunker hover:border-acid text-stencil hover:text-chalk'
          }`}
          title="Adicionar ou alterar reação"
        >
          <SmilePlus className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">
            {activeDeviceEmoji ? 'TROCAR REAÇÃO' : 'REAGIR'}
          </span>
          {isPickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Device Reaction Status Note */}
      {activeDeviceEmoji && (
        <div className="flex items-center justify-between text-[10px] font-mono text-stencil/80 px-0.5">
          <span className="flex items-center gap-1">
            <Check className="w-3 h-3 text-acid" />
            <span>Reação do aparelho: <strong className="text-acid">{activeDeviceEmoji}</strong></span>
          </span>
          <button
            type="button"
            onClick={() => onToggleReaction(activeDeviceEmoji)}
            className="text-red-400 hover:underline cursor-pointer"
          >
            remover
          </button>
        </div>
      )}

      {/* Expandable Street Emoji Tray (All 14 Fixed Emojis) */}
      {isPickerOpen && (
        <div className="bg-asphalt border border-bunker p-2 rounded-xs animate-in fade-in slide-in-from-top-1 duration-150 shadow-md">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-mono text-[9px] text-acid font-bold tracking-widest uppercase">
              1 REAÇÃO POR APARELHO ({FIXED_REACTION_EMOJIS.length} EMOJIS)
            </span>
            <span className="font-mono text-[8px] text-stencil uppercase">
              {activeDeviceEmoji ? 'TOQUE NO ATUAL P/ REMOVER' : 'TOQUE P/ ESCOLHER'}
            </span>
          </div>

          <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
            {FIXED_REACTION_EMOJIS.map((emoji) => {
              const isSelectedByThisDevice = activeDeviceEmoji === emoji;
              const count = reactions[emoji] || 0;

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onToggleReaction(emoji);
                  }}
                  className={`aspect-square flex flex-col items-center justify-center p-1 rounded-xs border transition-all cursor-pointer active:scale-90 relative ${
                    isSelectedByThisDevice
                      ? 'bg-acid/25 border-acid shadow-[2px_2px_0px_var(--color-acid)] scale-105 z-10'
                      : 'bg-concrete border-bunker hover:border-neutral-500 hover:bg-bunker'
                  }`}
                  title={
                    isSelectedByThisDevice
                      ? `Sua reação atual (${emoji}). Clique para desmarcar.`
                      : `Reagir com ${emoji}`
                  }
                >
                  <span className="text-base sm:text-lg leading-none">{emoji}</span>
                  {count > 0 && (
                    <span className={`text-[8px] font-mono font-bold mt-0.5 ${isSelectedByThisDevice ? 'text-acid' : 'text-stencil'}`}>
                      {count}
                    </span>
                  )}
                  {isSelectedByThisDevice && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-acid rounded-full border border-asphalt"></div>
                  )}
                </button>
              );
            })}
          </div>
          
          {isViewer && (
            <p className="font-mono text-[9px] text-stencil/70 text-center mt-2 border-t border-bunker/50 pt-1.5">
              Cada visitante/aparelho pode registrar sua própria reação em cada drop.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
