import React from 'react';
import { SquadMember } from '../types';
import { BadgeCheck, LogOut, Radio } from 'lucide-react';

interface HeaderProps {
  activeMember: SquadMember;
  allMembers: SquadMember[];
  onSwitchMember: (member: SquadMember) => void;
  onOpenSquadModal: () => void;
  onOpenProjectInfo: () => void;
  onLogout: () => void;
  isDbConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeMember,
  allMembers,
  onSwitchMember,
  onOpenSquadModal,
  onOpenProjectInfo,
  onLogout,
  isDbConnected
}) => {
  return (
    <header className="sticky top-0 z-30 bg-asphalt/95 backdrop-blur-md border-b border-neutral-800">
      {/* Ticker marquee */}
      <div className="bg-acid text-black overflow-hidden py-0.5 border-b-2 border-black flex relative z-40">
        <div className="font-display text-[11px] tracking-[0.2em] animate-ticker whitespace-nowrap font-bold">
          +++ TMJ SQUAD VAULT +++ RESENHA OU MORTE +++ CONCEPT? +++ FOTOS // VÍDEOS // BEATS 808 +++ TRIO TMJ +++
        </div>
      </div>

      <div className="px-3 pt-2.5 pb-2">
        {/* Top brand row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <span 
              className="font-display text-3xl tracking-wider text-acid leading-none uppercase"
              style={{ textShadow: '2px 2px 0px #ff5500' }}
            >
              TMJ
            </span>
            <button
              type="button"
              onClick={onOpenProjectInfo}
              className="flex items-center gap-1.5 bg-concrete border border-neutral-800 hover:border-acid px-2 py-0.5 rounded-sm transition-colors cursor-pointer"
              title="Ver status do Firebase trioTMJ"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isDbConnected ? 'bg-acid' : 'bg-urbanOrange'
                }`}
              ></span>
              <span className="font-mono text-[9px] text-stencil uppercase tracking-wider">
                triotmj // {isDbConnected ? 'SYNC' : 'LOCAL'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSquadModal}
              className="bg-concrete border border-neutral-700 hover:border-acid rounded-sm px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-mono text-chalk shadow-[2px_2px_0px_#000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              <BadgeCheck className="w-3.5 h-3.5 text-acid" />
              <span>SQUAD ID</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Trocar usuário / Sair"
              className="bg-bunker border border-neutral-700 rounded-sm w-7 h-7 flex items-center justify-center text-stencil hover:text-urbanOrange hover:border-urbanOrange transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Squad Switcher Row */}
        <div className="flex items-center gap-1.5 bg-bunker/80 border border-neutral-800/80 p-1 rounded-sm mb-2.5">
          <span className="font-mono text-[9px] text-neutral-500 uppercase px-1 flex items-center gap-1">
            <Radio className="w-3 h-3 text-acid" />
            ON:
          </span>
          <div className="flex-1 flex gap-1">
            {allMembers.map((m) => {
              const isActive = m.id === activeMember.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSwitchMember(m)}
                  className={`flex-1 py-1 px-1.5 rounded-sm flex items-center justify-center gap-1 text-[10px] font-mono transition-all cursor-pointer ${
                    isActive
                      ? 'bg-concrete text-white border border-neutral-700 font-bold shadow-sm'
                      : 'text-stencil/70 hover:text-stencil bg-transparent'
                  }`}
                  style={isActive ? { borderLeft: `3px solid ${m.color}` } : {}}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: m.color }}
                  ></span>
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Streetwear Visual Banner */}
        <div className="w-full h-24 sm:h-28 rounded-sm border-2 border-neutral-800 overflow-hidden relative group">
          <div className="absolute inset-0 bg-acid/15 group-hover:bg-acid/0 transition-colors z-10 pointer-events-none mix-blend-overlay"></div>
          <img
            src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&q=80&w=800&h=250"
            alt="Streetwear Banner"
            className="w-full h-full object-cover grayscale opacity-75"
          />
          <div className="absolute bottom-2 left-3 font-display text-white text-xl sm:text-2xl tracking-widest drop-shadow-[2px_2px_0px_#000] z-20 pointer-events-none uppercase">
            TMJ // SQUAD VAULT
          </div>
          <div className="absolute top-2 right-3 font-mono text-[9px] bg-black/80 border border-neutral-700 px-2 py-0.5 rounded-sm text-sprayCyan z-20">
            047 // SC
          </div>
        </div>
      </div>
    </header>
  );
};
