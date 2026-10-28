import React, { useState } from 'react';
import { SquadMember } from '../types';
import { UserCheck, Lock, X, Database, Eye, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  members: SquadMember[];
  onSelectMember: (member: SquadMember) => void;
  onOpenProjectInfo: () => void;
  isDbConnected: boolean;
  onEnterViewerMode?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  members,
  onSelectMember,
  onOpenProjectInfo,
  isDbConnected,
  onEnterViewerMode
}) => {
  const [passwordTarget, setPasswordTarget] = useState<SquadMember | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleMemberClick = (member: SquadMember) => {
    if (member.password) {
      setPasswordTarget(member);
      setPinInput('');
      setErrorMsg('');
    } else {
      onSelectMember(member);
    }
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passwordTarget) return;

    if (passwordTarget.password && pinInput !== passwordTarget.password) {
      setErrorMsg('Senha incorreta!');
      return;
    }

    onSelectMember(passwordTarget);
    setPasswordTarget(null);
  };

  return (
    <div className="fixed inset-0 z-40 bg-asphalt bg-concrete-texture flex flex-col items-center justify-center p-4 select-none">
      {/* Firebase status header */}
      <button
        type="button"
        onClick={onOpenProjectInfo}
        className="flex items-center gap-2 bg-bunker border border-neutral-800 hover:border-acid px-3 py-1.5 rounded-sm mb-4 transition-colors cursor-pointer group"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isDbConnected ? 'bg-acid animate-pulse' : 'bg-urbanOrange'
          }`}
        ></span>
        <span className="font-mono text-[10px] text-stencil group-hover:text-chalk tracking-widest uppercase flex items-center gap-1.5">
          <Database className="w-3 h-3 text-acid" />
          <span>triotmj-3187e // {isDbConnected ? 'CONECTADO' : 'SYNC LOCAL'}</span>
        </span>
      </button>

      <h2 className="font-display text-4xl sm:text-5xl text-white mb-1 tracking-wide">
        QUEM É VOCÊ?
      </h2>
      <p className="font-mono text-xs text-acid mb-8 tracking-widest font-bold">
        ACESSO RESTRITO AO TRIO TMJ
      </p>

      {/* Members Grid */}
      <div className="w-full max-w-[340px] space-y-3">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => handleMemberClick(m)}
            className="w-full bg-concrete border-2 border-neutral-800 hover:border-neutral-600 rounded-sm p-3.5 flex items-center justify-between shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none transition-all text-left cursor-pointer group"
            style={{ borderLeftColor: m.color, borderLeftWidth: '6px' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-sm border border-neutral-700 bg-asphalt flex items-center justify-center font-display text-xl overflow-hidden shrink-0"
                style={{ color: m.color }}
              >
                {m.customAvatar ? (
                  <img
                    src={m.customAvatar}
                    alt={m.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  m.name.substring(0, 2)
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl text-white tracking-wider leading-none">
                    {m.name}
                  </h3>
                  {m.password && (
                    <Lock className="w-3 h-3 text-stencil" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[11px] text-stencil font-semibold">
                    {m.handle}
                  </span>
                  <span className="text-[10px] text-neutral-600">•</span>
                  <span
                    className="font-mono text-[10px] uppercase font-bold"
                    style={{ color: m.color }}
                  >
                    {m.role}
                  </span>
                </div>
              </div>
            </div>

            <UserCheck className="w-5 h-5 text-neutral-700 group-hover:text-acid transition-colors" />
          </button>
        ))}
      </div>

      {/* Visualizar Mode Public Entry */}
      {onEnterViewerMode && (
        <div className="w-full max-w-[340px] mt-4 pt-3 border-t border-neutral-800">
          <button
            type="button"
            onClick={onEnterViewerMode}
            className="w-full bg-concrete border-2 border-sprayCyan/70 hover:border-sprayCyan rounded-sm p-3 flex items-center justify-between shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-asphalt border border-sprayCyan/50 flex items-center justify-center text-sprayCyan group-hover:bg-sprayCyan group-hover:text-asphalt transition-colors shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-display text-lg text-white tracking-wider leading-none">VISUALIZAR</h4>
                  <span className="font-mono text-[8px] bg-sprayCyan/20 text-sprayCyan px-1.5 py-0.5 rounded-xs border border-sprayCyan/40 font-bold uppercase">
                    LIVRE
                  </span>
                </div>
                <p className="font-mono text-[10px] text-stencil mt-1">
                  Apenas ver fotos, vídeos e reagir com emojis
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-sprayCyan group-hover:translate-x-1 transition-transform shrink-0" />
          </button>
        </div>
      )}

      <div className="mt-6 text-center font-mono text-[11px] text-stencil/60">
        Clique no seu nome para entrar ou em Visualizar para acesso livre
      </div>

      {/* Password Prompt Modal */}
      {passwordTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handlePasswordSubmit}
            className="bg-bunker border border-neutral-700 p-6 rounded-sm shadow-2xl w-full max-w-[340px] relative"
          >
            <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-2">
              <h3 className="font-display text-2xl text-white tracking-wide">
                SENHA DE {passwordTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                className="w-8 h-8 rounded-sm bg-asphalt text-stencil hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="font-mono text-[10px] text-urbanOrange mb-4 tracking-wide uppercase">
              Digite a chave de acesso do seu vulgo
            </p>

            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-asphalt border-2 border-neutral-700 rounded-sm px-4 py-3 text-white mb-2 focus:border-acid focus:outline-none text-center tracking-[0.4em] font-mono text-lg"
            />

            {errorMsg && (
              <p className="font-mono text-xs text-red-400 mb-3 text-center">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-acid text-black font-display text-lg tracking-widest py-3 rounded-sm border border-black shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            >
              CONFIRMAR
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
