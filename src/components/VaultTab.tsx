import React, { useState } from 'react';
import { VaultDrop, SquadMember } from '../types';
import { 
  Play, 
  Pause, 
  Heart, 
  MessageSquare, 
  Trash2, 
  Tag, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music, 
  Send,
  Maximize2,
  X
} from 'lucide-react';
import { toggleBeatPlayback } from '../utils/audioSynth';
import { StreetVideoPlayer } from './StreetVideoPlayer';
import { MediaReactions } from './MediaReactions';

interface VaultTabProps {
  drops: VaultDrop[];
  activeMember: SquadMember;
  onDeleteDrop: (id: string) => void;
  onAddComment: (dropId: string, commentText: string) => void;
  onLikeDrop: (dropId: string) => void;
  onToggleReaction?: (dropId: string, emoji: string) => void;
  isViewerMode?: boolean;
}

export const VaultTab: React.FC<VaultTabProps> = ({
  drops,
  activeMember,
  onDeleteDrop,
  onAddComment,
  onLikeDrop,
  onToggleReaction,
  isViewerMode = false
}) => {
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'video' | 'audio'>('all');
  const [viewMode, setViewMode] = useState<'feed' | 'grid'>('feed');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: string; title: string } | null>(null);

  const filteredDrops = drops.filter((d) => {
    if (filterType === 'all') return true;
    return d.type === filterType;
  });

  const handleAudioToggle = (dropId: string, url: string) => {
    if (playingAudioId === dropId) {
      toggleBeatPlayback(() => setPlayingAudioId(null));
      setPlayingAudioId(null);
    } else {
      if (url.startsWith('data:audio/wav;base64,UklGRiQAAABXQVZF')) {
        toggleBeatPlayback((playing) => {
          if (!playing) setPlayingAudioId(null);
        });
        setPlayingAudioId(dropId);
      } else {
        const audioEl = document.getElementById(`audio-el-${dropId}`) as HTMLAudioElement;
        if (audioEl) {
          if (audioEl.paused) {
            audioEl.play().catch(() => null);
            setPlayingAudioId(dropId);
          } else {
            audioEl.pause();
            setPlayingAudioId(null);
          }
        } else {
          toggleBeatPlayback((playing) => {
            if (!playing) setPlayingAudioId(null);
          });
          setPlayingAudioId(dropId);
        }
      }
    }
  };

  const submitComment = (dropId: string) => {
    const text = commentInputs[dropId]?.trim();
    if (!text) return;
    onAddComment(dropId, text);
    setCommentInputs((prev) => ({ ...prev, [dropId]: '' }));
  };

  return (
    <div className="flex-1 flex flex-col px-3 pt-3 pb-24">
      {/* Title & Stats */}
      <div className="flex items-center justify-between mb-3 px-1 border-b border-neutral-800 border-dashed pb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl text-white uppercase tracking-wide">
            mídia dos guri
          </h2>
          <span className="font-mono text-[10px] text-sprayCyan border border-sprayCyan/30 bg-sprayCyan/10 px-2 py-0.5 rounded-sm font-bold">
            {drops.length} DROPS
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-bunker p-0.5 rounded-sm border border-neutral-800">
          <button
            onClick={() => setViewMode('feed')}
            className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer ${
              viewMode === 'feed' ? 'bg-concrete text-acid font-bold' : 'text-stencil'
            }`}
          >
            FEED
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer ${
              viewMode === 'grid' ? 'bg-concrete text-acid font-bold' : 'text-stencil'
            }`}
          >
            GRADE
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all', label: 'TODOS', icon: null },
          { id: 'photo', label: 'FOTOS', icon: ImageIcon },
          { id: 'video', label: 'VÍDEOS', icon: VideoIcon },
          { id: 'audio', label: 'BEATS & ÁUDIO', icon: Music },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = filterType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as typeof filterType)}
              className={`px-3 py-1.5 rounded-sm font-mono text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-acid text-black font-bold shadow-[2px_2px_0px_#ff5500]'
                  : 'bg-concrete text-stencil hover:text-white border border-neutral-800'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredDrops.length === 0 && (
        <div className="text-center py-16 bg-concrete border-2 border-dashed border-neutral-800 rounded-sm">
          <div className="w-12 h-12 mx-auto rounded-full bg-asphalt flex items-center justify-center text-stencil mb-3">
            <Tag className="w-6 h-6" />
          </div>
          <p className="font-display text-xl text-white tracking-wider mb-1">
            NENHUM DROP NESSA CATEGORIA
          </p>
          <p className="font-mono text-xs text-stencil">
            Use o botão central <span className="text-acid font-bold">+ DROP</span> para subir a primeira mídia!
          </p>
        </div>
      )}

      {/* GRID VIEW */}
      {viewMode === 'grid' && filteredDrops.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {filteredDrops.map((item) => (
            <div
              key={item.id}
              onClick={() => setPreviewMedia({ url: item.midiaUrl || item.url, type: item.type, title: item.title })}
              className="bg-concrete border border-neutral-800 rounded-sm overflow-hidden aspect-square relative group cursor-pointer"
            >
              {item.type === 'photo' && (
                <img
                  src={item.midiaUrl || item.url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              )}
              {item.type === 'video' && (
                <div className="w-full h-full bg-asphalt flex items-center justify-center relative">
                  <video src={item.midiaUrl || item.url} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <VideoIcon className="w-8 h-8 text-acid" />
                  </div>
                </div>
              )}
              {item.type === 'audio' && (
                <div className="w-full h-full bg-bunker flex flex-col items-center justify-center p-3 text-center">
                  <Music className="w-8 h-8 text-urbanOrange mb-2" />
                  <span className="font-mono text-[10px] text-white truncate max-w-full">
                    {item.title}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                <p className="font-display text-xs text-white truncate">{item.title}</p>
                <span className="font-mono text-[9px] text-acid">{item.authorName}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FEED LOOKBOOK VIEW */}
      {viewMode === 'feed' && (
        <div className="space-y-6">
          {filteredDrops.map((item) => {
            const isMine = !isViewerMode && item.authorId === activeMember.id;
            const isAudioPlaying = playingAudioId === item.id;

            return (
              <article
                key={item.id}
                className="bg-concrete border-2 border-neutral-800 rounded-sm overflow-hidden shadow-xl"
              >
                {/* Author Bar */}
                <div className="p-3 bg-asphalt/80 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-sm bg-bunker border border-neutral-700 flex items-center justify-center font-display text-sm font-bold"
                      style={{ color: item.authorColor || '#ccff00' }}
                    >
                      {item.authorName.substring(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm text-white tracking-wide">
                          {item.authorName}
                        </span>
                        <span className="font-mono text-[10px] text-stencil">
                          {item.authorHandle}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-neutral-500">
                        {item.createdAt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-bunker border border-neutral-700 text-chalk px-2 py-0.5 rounded-sm">
                      {item.tag}
                    </span>
                    {isMine && (
                      <button
                        onClick={() => onDeleteDrop(item.id)}
                        title="Deletar drop"
                        className="text-neutral-600 hover:text-red-400 p-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Media Presentation */}
                {item.type === 'photo' && (
                  <div className="relative group bg-black max-h-[460px] overflow-hidden flex items-center justify-center">
                    <img
                      src={item.midiaUrl || item.url}
                      alt={item.title}
                      className="w-full max-h-[460px] object-contain"
                    />
                    <button
                      onClick={() => setPreviewMedia({ url: item.midiaUrl || item.url, type: 'photo', title: item.title })}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-1.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {item.type === 'video' && (
                  <div className="relative bg-black">
                    <StreetVideoPlayer
                      src={item.midiaUrl || item.url}
                      className="w-full"
                      onFullscreenRequest={() => setPreviewMedia({ url: item.midiaUrl || item.url, type: 'video', title: item.title })}
                    />
                  </div>
                )}

                {item.type === 'audio' && (
                  <div className="p-4 bg-bunker border-y border-neutral-800">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleAudioToggle(item.id, item.midiaUrl || item.url)}
                        className="w-12 h-12 rounded-sm bg-acid text-black flex items-center justify-center shadow-[3px_3px_0px_#ff5500] active:translate-y-0.5 transition-all cursor-pointer shrink-0"
                      >
                        {isAudioPlaying ? (
                          <Pause className="w-6 h-6 fill-black" />
                        ) : (
                          <Play className="w-6 h-6 fill-black ml-0.5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-display text-sm text-white tracking-wider truncate">
                            {item.title}
                          </span>
                          <span className="font-mono text-[10px] text-acid">
                            {isAudioPlaying ? 'PLAYING 808' : '92 BPM'}
                          </span>
                        </div>

                        {/* Animated Waveform */}
                        <div className="h-6 flex items-center gap-1 bg-asphalt p-1 rounded-sm border border-neutral-800">
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-xs transition-all duration-150 ${
                                isAudioPlaying ? 'bg-acid' : 'bg-neutral-700'
                              }`}
                              style={{
                                height: isAudioPlaying
                                  ? `${Math.max(20, Math.sin(i * 0.8 + Date.now() / 200) * 100)}%`
                                  : `${20 + (i % 5) * 12}%`
                              }}
                            ></div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {!item.url.startsWith('data:audio/wav;base64,UklGRiQAAABXQVZF') && (
                      <audio
                        id={`audio-el-${item.id}`}
                        src={item.url}
                        onEnded={() => setPlayingAudioId(null)}
                        className="hidden"
                      />
                    )}
                  </div>
                )}

                {/* Details & Caption */}
                <div className="p-3">
                  <h3 className="font-display text-lg text-white tracking-wider mb-1">
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="font-sans text-xs text-stencil leading-relaxed mb-3">
                      {item.caption}
                    </p>
                  )}

                  {/* Actions Row */}
                  <div className="flex items-center justify-between border-t border-neutral-800/80 pt-2 mb-2">
                    <button
                      onClick={() => onLikeDrop(item.id)}
                      className="flex items-center gap-1.5 text-stencil hover:text-urbanOrange font-mono text-xs cursor-pointer group"
                    >
                      <Heart className="w-4 h-4 text-urbanOrange group-hover:scale-110 transition-transform fill-urbanOrange/20" />
                      <span>{item.likes || 0} RESPEITO</span>
                    </button>

                    <span className="font-mono text-[11px] text-stencil flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{item.comments?.length || 0} comentários</span>
                    </span>
                  </div>

                  {/* Street Emoji Reactions System */}
                  <div className="pt-1 pb-3 border-b border-neutral-800/80 mb-3">
                    <MediaReactions
                      reactions={item.reactions}
                      reactedBy={item.reactedBy}
                      currentUserId={activeMember.id}
                      onToggleReaction={(emoji) => onToggleReaction?.(item.id, emoji)}
                    />
                  </div>

                  {/* Comments thread */}
                  {item.comments && item.comments.length > 0 && (
                    <div className="space-y-1.5 mb-3 bg-asphalt/60 p-2.5 rounded-sm border border-neutral-850">
                      {item.comments.map((c, i) => (
                        <div key={i} className="text-xs font-mono flex items-start gap-1.5">
                          <span className="font-bold shrink-0" style={{ color: c.color }}>
                            {c.author}:
                          </span>
                          <span className="text-chalk flex-1">{c.text}</span>
                          <span className="text-[9px] text-neutral-600 shrink-0">{c.time}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comment Input */}
                  {!isViewerMode ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Mandar comentário..."
                        value={commentInputs[item.id] || ''}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitComment(item.id);
                        }}
                        className="flex-1 bg-asphalt border border-neutral-800 rounded-sm px-3 py-1.5 text-xs text-white focus:outline-none focus:border-acid font-mono"
                      />
                      <button
                        onClick={() => submitComment(item.id)}
                        className="bg-bunker hover:bg-neutral-700 text-acid px-3 py-1.5 rounded-sm border border-neutral-700 font-mono text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="bg-asphalt/60 border border-neutral-800 rounded-xs py-1.5 px-2.5 text-center">
                      <p className="font-mono text-[10px] text-stencil">
                        Modo Espectador: comentários restritos ao trio. Reaja com os emojis acima!
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <button
            onClick={() => setPreviewMedia(null)}
            className="absolute top-4 right-4 bg-bunker text-white w-10 h-10 rounded-sm flex items-center justify-center hover:bg-neutral-700 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-2xl max-h-[80vh] flex flex-col items-center">
            {previewMedia.type === 'photo' && (
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                className="max-w-full max-h-[70vh] object-contain rounded-sm"
              />
            )}
            {previewMedia.type === 'video' && (
              <StreetVideoPlayer
                src={previewMedia.url}
                autoPlay
                className="w-full max-h-[70vh] rounded-sm"
              />
            )}
            <p className="font-display text-xl text-white mt-4 tracking-wider">
              {previewMedia.title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
