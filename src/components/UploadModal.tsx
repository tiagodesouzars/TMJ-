import React, { useState } from 'react';
import { SquadMember } from '../types';
import { DROP_TAGS } from '../constants/initialData';
import { X, Upload, Image, Video, Music, Loader2 } from 'lucide-react';
import { uploadFileToCloudStorage } from '../utils/mediaStorage';

interface UploadModalProps {
  activeMember: SquadMember;
  onClose: () => void;
  onUploadDrop: (drop: {
    type: 'photo' | 'video' | 'audio';
    title: string;
    caption: string;
    tag: string;
    url: string;
    midiaUrl?: string;
  }) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  activeMember,
  onClose,
  onUploadDrop
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'video' | 'audio'>('photo');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedTag, setSelectedTag] = useState(DROP_TAGS[0]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [previewError, setPreviewError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    if (file.type.startsWith('video')) {
      setMediaType('video');
    } else if (file.type.startsWith('audio')) {
      setMediaType('audio');
    } else {
      setMediaType('photo');
    }

    // Local object URL for instant preview without Base64 strings
    const localPreview = URL.createObjectURL(file);
    setMediaUrl(localPreview);
  };

  const handlePresetSelect = (presetType: 'photo' | 'video' | 'audio') => {
    setMediaType(presetType);
    setSelectedFile(null);
    if (presetType === 'photo') {
      setMediaUrl('https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=800');
      setTitle('NEW LOOK // CARGO & HOODIE');
      setSelectedTag('#Fit Check 🔥');
    } else if (presetType === 'video') {
      setMediaUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
      setTitle('STREET SKATE SESSION');
      setSelectedTag('#Rolê 🛹');
    } else {
      setMediaUrl('https://cdn.freesound.org/previews/563/563768_11861866-lq.mp3');
      setTitle('BEAT 808 // TRAP BOOM BAP');
      setSelectedTag('#Beat/Áudio 🔊');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setPreviewError('Digite um título para o drop!');
      return;
    }
    if (!mediaUrl && !selectedFile) {
      setPreviewError('Selecione uma foto, vídeo ou áudio!');
      return;
    }

    setIsUploading(true);
    setUploadPercent(5);
    setUploadStatus('Preparando upload para o Supabase Storage...');

    try {
      let finalDownloadUrl = mediaUrl;

      // Upload file directly to Supabase Storage if a file was selected
      if (selectedFile) {
        finalDownloadUrl = await uploadFileToCloudStorage(
          selectedFile,
          'tmj_vault',
          undefined,
          (status, pct) => {
            setUploadStatus(status);
            if (pct !== undefined) setUploadPercent(pct);
          }
        );
      }

      setUploadPercent(100);
      setUploadStatus('Publicado com sucesso no Supabase!');

      onUploadDrop({
        type: mediaType,
        title: title.trim(),
        caption: caption.trim(),
        tag: selectedTag,
        url: finalDownloadUrl,
        midiaUrl: finalDownloadUrl
      });

      setIsUploading(false);
      onClose();
    } catch (err: any) {
      console.error('Erro no upload para Supabase Storage:', err);
      setIsUploading(false);
      setUploadPercent(0);
      setPreviewError('Erro no upload para o Supabase: ' + (err?.message || 'Tente novamente'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none overflow-y-auto">
      <div className="bg-bunker border-2 border-neutral-700 w-full max-w-[420px] rounded-sm p-4 relative shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-acid"></span>
            <h3 className="font-display text-2xl text-white tracking-wide uppercase">
              NOVO DROP NO VAULT
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

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Author Badge */}
          <div className="flex items-center justify-between bg-asphalt p-2 rounded-sm border border-neutral-800 text-xs font-mono">
            <span className="text-stencil">DROPANDO COMO:</span>
            <span className="font-bold flex items-center gap-1.5" style={{ color: activeMember.color }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeMember.color }}></span>
              {activeMember.name} ({activeMember.handle})
            </span>
          </div>

          {/* Media Type Selector */}
          <div>
            <label className="block font-mono text-[10px] text-stencil uppercase mb-1">
              TIPO DE MÍDIA
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'photo', label: 'FOTO', icon: Image },
                { id: 'video', label: 'VÍDEO', icon: Video },
                { id: 'audio', label: 'BEAT', icon: Music },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = mediaType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMediaType(m.id as typeof mediaType)}
                    className={`py-2 px-2 rounded-sm font-mono text-xs flex items-center justify-center gap-1.5 border cursor-pointer ${
                      isSelected
                        ? 'bg-acid text-black border-acid font-bold shadow-sm'
                        : 'bg-concrete text-stencil border-neutral-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media Input / Upload Area */}
          <div>
            <label className="block font-mono text-[10px] text-stencil uppercase mb-1">
              ARQUIVO OU PRESET
            </label>
            <div className="border-2 border-dashed border-neutral-700 hover:border-acid rounded-sm p-4 text-center bg-asphalt transition-colors relative">
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="w-6 h-6 text-acid mx-auto mb-1.5" />
              <p className="font-display text-xs text-white tracking-wider">
                CLIQUE PARA SELECIONAR DO APARELHO
              </p>
              <p className="font-mono text-[9px] text-stencil mt-0.5">
                Fotos (JPG/PNG), Vídeos (MP4) ou Beats (MP3/WAV)
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 mt-1.5 text-[9px] font-mono text-stencil">
              <span>Presets:</span>
              <button
                type="button"
                onClick={() => handlePresetSelect('photo')}
                className="text-acid hover:underline cursor-pointer"
              >
                + Foto Street
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => handlePresetSelect('video')}
                className="text-sprayCyan hover:underline cursor-pointer"
              >
                + Vídeo Skate
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => handlePresetSelect('audio')}
                className="text-urbanOrange hover:underline cursor-pointer"
              >
                + Beat 808
              </button>
            </div>
          </div>

          {/* Media Preview Box */}
          {mediaUrl && (
            <div className="bg-asphalt border border-neutral-800 p-2 rounded-sm">
              <div className="text-[10px] font-mono text-stencil mb-1">PRÉ-VISUALIZAÇÃO:</div>
              {mediaType === 'photo' && (
                <img src={mediaUrl} alt="Preview" className="max-h-36 w-full object-cover rounded-xs" />
              )}
              {mediaType === 'video' && (
                <video src={mediaUrl} controls className="max-h-36 w-full object-cover rounded-xs" />
              )}
              {mediaType === 'audio' && (
                <div className="p-3 bg-concrete flex items-center gap-2 rounded-xs">
                  <Music className="w-5 h-5 text-acid" />
                  <span className="font-mono text-xs text-white">Áudio / Beat 808 Carregado</span>
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block font-mono text-[10px] text-stencil uppercase mb-1">
              TÍTULO DO DROP *
            </label>
            <input
              type="text"
              placeholder="Ex: FIT CHECK HOODIE // ROOFTOP"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-asphalt border border-neutral-700 rounded-sm px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-acid"
            />
          </div>

          {/* Tag Selector */}
          <div>
            <label className="block font-mono text-[10px] text-stencil uppercase mb-1">
              TAG STREETWEAR
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DROP_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTag(t)}
                  className={`px-2.5 py-1 rounded-sm text-[10px] font-mono border cursor-pointer ${
                    selectedTag === t
                      ? 'bg-acid text-black border-acid font-bold'
                      : 'bg-asphalt text-stencil border-neutral-800 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block font-mono text-[10px] text-stencil uppercase mb-1">
              DETALHES / RESENHA DO DROP
            </label>
            <textarea
              rows={2}
              placeholder="Marca das peças, local do rolê, notas da batida..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-asphalt border border-neutral-700 rounded-sm px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-acid resize-none"
            ></textarea>
          </div>

          {previewError && (
            <p className="font-mono text-xs text-red-400">{previewError}</p>
          )}

          {/* Actions & Real-time Progress Bar */}
          {isUploading && (
            <div className="p-3 bg-asphalt rounded-sm border border-acid/60 space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-acid font-bold flex items-center gap-1.5 truncate pr-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>{uploadStatus || 'Enviando para o Supabase Storage...'}</span>
                </span>
                <span className="text-chalk font-mono font-bold tabular-nums shrink-0">
                  {uploadPercent}%
                </span>
              </div>
              <div className="w-full bg-concrete rounded-full h-2 overflow-hidden border border-neutral-700">
                <div
                  className="bg-acid h-full transition-all duration-200 ease-out shadow-[0_0_8px_#ccff00]"
                  style={{ width: `${Math.max(5, uploadPercent)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="flex-1 bg-concrete border border-neutral-700 text-stencil py-2.5 rounded-sm font-mono text-xs hover:text-white cursor-pointer disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="flex-1 bg-acid text-black font-display text-sm tracking-wider py-2.5 rounded-sm border border-black shadow-[3px_3px_0px_#ff5500] active:translate-y-0.5 cursor-pointer font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>ENVIANDO...</span>
                </>
              ) : (
                <span>PUBLICAR DROP</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
