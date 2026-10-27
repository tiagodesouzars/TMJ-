import React, { useState } from 'react';
import { X, Check, Copy, Database, ShieldCheck, Mail } from 'lucide-react';

interface ProjectInfoModalProps {
  onClose: () => void;
  isDbConnected: boolean;
}

export const ProjectInfoModal: React.FC<ProjectInfoModalProps> = ({
  onClose,
  isDbConnected
}) => {
  const [copied, setCopied] = useState(false);

  const rulesText = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /tmj_members/{memberId} {
      allow read, write: if true;
    }
    match /tmj_vault/{dropId} {
      allow read, write: if true;
    }
    match /tmj_chat/{messageId} {
      allow read, write: if true;
    }
  }
}`;

  const copyRules = () => {
    navigator.clipboard.writeText(rulesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none overflow-y-auto">
      <div className="bg-bunker border-2 border-neutral-700 w-full max-w-[440px] rounded-sm p-4 relative shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-acid" />
            <h3 className="font-display text-2xl text-white tracking-wide uppercase">
              STATUS DO BACKEND // FIREBASE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-sm bg-asphalt text-stencil hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Project Details Cards */}
        <div className="space-y-2 mb-4 font-mono text-xs">
          <div className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 flex justify-between items-center">
            <span className="text-stencil uppercase text-[10px]">Nome do Projeto:</span>
            <span className="font-bold text-white">trioTMJ</span>
          </div>

          <div className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 flex justify-between items-center">
            <span className="text-stencil uppercase text-[10px]">ID do Projeto:</span>
            <span className="font-bold text-acid">triotmj-3187e</span>
          </div>

          <div className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 flex justify-between items-center">
            <span className="text-stencil uppercase text-[10px]">Número do Projeto:</span>
            <span className="font-bold text-sprayCyan">753227233872</span>
          </div>

          <div className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 flex justify-between items-center">
            <span className="text-stencil uppercase text-[10px] flex items-center gap-1">
              <Mail className="w-3 h-3 text-urbanOrange" />
              Conta Vinculada:
            </span>
            <span className="font-bold text-white text-[11px]">tiagodesouzars@gmail.com</span>
          </div>

          <div className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 flex justify-between items-center">
            <span className="text-stencil uppercase text-[10px]">Conexão Firestore:</span>
            <span className="flex items-center gap-1.5 font-bold">
              <span
                className={`w-2 h-2 rounded-full ${
                  isDbConnected ? 'bg-acid animate-pulse' : 'bg-urbanOrange'
                }`}
              ></span>
              <span className={isDbConnected ? 'text-acid' : 'text-urbanOrange'}>
                {isDbConnected ? 'ONLINE & SINCRONIZADO' : 'MODO LOCAL / OFFLINE'}
              </span>
            </span>
          </div>
        </div>

        {/* Security Rules Preview */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1 text-[10px] font-mono text-stencil">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-acid" />
              FIRESTORE SECURITY RULES
            </span>
            <button
              onClick={copyRules}
              className="text-acid hover:underline flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'COPIADO!' : 'COPIAR REGRAS'}</span>
            </button>
          </div>
          <pre className="bg-asphalt p-2.5 rounded-sm border border-neutral-800 font-mono text-[9px] text-stencil max-h-32 overflow-y-auto leading-relaxed">
            {rulesText}
          </pre>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-concrete border border-neutral-700 hover:border-acid text-white font-mono text-xs py-2 rounded-sm cursor-pointer"
        >
          FECHAR PAINEL
        </button>
      </div>
    </div>
  );
};
