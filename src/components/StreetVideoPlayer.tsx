import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw
} from 'lucide-react';

interface StreetVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  aspectRatio?: string;
  onFullscreenRequest?: () => void;
  dropId?: string;
  isChunked?: boolean;
}

export const StreetVideoPlayer: React.FC<StreetVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = false,
  loop = false,
  aspectRatio,
  onFullscreenRequest,
  dropId,
  isChunked
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showCenterFeedback, setShowCenterFeedback] = useState<boolean>(false);

  // Dynamic aspect ratio detection for adaptive box
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [formatTag, setFormatTag] = useState<string>('NATIVO');

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        triggerCenterFeedback();
      }).catch(() => null);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      triggerCenterFeedback();
      setShowControls(true);
    }
  };

  const triggerCenterFeedback = () => {
    setShowCenterFeedback(true);
    setTimeout(() => setShowCenterFeedback(false), 500);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Video loaded metadata: detect exact width & height and adapt container box
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);

    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    if (vw && vh) {
      const ratio = vw / vh;
      setVideoAspect(ratio);

      if (vh > vw * 1.25) {
        setFormatTag('VERTICAL 9:16');
      } else if (vw > vh * 1.35) {
        setFormatTag('WIDESCREEN 16:9');
      } else if (Math.abs(vw - vh) < 30) {
        setFormatTag('QUADRADO 1:1');
      } else {
        setFormatTag('4:3');
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const handleVolumeToggle = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(0.8);
      videoRef.current.volume = 0.8;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (onFullscreenRequest) {
      onFullscreenRequest();
      return;
    }

    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {
        if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
          (videoRef.current as any).webkitEnterFullscreen();
        }
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => null);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleUserActivity = () => {
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    if (isPlaying) {
      hideControlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) {
        window.clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const resolvedAspect = aspectRatio || (videoAspect ? `${videoAspect}` : undefined);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`relative group bg-black/95 overflow-hidden select-none border border-bunker flex items-center justify-center w-full transition-all duration-200 ${className}`}
      style={{
        aspectRatio: resolvedAspect,
        maxHeight: 'min(75vh, 600px)'
      }}
    >
      {/* Video Element - object-contain ensures 100% of the video is visible without cropping */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        loop={loop}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
        onClick={handlePlayPause}
        className="w-full h-full object-contain cursor-pointer block mx-auto"
      />

      {/* Street Grain / Scanline Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-15 bg-linear-to-b from-transparent via-black/10 to-transparent"
        style={{ backgroundSize: '100% 4px' }}
      ></div>

      {/* Top Banner: VHS REC + Format Badge + Squad Tag */}
      <div 
        className={`absolute top-0 inset-x-0 p-2 sm:p-2.5 flex items-center justify-between z-20 pointer-events-none transition-opacity duration-200 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-1.5 bg-asphalt/90 backdrop-blur-xs border border-bunker px-2 py-0.5 rounded-xs">
          <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-red-500 animate-pulse' : 'bg-neutral-500'}`}></span>
          <span className="font-mono text-[9px] text-sprayCyan font-bold tracking-widest uppercase">
            REC ● {formatTag}
          </span>
        </div>

        <div className="bg-asphalt/90 backdrop-blur-xs border border-bunker px-2 py-0.5 rounded-xs">
          <span className="font-mono text-[9px] text-acid font-bold tracking-widest uppercase">
            † TMJ †
          </span>
        </div>
      </div>

      {/* Center Big Play/Pause Feedback Animation */}
      {(!isPlaying || showCenterFeedback) && (
        <div 
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center z-15 bg-black/25 cursor-pointer transition-opacity"
        >
          <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-sm bg-acid text-asphalt flex items-center justify-center shadow-[4px_4px_0px_var(--color-urbanOrange)] active:scale-95 transition-transform">
            {isPlaying ? (
              <Pause className="w-6 h-6 sm:w-8 sm:h-8 fill-asphalt" />
            ) : (
              <Play className="w-6 h-6 sm:w-8 sm:h-8 fill-asphalt ml-1" />
            )}
          </div>
        </div>
      )}

      {/* Street Video Bottom Control Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/85 to-transparent px-3 pt-6 pb-2.5 z-20 transition-all duration-200 ${
          showControls || !isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        {/* Scrubber Progress Bar */}
        <div className="relative mb-2 flex items-center group/scrubber cursor-pointer">
          <div className="w-full h-1.5 sm:h-2 bg-bunker rounded-xs overflow-hidden relative">
            <div 
              className="h-full bg-acid transition-[width] duration-75 relative"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-urbanOrange shadow-[0_0_8px_var(--color-acid)]"></div>
            </div>
          </div>
          
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between text-chalk font-mono text-[11px]">
          {/* Left: Play/Pause, Rewind, Time Display */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handlePlayPause}
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
              className="w-7 h-7 bg-concrete border border-bunker hover:border-acid text-acid hover:text-white rounded-xs flex items-center justify-center transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  setCurrentTime(0);
                }
              }}
              title="Reiniciar vídeo"
              className="w-7 h-7 bg-concrete border border-bunker hover:border-stencil text-stencil hover:text-chalk rounded-xs flex items-center justify-center transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="font-mono text-[10px] text-stencil tracking-wider flex items-center gap-1">
              <span className="text-acid font-bold">{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Volume & Fullscreen */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 group/vol">
              <button
                type="button"
                onClick={handleVolumeToggle}
                title={isMuted ? 'Desmutar' : 'Mutar'}
                className="w-7 h-7 bg-concrete border border-bunker hover:border-stencil text-stencil hover:text-chalk rounded-xs flex items-center justify-center transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-urbanOrange" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-chalk" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-12 sm:w-16 accent-acid h-1 bg-bunker rounded-xs cursor-pointer hidden sm:block"
              />
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="w-7 h-7 bg-concrete border border-bunker hover:border-acid text-stencil hover:text-acid rounded-xs flex items-center justify-center transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5" />
              ) : (
                <Maximize className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
