import React from 'react';
import { ArrowRight, Flame, Skull } from 'lucide-react';

interface SplashScreenProps {
  onEnter: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onEnter }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-asphalt bg-concrete-texture px-4 select-none">
      {/* Decorative Urban Lines */}
      <div className="absolute top-8 left-8 flex items-center gap-2 text-stencil/40 font-mono text-[11px] tracking-widest">
        <Flame className="w-3.5 h-3.5 text-urbanOrange" />
        <span>SQUAD VAULT 047 // SC</span>
      </div>

      <div className="absolute top-8 right-8 text-stencil/40 font-mono text-[11px] tracking-widest">
        <span>EST. 2026</span>
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
        {/* Glow badge */}
        <div className="inline-flex items-center gap-2 bg-bunker/90 border border-neutral-700/80 px-3 py-1 rounded-sm mb-6 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-acid animate-ping"></span>
          <span className="font-mono text-[10px] text-acid font-bold tracking-widest uppercase">
            BIBLIOTECA COMPARTILHADA
          </span>
        </div>

        {/* Big Brutalist Brand */}
        <h1 
          className="font-display text-[7.5rem] sm:text-[9rem] text-acid leading-none tracking-wider mb-2"
          style={{ textShadow: '6px 6px 0px #ff5500, 10px 10px 0px #000' }}
        >
          TMJ
        </h1>

        <div className="flex items-center gap-2 mb-2">
          <Skull className="w-4 h-4 text-urbanOrange" />
          <p className="font-mono text-chalk text-xs tracking-[0.35em] font-bold">
            RESENHA OU MORTE
          </p>
          <Skull className="w-4 h-4 text-urbanOrange" />
        </div>

        <p className="font-mono text-stencil text-[11px] tracking-wider mb-10 max-w-[280px]">
          FOTOS, VÍDEOS, BEATS 808 & CHAT PRIVADO ENTRE OS TRÊS AMIGOS
        </p>

        {/* Entry Button */}
        <button
          onClick={onEnter}
          className="w-full bg-acid text-black font-display text-2xl tracking-widest px-8 py-4 rounded-sm border-2 border-black shadow-[6px_6px_0px_#ff5500] hover:shadow-[3px_3px_0px_#ff5500] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer group"
        >
          <span>ENTRAR NO VAULT</span>
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="mt-8 font-mono text-[10px] text-neutral-500 tracking-widest uppercase">
          CONECTADO A TRIOTMJ-3187E
        </div>
      </div>
    </div>
  );
};
