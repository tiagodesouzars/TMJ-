import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, SquadMember } from '../types';
import { QUICK_STICKERS } from '../constants/initialData';
import { 
  Send, 
  Mic, 
  Camera, 
  Square, 
  Trash2, 
  Play, 
  Pause, 
  Volume2
} from 'lucide-react';

interface ChatTabProps {
  messages: ChatMessage[];
  activeMember: SquadMember;
  onSendMessage: (text: string, options?: { isAudio?: boolean; audioUrl?: string; audioDuration?: number; mediaUrl?: string; mediaType?: 'photo' | 'video' }) => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  messages,
  activeMember,
  onSendMessage
}) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [playingMessageAudioId, setPlayingMessageAudioId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudioUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      setRecSeconds(0);
      setRecordedAudioUrl(null);

      timerIntervalRef.current = window.setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
  };

  const discardRecording = () => {
    stopRecording();
    setRecordedAudioUrl(null);
    setRecSeconds(0);
  };

  const sendRecordedAudio = () => {
    if (!recordedAudioUrl) return;
    onSendMessage(`🎤 Áudio (${formatTime(recSeconds)})`, {
      isAudio: true,
      audioUrl: recordedAudioUrl,
      audioDuration: recSeconds
    });
    setRecordedAudioUrl(null);
    setRecSeconds(0);
  };

  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const reader = new FileReader();
    reader.onload = () => {
      onSendMessage(isVideo ? '📹 Vídeo enviado' : '📷 Foto enviada', {
        mediaUrl: reader.result as string,
        mediaType: isVideo ? 'video' : 'photo'
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-210px)] px-3 pt-2">
      {/* Title */}
      <div className="mb-2 px-1 border-b border-neutral-800 border-dashed pb-2 flex items-center justify-between">
        <h2 className="font-display text-xl text-white uppercase tracking-wide">
          resenha ou morte
        </h2>
        <span className="font-mono text-[9px] text-stencil bg-bunker px-2 py-0.5 rounded-sm">
          CHAT DO TRIO
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-2">
        {messages.map((msg) => {
          const isMine = msg.authorId === activeMember.id;
          const isAudioPlaying = playingMessageAudioId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 max-w-[88%] ${
                isMine ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              {/* Avatar badge */}
              <div
                className="w-7 h-7 rounded-sm bg-bunker border border-neutral-700 flex items-center justify-center font-display text-xs shrink-0 font-bold"
                style={{ color: msg.authorColor || '#ccff00' }}
              >
                {msg.authorName.substring(0, 2)}
              </div>

              {/* Message bubble */}
              <div
                className={`p-3 rounded-sm border ${
                  isMine
                    ? 'bg-concrete border-neutral-700 text-white shadow-md'
                    : 'bg-bunker border-neutral-800 text-white'
                }`}
                style={isMine ? { borderRightColor: msg.authorColor || '#ccff00', borderRightWidth: '3px' } : { borderLeftColor: msg.authorColor || '#ccff00', borderLeftWidth: '3px' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="font-display text-xs tracking-wider"
                    style={{ color: msg.authorColor || '#ccff00' }}
                  >
                    {msg.authorName}
                  </span>
                  <span className="font-mono text-[9px] text-stencil">
                    {msg.timestamp}
                  </span>
                </div>

                {/* Media Image / Video Attachment */}
                {msg.mediaUrl && (
                  <div className="mb-2 rounded-sm overflow-hidden bg-black max-h-56">
                    {msg.mediaType === 'video' ? (
                      <video src={msg.mediaUrl} controls className="max-h-56 w-full object-cover" />
                    ) : (
                      <img src={msg.mediaUrl} alt="Chat media" className="max-h-56 w-full object-cover" />
                    )}
                  </div>
                )}

                {/* Audio Voice Note Player */}
                {msg.isAudio && msg.audioUrl ? (
                  <div className="flex items-center gap-2 bg-asphalt p-2 rounded-sm border border-neutral-800 mt-1">
                    <button
                      onClick={() => {
                        const audio = document.getElementById(`audio-chat-${msg.id}`) as HTMLAudioElement;
                        if (audio) {
                          if (audio.paused) {
                            audio.play().catch(() => null);
                            setPlayingMessageAudioId(msg.id);
                          } else {
                            audio.pause();
                            setPlayingMessageAudioId(null);
                          }
                        }
                      }}
                      className="w-8 h-8 rounded-sm bg-acid text-black flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {isAudioPlaying ? (
                        <Pause className="w-4 h-4 fill-black" />
                      ) : (
                        <Play className="w-4 h-4 fill-black ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-stencil mb-0.5">
                        <span className="flex items-center gap-1">
                          <Volume2 className="w-3 h-3 text-acid" />
                          Nota de voz
                        </span>
                        <span>{msg.audioDuration ? formatTime(msg.audioDuration) : '00:05'}</span>
                      </div>
                      <div className="h-1.5 bg-neutral-800 rounded-xs overflow-hidden">
                        <div
                          className={`h-full bg-acid ${isAudioPlaying ? 'animate-pulse' : ''}`}
                          style={{ width: isAudioPlaying ? '100%' : '35%' }}
                        ></div>
                      </div>
                    </div>
                    <audio
                      id={`audio-chat-${msg.id}`}
                      src={msg.audioUrl}
                      onEnded={() => setPlayingMessageAudioId(null)}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <p className="font-sans text-xs leading-relaxed text-chalk break-words">
                    {msg.text}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Gírias / Quick Stickers */}
      <div className="py-2 flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar border-t border-neutral-800 relative z-20">
        {QUICK_STICKERS.map((sticker, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSendMessage(sticker)}
            className="shrink-0 bg-concrete border border-neutral-700 hover:border-acid text-chalk font-mono text-[10px] px-3 py-1.5 rounded-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            {sticker}
          </button>
        ))}
      </div>

      {/* Input Section */}
      <div className="bg-concrete border-2 border-neutral-800 rounded-sm p-2 mb-2">
        {/* State 1: Normal Bar */}
        {!isRecording && !recordedAudioUrl && (
          <div className="flex items-center gap-2">
            <label className="w-9 h-9 rounded-sm bg-bunker hover:bg-neutral-700 text-acid flex items-center justify-center cursor-pointer shrink-0 border border-neutral-700">
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileAttachment}
              />
            </label>

            <input
              type="text"
              placeholder="Manda o papo..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendText();
              }}
              className="flex-1 bg-asphalt border border-neutral-800 rounded-sm px-3 py-2 text-xs text-white focus:outline-none focus:border-acid font-mono"
            />

            <button
              type="button"
              onClick={startRecording}
              title="Gravar áudio"
              className="w-9 h-9 rounded-sm bg-bunker hover:bg-neutral-700 text-sprayCyan flex items-center justify-center shrink-0 border border-neutral-700 cursor-pointer"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleSendText}
              className="w-9 h-9 rounded-sm bg-acid text-black flex items-center justify-center shrink-0 font-bold shadow-[2px_2px_0px_#ff5500] active:translate-y-0.5 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* State 2: Recording Active */}
        {isRecording && (
          <div className="flex items-center justify-between bg-asphalt p-2 rounded-sm border border-red-500/50">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
              <span className="font-mono text-xs text-red-400 font-bold uppercase">
                GRAVANDO: {formatTime(recSeconds)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardRecording}
                className="text-stencil hover:text-red-400 p-1 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="bg-red-500 text-white font-mono text-xs px-3 py-1 rounded-sm flex items-center gap-1 cursor-pointer font-bold"
              >
                <Square className="w-3 h-3 fill-white" />
                PARAR
              </button>
            </div>
          </div>
        )}

        {/* State 3: Recorded Audio Preview Ready */}
        {!isRecording && recordedAudioUrl && (
          <div className="flex items-center justify-between bg-asphalt p-2 rounded-sm border border-acid">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-acid"></span>
              <span className="font-mono text-xs text-acid font-bold">
                ÁUDIO PRONTO ({formatTime(recSeconds)})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardRecording}
                className="text-stencil hover:text-red-400 p-1 cursor-pointer"
                title="Descartar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={sendRecordedAudio}
                className="bg-acid text-black font-display text-xs tracking-wider px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer font-bold shadow-[2px_2px_0px_#000]"
              >
                <Send className="w-3 h-3" />
                ENVIAR ÁUDIO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
