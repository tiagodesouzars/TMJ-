import React, { useState } from 'react';
import { SmilePlus, ChevronDown, ChevronUp } from 'lucide-react';

export const FIXED_REACTION_EMOJIS = [
  '❤️', '😋', '😒', '😎', '😴', '🤬', '🤮', '🤕', '🤫', '😈', '💩', '😏', '🔥', '💪'
] as const;

export type FixedReactionEmoji = typeof FIXED_REACTION_EMOJIS[number];

interface MediaReactionsProps {
  reactions?: Record<string, number>;
  reactedBy?: Record<string, string[]>;
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  className?: string;
}

export const MediaReactions: React.FC<MediaReactionsProps> = ({
  reactions = {},
  reactedBy = {},
  currentUserId,
  onToggleReaction,
  className = ''
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Emojis that have at least 1 reaction
  const activeEmojisWithCounts = FIXED_REACTION_EMOJIS.filter(
    (emoji) => (reactions[emoji] || 0) > 0
  );

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {/* Active Reactions Pills & Toggle Picker Button */}
      <div className="flex items-center flex-wrap gap-1.5">
        {activeEmojisWithCounts.map((emoji) => {
          const count = reactions[emoji] || 0;
          const hasReacted = Boolean(reactedBy[emoji]?.includes(currentUserId));

          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggleReaction(emoji)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs font-mono text-xs border transition-all cursor-pointer active:scale-95 ${
                hasReacted
                  ? 'bg-acid/15 border-acid text-chalk font-bold shadow-[1px_1px_0px_var(--color-acid)]'
                  : 'bg-asphalt border-bunker hover:border-neutral-700 text-stencil hover:text-chalk'
              }`}
              title={hasReacted ? `Você e mais ${count - 1} reagiram com ${emoji}` : `Reagir com ${emoji}`}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className={`text-[11px] font-bold ${hasReacted ? 'text-acid' : 'text-stencil'}`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Button to open / toggle the 14 emojis tray */}
        <button
          type="button"
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-xs font-mono text-[11px] border transition-all cursor-pointer ${
            isPickerOpen
              ? 'bg-acid text-asphalt font-bold border-acid shadow-[2px_2px_0px_var(--color-asphalt)]'
              : 'bg-asphalt border-bunker hover:border-acid text-stencil hover:text-chalk'
          }`}
          title="Adicionar reação"
        >
          <SmilePlus className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">REAGIR</span>
          {isPickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expandable Street Emoji Tray (All 14 Fixed Emojis) */}
      {isPickerOpen && (
        <div className="bg-asphalt border border-bunker p-2 rounded-xs animate-in fade-in slide-in-from-top-1 duration-150 shadow-md">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="font-mono text-[9px] text-acid font-bold tracking-widest uppercase">
              REAGIR AO DROP (14 EMOJIS)
            </span>
            <span className="font-mono text-[8px] text-stencil uppercase">
              TOQUE PARA MARCAR
            </span>
          </div>

          <div className="grid grid-cols-7 sm:grid-cols-14 gap-1">
            {FIXED_REACTION_EMOJIS.map((emoji) => {
              const hasReacted = Boolean(reactedBy[emoji]?.includes(currentUserId));
              const count = reactions[emoji] || 0;

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onToggleReaction(emoji);
                  }}
                  className={`aspect-square flex flex-col items-center justify-center p-1 rounded-xs border transition-all cursor-pointer active:scale-90 ${
                    hasReacted
                      ? 'bg-acid/20 border-acid shadow-[1px_1px_0px_var(--color-acid)] scale-105'
                      : 'bg-concrete border-bunker hover:border-neutral-600 hover:bg-bunker'
                  }`}
                  title={`Reagir com ${emoji}`}
                >
                  <span className="text-base sm:text-lg leading-none">{emoji}</span>
                  {count > 0 && (
                    <span className="text-[8px] font-mono text-stencil font-bold mt-0.5">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
