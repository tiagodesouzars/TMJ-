import React, { useState } from 'react';
import { SquadMember } from '../types';
import { X, Save, Shield } from 'lucide-react';

interface SquadModalProps {
  members: SquadMember[];
  onClose: () => void;
  onUpdateSquad: (updatedMembers: SquadMember[]) => void;
}

export const SquadModal: React.FC<SquadModalProps> = ({
  members,
  onClose,
  onUpdateSquad
}) => {
  const [formData, setFormData] = useState<SquadMember[]>(JSON.parse(JSON.stringify(members)));
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleFieldChange = (index: number, field: keyof SquadMember, value: string) => {
    setFormData((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAvatarFile = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      handleFieldChange(index, 'customAvatar', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSquad(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none overflow-y-auto">
      <div className="bg-bunker border-2 border-neutral-700 w-full max-w-[420px] rounded-sm p-4 relative shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-acid" />
            <h3 className="font-display text-2xl text-white tracking-wide uppercase">
              SQUAD ID // TRIO TMJ
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

        <p className="font-mono text-[10px] text-stencil mb-4">
          Personalize vulgos, funções streetwear e avatares dos 3 integrantes.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          {formData.map((member, idx) => (
            <div
              key={member.id}
              className="bg-asphalt p-3 rounded-sm border border-neutral-800 space-y-2 relative"
              style={{ borderLeftColor: member.color, borderLeftWidth: '4px' }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-sm tracking-wider" style={{ color: member.color }}>
                  INTEGRANTE #{idx + 1}
                </span>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-mono text-stencil cursor-pointer hover:text-acid flex items-center gap-1">
                    <span>Mudar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarFile(idx, e)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-mono text-[9px] text-neutral-500 uppercase">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                    className="w-full bg-concrete border border-neutral-700 rounded-sm px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-acid"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[9px] text-neutral-500 uppercase">
                    Vulgo (@)
                  </label>
                  <input
                    type="text"
                    value={member.handle}
                    onChange={(e) => handleFieldChange(idx, 'handle', e.target.value)}
                    className="w-full bg-concrete border border-neutral-700 rounded-sm px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-acid"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] text-neutral-500 uppercase">
                  Função Streetwear
                </label>
                <input
                  type="text"
                  value={member.role}
                  onChange={(e) => handleFieldChange(idx, 'role', e.target.value)}
                  className="w-full bg-concrete border border-neutral-700 rounded-sm px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-acid"
                />
              </div>
            </div>
          ))}

          {savedSuccess && (
            <div className="text-center font-mono text-xs text-acid font-bold animate-pulse">
              ✓ SQUAD ATUALIZADO COM SUCESSO!
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-concrete border border-neutral-700 text-stencil py-2.5 rounded-sm font-mono text-xs hover:text-white cursor-pointer"
            >
              FECHAR
            </button>
            <button
              type="submit"
              className="flex-1 bg-acid text-black font-display text-sm tracking-wider py-2.5 rounded-sm border border-black shadow-[3px_3px_0px_#ff5500] active:translate-y-0.5 cursor-pointer font-bold flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              SALVAR SQUAD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
