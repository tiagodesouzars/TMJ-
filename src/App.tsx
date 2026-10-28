import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { 
  Camera, 
  Mic, 
  Send, 
  Trash2, 
  Play, 
  Pause, 
  X, 
  Plus, 
  Layers, 
  LayoutGrid,
  List,
  MessageSquare, 
  ArrowRight,
  Square,
  BadgeCheck,
  LogOut,
  Upload,
  Download,
  Image as ImageIcon,
  Video as VideoIcon
} from 'lucide-react';

const TMJ_LOGO_URL = '/assets/aistudio/file_00000000547c820ea5b46970c320d81b_15046822.png';
const TMJ_BANNER_URL = '/assets/aistudio/download_ce7e2314.jpg';

export interface SquadMember {
  id: string;
  name: string;
  handle: string;
  role: string;
  color: string;
  password?: string | null;
  customAvatar?: string | null;
}

export interface VaultComment {
  author: string;
  color: string;
  text: string;
  time: string;
}

export interface VaultItem {
  id: string;
  docId?: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  type: 'image' | 'video';
  url: string;
  caption?: string;
  timestamp: number;
  comments?: VaultComment[];
}

export interface ChatMessage {
  id: string;
  docId?: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorAvatar?: string | null;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  audioUrl?: string;
  duration?: number;
  timestamp: number;
}

const DEFAULT_SQUAD: SquadMember[] = [
  { id: 't1', name: 'TIAGO', handle: '@tiago', role: 'Drip & Fit', color: 'var(--color-acid)', password: null, customAvatar: null },
  { id: 'j2', name: 'JORGE', handle: '@jorge', role: 'Beats & Áudio', color: 'var(--color-urbanOrange)', password: null, customAvatar: null },
  { id: 'm3', name: 'MARCUS', handle: '@marcus', role: 'Film & Skate', color: 'var(--color-sprayCyan)', password: null, customAvatar: null }
];

export const normalizeSquadColor = (color?: string | null): string => {
  if (!color) return 'var(--color-acid)';
  if (color === '#ccff00') return 'var(--color-acid)';
  if (color === '#ff5500') return 'var(--color-urbanOrange)';
  if (color === '#00e5ff') return 'var(--color-sprayCyan)';
  return color;
};


export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'login' | 'app'>('splash');
  const [activeTab, setActiveTab] = useState<'vault' | 'chat'>('vault');
  const [vaultViewMode, setVaultViewMode] = useState<'feed' | 'grid'>('feed');

  const [squadMembers, setSquadMembers] = useState<SquadMember[]>(DEFAULT_SQUAD);
  const [activeMember, setActiveMember] = useState<SquadMember | null>(null);
  const [selectedLoginUser, setSelectedLoginUser] = useState<SquadMember | null>(null);

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Password Prompt Modal State
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordTitle, setPasswordTitle] = useState('');
  const [passwordSubtitle, setPasswordSubtitle] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
  const [fullMediaModalItem, setFullMediaModalItem] = useState<VaultItem | null>(null);

  // Upload Form State
  const [pendingUploadData, setPendingUploadData] = useState<{ type: 'image' | 'video'; url: string } | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');

  // Squad Edit Form State
  const [editRole, setEditRole] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatRecordingState, setChatRecordingState] = useState<'default' | 'recording' | 'preview'>('default');
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Active playing audio in chat message
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ id: string; pct: number; current: string } | null>(null);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recIntervalRef = useRef<number | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatBottomAnchorRef = useRef<HTMLDivElement>(null);
  const fileInputChatRef = useRef<HTMLInputElement>(null);
  const [virtualKeyboardHeight, setVirtualKeyboardHeight] = useState(0);

  const appId = 'triotmj-3187e';

  // Helper to persist a member to Firestore
  const persistMemberToFirestore = async (member: SquadMember) => {
    const cleanMember: SquadMember = {
      id: member.id,
      name: member.name,
      handle: member.handle,
      role: member.role || '',
      color: member.color,
      password: member.password ?? null,
      customAvatar: member.customAvatar ?? null
    };
    try {
      const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'tmj_members', member.id);
      await setDoc(memberRef, cleanMember, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `artifacts/${appId}/public/data/tmj_members/${member.id}`);
    }
  };

  // 1. Initial Firestore Setup & Real-time Listeners
  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(() => null);
    }

    // Members sync
    const membersColRef = collection(db, 'artifacts', appId, 'public', 'data', 'tmj_members');
    const unsubMembers = onSnapshot(membersColRef, async (snap) => {
      if (snap.empty) {
        for (const m of DEFAULT_SQUAD) {
          await persistMemberToFirestore(m);
        }
      } else {
        const loaded = snap.docs.map((d) => ({ ...d.data(), id: d.id } as SquadMember));
        setSquadMembers((prev) => {
          const updated = [...prev];
          loaded.forEach((m) => {
            const idx = updated.findIndex((x) => x.id === m.id);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], ...m };
            } else {
              updated.push(m);
            }
          });
          return updated;
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tmj_members');
    });

    // Vault sync
    const vaultColRef = collection(db, 'artifacts', appId, 'public', 'data', 'tmj_vault');
    const unsubVault = onSnapshot(vaultColRef, (snap) => {
      const items = snap.docs.map((d) => ({ ...d.data(), docId: d.id } as VaultItem));
      items.sort((a, b) => b.timestamp - a.timestamp);
      setVaultItems(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tmj_vault');
    });

    // Chat sync
    const chatColRef = collection(db, 'artifacts', appId, 'public', 'data', 'tmj_chat');
    const unsubChat = onSnapshot(chatColRef, (snap) => {
      const msgs = snap.docs.map((d) => ({ ...d.data(), docId: d.id } as ChatMessage));
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      setChatMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tmj_chat');
    });

    return () => {
      unsubMembers();
      unsubVault();
      unsubChat();
    };
  }, []);

  // Dynamic visual viewport detection for mobile virtual keyboard
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisualViewportResize = () => {
      if (!window.visualViewport) return;
      const windowHeight = window.innerHeight;
      const viewportHeight = window.visualViewport.height;
      const keyboardOffset = Math.max(0, Math.round(windowHeight - viewportHeight));

      // Trigger dynamic offset only when on-screen keyboard is open (offset > 100px)
      if (keyboardOffset > 100) {
        setVirtualKeyboardHeight(keyboardOffset);
      } else {
        setVirtualKeyboardHeight(0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleVisualViewportResize);
    window.visualViewport?.addEventListener('scroll', handleVisualViewportResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleVisualViewportResize);
    };
  }, []);

  // Enhanced auto-scroll chat ensuring bottom messages have safety space
  const scrollChatToBottom = (smooth = true) => {
    if (chatBottomAnchorRef.current) {
      chatBottomAnchorRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollChatToBottom(false);
      const timer = setTimeout(() => scrollChatToBottom(false), 50);
      return () => clearTimeout(timer);
    }
  }, [chatMessages, activeTab, virtualKeyboardHeight]);


  // Keep activeMember and selectedLoginUser in sync with freshest squad state
  useEffect(() => {
    if (activeMember) {
      const found = squadMembers.find((m) => m.id === activeMember.id);
      if (found) setActiveMember(found);
    }
    if (selectedLoginUser) {
      const foundSelected = squadMembers.find((m) => m.id === selectedLoginUser.id);
      if (foundSelected) setSelectedLoginUser(foundSelected);
    }
  }, [squadMembers]);

  // High-Quality Image & Video Processor (maximiza resolução mantendo dentro do limite de 1MB do documento)
  const processMediaForBestQuality = (file: File, callback: (base64: string) => void) => {
    // GIFs & Videos: read directly to preserve raw frames/video
    if (file.type === 'image/gif' || file.type.startsWith('video/')) {
      const reader = new FileReader();
      reader.onload = (e) => callback(e.target?.result as string);
      reader.readAsDataURL(file);
      return;
    }

    // If image file is already under 650KB, keep 100% original binary resolution
    if (file.size <= 650 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => callback(e.target?.result as string);
      reader.readAsDataURL(file);
      return;
    }

    // High-resolution scale with canvas preserving maximum detail
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1920; // Full HD 1080p+

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Try high quality 0.88 first
        let result = canvas.toDataURL('image/jpeg', 0.88);
        if (result.length > 900 * 1024) {
          // If still over 900KB, slightly step down quality to fit comfortably within Firestore doc
          result = canvas.toDataURL('image/jpeg', 0.80);
        }
        callback(result);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Download media helper
  const downloadMediaFile = (url: string, filename: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(url, '_blank');
    }
  };

  // Login handler
  const handleSelectLoginMember = (member: SquadMember) => {
    const latestMember = squadMembers.find((m) => m.id === member.id) || member;
    setSelectedLoginUser(latestMember);
    setIsPasswordPromptOpen(true);
    setPasswordInput('');

    if (!latestMember.password || latestMember.password.trim() === '') {
      setPasswordTitle(`CRIAR SENHA: ${latestMember.name}`);
      setPasswordSubtitle('PRIMEIRO ACESSO: Digite sua nova senha.');
    } else {
      setPasswordTitle(`LOGIN: ${latestMember.name}`);
      setPasswordSubtitle('DIGITE SUA SENHA CADASTRADA.');
    }
  };

  const handleSubmitPassword = async () => {
    if (!selectedLoginUser || isSavingPassword) return;
    const inputVal = passwordInput.trim();
    if (!inputVal) return;

    const latestUser = squadMembers.find((m) => m.id === selectedLoginUser.id) || selectedLoginUser;

    if (!latestUser.password || latestUser.password.trim() === '') {
      setIsSavingPassword(true);
      const updated: SquadMember = { ...latestUser, password: inputVal };
      setSquadMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      await persistMemberToFirestore(updated);
      setIsSavingPassword(false);
      setActiveMember(updated);
      setIsPasswordPromptOpen(false);
      setCurrentScreen('app');
    } else {
      if (latestUser.password === inputVal) {
        setActiveMember(latestUser);
        setIsPasswordPromptOpen(false);
        setCurrentScreen('app');
      } else {
        setPasswordTitle('SENHA INCORRETA ❌');
        setTimeout(() => {
          setPasswordTitle(`LOGIN: ${latestUser.name}`);
        }, 1500);
      }
    }
  };

  // Vault Actions
  const handleVaultFilePreview = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processMediaForBestQuality(file, (base64) => {
      setPendingUploadData({
        type: file.type.startsWith('video') ? 'video' : 'image',
        url: base64
      });
    });
  };

  const submitVaultDrop = async () => {
    if (!pendingUploadData || !activeMember) {
      alert('Selecione uma foto ou vídeo para publicar.');
      return;
    }
    const newDrop: VaultItem = {
      id: 'drop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      authorId: activeMember.id,
      authorName: activeMember.name,
      authorColor: activeMember.color,
      type: pendingUploadData.type,
      url: pendingUploadData.url,
      caption: uploadCaption.trim() || '',
      timestamp: Date.now(),
      comments: []
    };

    setVaultItems((prev) => [newDrop, ...prev]);
    setIsUploadModalOpen(false);
    setPendingUploadData(null);
    setUploadCaption('');

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', newDrop.id), newDrop);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tmj_vault');
    }
  };

  const deleteVaultItem = async (docId: string) => {
    setVaultItems((prev) => prev.filter((item) => (item.docId || item.id) !== docId));
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tmj_vault/${docId}`);
    }
  };

  const addVaultComment = async (docId: string, text: string) => {
    if (!text.trim() || !activeMember) return;
    const item = vaultItems.find((i) => (i.docId || i.id) === docId);
    if (!item) return;

    const newComments = [
      ...(item.comments || []),
      {
        author: activeMember.name,
        color: activeMember.color,
        text: text.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    const updatedItem = { ...item, comments: newComments };
    setVaultItems((prev) =>
      prev.map((i) => ((i.docId || i.id) === docId ? updatedItem : i))
    );

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', docId), updatedItem, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tmj_vault/${docId}`);
    }
  };

  // Chat Actions
  const handleChatSubmit = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : chatInput).trim();
    if (!textToSend || !activeMember) return;

    const msg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      authorId: activeMember.id,
      authorName: activeMember.name,
      authorColor: activeMember.color,
      authorAvatar: activeMember.customAvatar || null,
      text: textToSend,
      timestamp: Date.now()
    };

    setChatInput('');
    setChatMessages((prev) => [...prev, msg]);

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', msg.id), msg);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
    }
  };

  // Delete message from chat
  const deleteChatMessage = async (msgId: string) => {
    setChatMessages((prev) => prev.filter((m) => (m.docId || m.id) !== msgId));
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', msgId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tmj_chat/${msgId}`);
    }
  };

  const sendChatMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeMember) return;

    if (file.type.startsWith('audio/')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Audio = e.target?.result as string;
        const msg: ChatMessage = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          authorId: activeMember.id,
          authorName: activeMember.name,
          authorColor: activeMember.color,
          authorAvatar: activeMember.customAvatar || null,
          audioUrl: base64Audio,
          duration: 10,
          timestamp: Date.now()
        };
        setChatMessages((prev) => [...prev, msg]);
        try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', msg.id), msg);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
        }
      };
      reader.readAsDataURL(file);
      event.target.value = '';
      return;
    }

    processMediaForBestQuality(file, async (base64) => {
      const msg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorColor: activeMember.color,
        authorAvatar: activeMember.customAvatar || null,
        mediaUrl: base64,
        mediaType: file.type.startsWith('video') ? 'video' : 'image',
        timestamp: Date.now()
      };
      setChatMessages((prev) => [...prev, msg]);
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', msg.id), msg);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
      }
    });
    event.target.value = '';
  };

  // Supported MIME types detection for MediaRecorder
  const getAudioMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return undefined;
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return undefined;
  };

  // Voice recording
  const startChatAudioRecord = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microfone não suportado');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getAudioMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        setRecordedAudioBlob(blob);
        setRecordedAudioUrl(url);
        setChatRecordingState('preview');
      };

      recorder.start(250);
      setChatRecordingState('recording');
      setRecSeconds(0);

      if (recIntervalRef.current) clearInterval(recIntervalRef.current);
      recIntervalRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1);
      }, 1000);
    } catch (err: unknown) {
      console.warn('Erro ao acessar microfone:', err);
      if (fileInputChatRef.current) {
        fileInputChatRef.current.click();
      } else {
        alert('Para enviar áudio, toque no botão de câmera/mídia e selecione um arquivo de áudio ou vídeo.');
      }
    }
  };

  const pauseChatAudioRecord = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (recIntervalRef.current) clearInterval(recIntervalRef.current);
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  };

  const discardChatAudio = () => {
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setChatRecordingState('default');
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    }
  };

  const playPreviewAudio = () => {
    if (!recordedAudioUrl) return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(recordedAudioUrl);
    }
    const audio = previewAudioRef.current;
    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
    } else {
      audio.src = recordedAudioUrl;
      audio.play().catch(() => null);
      setIsPlayingPreview(true);
      audio.onended = () => setIsPlayingPreview(false);
    }
  };

  const sendChatAudio = () => {
    if (!recordedAudioBlob || !activeMember) return;
    const reader = new FileReader();
    reader.readAsDataURL(recordedAudioBlob);
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      const msg: ChatMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorColor: activeMember.color,
        authorAvatar: activeMember.customAvatar || null,
        audioUrl: base64Audio,
        duration: recSeconds,
        timestamp: Date.now()
      };
      setChatMessages((prev) => [...prev, msg]);
      discardChatAudio();
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', msg.id), msg);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
      }
    };
  };

  const togglePlayChatAudio = (audioId: string, duration?: number) => {
    const audioEl = document.getElementById(`audio_${audioId}`) as HTMLAudioElement;
    if (!audioEl) return;

    if (audioEl.paused) {
      if (playingAudioId && playingAudioId !== audioId) {
        const prev = document.getElementById(`audio_${playingAudioId}`) as HTMLAudioElement;
        if (prev) {
          prev.pause();
          prev.currentTime = 0;
        }
      }
      audioEl.play().then(() => {
        setPlayingAudioId(audioId);
      }).catch((e) => {
        console.warn('Erro ao tocar áudio:', e);
      });

      audioEl.ontimeupdate = () => {
        const total = audioEl.duration || duration || 5;
        const pct = (audioEl.currentTime / total) * 100;
        const curMin = String(Math.floor(audioEl.currentTime / 60)).padStart(2, '0');
        const curSec = String(Math.floor(audioEl.currentTime % 60)).padStart(2, '0');
        setAudioProgress({ id: audioId, pct, current: `${curMin}:${curSec}` });
      };

      audioEl.onended = () => {
        setPlayingAudioId(null);
        setAudioProgress(null);
      };
    } else {
      audioEl.pause();
      setPlayingAudioId(null);
    }
  };

  // Squad Profile modal
  const openSquadModal = () => {
    if (activeMember) {
      setEditRole(activeMember.role || '');
      setEditAvatar(activeMember.customAvatar || '');
      setEditPassword(activeMember.password || '');
    }
    setIsSquadModalOpen(true);
  };

  // Avatar file upload handler (Image or animated GIF)
  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For animated GIF: preserve raw frames directly via base64
    if (file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEditAvatar(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
      return;
    }

    // For standard images: crop/scale to crisp 320x320 square avatar
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        canvas.width = 320;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 320, 320);
        }
        setEditAvatar(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveSquadProfile = async () => {
    if (!activeMember) return;
    const updated: SquadMember = {
      ...activeMember,
      role: editRole.trim(),
      customAvatar: editAvatar.trim() || null,
      password: editPassword.trim() || activeMember.password || null
    };

    setActiveMember(updated);
    setSquadMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    await persistMemberToFirestore(updated);
    setIsSquadModalOpen(false);
  };

  return (
    <div className="bg-asphalt min-h-screen flex justify-center items-start selection:bg-acid selection:text-asphalt">
      {/* ==================== 1. TELA DE ENTRADA / SPLASH SCREEN ==================== */}
      {currentScreen === 'splash' && (
        <div id="splash-screen" className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-asphalt select-none p-4 overflow-hidden">
          {/* BANNER COMO BACKGROUND COM OPACIDADE BAIXA */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={TMJ_BANNER_URL}
              alt="Trio TMJ Background"
              className="w-full h-full object-cover object-center opacity-25 filter grayscale contrast-125 scale-105"
            />
            {/* Vignette escura e gradiente para legibilidade e visual streetwear */}
            <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-asphalt/60 to-asphalt/80"></div>
            <div className="absolute inset-0 bg-radial from-transparent via-asphalt/40 to-asphalt"></div>
          </div>

          {/* MARCAS DE GRAFITE E PIXAÇÃO (PIXO DE RUA / TAGS / ESCORRIDOS DE MOP) */}
          <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden select-none">
            {/* Pixo estilo reto / vertical clássico de São Paulo na lateral esquerda */}
            <div className="absolute top-8 left-4 sm:left-8 opacity-45 text-acid flex flex-col items-center">
              <svg width="44" height="130" viewBox="0 0 60 170" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                {/* Cruz de Pixo */}
                <line x1="30" y1="5" x2="30" y2="25" />
                <line x1="20" y1="12" x2="40" y2="12" />
                
                {/* Pixo 'T' */}
                <line x1="12" y1="35" x2="48" y2="35" />
                <line x1="30" y1="35" x2="30" y2="70" />
                
                {/* Pixo 'M' */}
                <line x1="14" y1="80" x2="14" y2="115" />
                <line x1="14" y1="80" x2="30" y2="100" />
                <line x1="30" y1="100" x2="46" y2="80" />
                <line x1="46" y1="80" x2="46" y2="115" />
                
                {/* Pixo 'J' */}
                <line x1="18" y1="125" x2="42" y2="125" />
                <line x1="38" y1="125" x2="38" y2="160" />
                <line x1="38" y1="160" x2="18" y2="160" />
                <line x1="18" y1="160" x2="18" y2="148" />
              </svg>
              <span className="font-mono text-[9px] tracking-[0.25em] text-stencil uppercase -mt-1 font-bold">047 // SC</span>
            </div>

            {/* Tag de Grafite com Coroa e Mop Drip na lateral direita */}
            <div className="absolute top-8 right-4 sm:right-8 opacity-45 text-urbanOrange flex flex-col items-end">
              <svg width="55" height="85" viewBox="0 0 70 95" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Coroa de Grafite */}
                <path d="M15,22 L15,10 L35,18 L55,10 L55,22 Z" fill="currentColor" fillOpacity="0.2" />
                <circle cx="15" cy="8" r="2" fill="currentColor" />
                <circle cx="35" cy="8" r="2" fill="currentColor" />
                <circle cx="55" cy="8" r="2" fill="currentColor" />
                
                {/* Tag 'TRIO' */}
                <path d="M12,38 L45,38 M28,38 L28,58" />
                <path d="M48,38 L48,58 M48,38 C58,38 58,48 48,48 L58,58" />
                
                {/* Drips finos de marcador mop */}
                <line x1="28" y1="58" x2="28" y2="82" strokeWidth="1.5" />
                <circle cx="28" cy="85" r="2.5" fill="currentColor" />
                <line x1="58" y1="58" x2="58" y2="74" strokeWidth="1.5" />
                <circle cx="58" cy="76" r="2" fill="currentColor" />
              </svg>
              <span className="font-mono text-[8px] tracking-[0.25em] text-acid uppercase font-bold">#DAMN</span>
            </div>

            {/* Seta de grafite no canto inferior esquerdo */}
            <div className="absolute bottom-12 left-5 opacity-40 text-acid">
              <svg width="40" height="50" viewBox="0 0 50 60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10,12 L35,35 M35,35 L20,35 M35,35 L35,20" />
                <path d="M8,46 L42,46" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="25" cy="53" r="2" fill="currentColor" />
              </svg>
            </div>

            {/* Assinatura / Tag de Pixo no canto inferior direito */}
            <div className="absolute bottom-12 right-6 opacity-40 text-chalk font-mono text-[9px] tracking-[0.2em] font-bold text-right">
              <div className="text-acid font-display text-sm tracking-widest">// TMJ //</div>
              <div className="text-[9px] text-stencil">VOCÊ ME SENTE?</div>
              <div className="text-urbanOrange tracking-widest text-xs mt-0.5">† † †</div>
            </div>

            {/* Respingos de spray aerossol */}
            <svg className="absolute top-1/4 left-1/4 w-24 h-24 opacity-30 text-acid pointer-events-none" viewBox="0 0 100 100">
              <circle cx="20" cy="30" r="2" fill="currentColor" />
              <circle cx="35" cy="22" r="3" fill="currentColor" />
              <circle cx="50" cy="35" r="4" fill="currentColor" />
              <circle cx="68" cy="25" r="1.5" fill="currentColor" />
              <circle cx="42" cy="65" r="2" fill="currentColor" />
              <circle cx="75" cy="60" r="1" fill="currentColor" />
            </svg>
            <svg className="absolute bottom-1/4 right-1/4 w-24 h-24 opacity-25 text-urbanOrange pointer-events-none" viewBox="0 0 100 100">
              <circle cx="30" cy="30" r="2.5" fill="currentColor" />
              <circle cx="50" cy="20" r="3.5" fill="currentColor" />
              <circle cx="68" cy="35" r="1.5" fill="currentColor" />
              <circle cx="42" cy="50" r="4" fill="currentColor" />
              <circle cx="60" cy="65" r="2" fill="currentColor" />
            </svg>
          </div>

          {/* CONTEÚDO PRINCIPAL DA ENTRADA */}
          <div className="relative z-10 flex flex-col items-center text-center w-full max-w-sm my-auto">
            {/* LOGO EM PNG COM DESTAQUE MÁXIMO E BRILHO */}
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center -mb-4">
              <img
                src={TMJ_LOGO_URL}
                alt="TMJ Logo"
                className="w-full h-full object-contain mix-blend-screen drop-shadow-[0_0_40px_var(--color-urbanOrange)] animate-pulse transition-all duration-1000"
              />
            </div>

            {/* STENCIL STREETWEAR */}
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-0.5 bg-urbanOrange"></span>
              <span className="font-mono text-acid text-xs sm:text-sm tracking-[0.25em] font-bold uppercase drop-shadow-[1px_1px_0px_var(--color-asphalt)]">
                RESENHA OU MORTE
              </span>
              <span className="w-6 h-0.5 bg-acid"></span>
            </div>

            <p className="font-mono text-stencil text-[11px] tracking-[0.3em] mb-8 font-semibold">
              TIAGO • MARCUS • JORGE 
            </p>

            {/* BOTÃO ENTRAR */}
            <button
              onClick={() => setCurrentScreen('login')}
              className="w-full max-w-[300px] bg-acid hover:brightness-110 text-asphalt font-display text-2xl tracking-widest px-8 py-4 rounded-sm shadow-[6px_6px_0px_var(--color-urbanOrange)] active:translate-y-1 active:shadow-[2px_2px_0px_var(--color-urbanOrange)] transition-all cursor-pointer flex items-center justify-center gap-3 font-bold"
            >
              <span>ENTRAR</span>
              <ArrowRight className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== 2. TELA DE LOGIN DO TRIO ==================== */}
      {currentScreen === 'login' && (
        <div id="login-screen" className="fixed inset-0 z-[90] bg-asphalt flex flex-col items-center justify-center p-4 select-none overflow-y-auto">
          {/* BANNER COMO BACKGROUND COM OPACIDADE BAIXA */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={TMJ_BANNER_URL}
              alt="Trio TMJ Background"
              className="w-full h-full object-cover object-center opacity-20 filter grayscale contrast-125 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-asphalt/75 to-asphalt/90"></div>
            <div className="absolute inset-0 bg-radial from-transparent via-asphalt/50 to-asphalt"></div>
          </div>

          {/* SINAIS DE GRAFITE E PIXAÇÃO NA TELA DE LOGIN */}
          <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden select-none">
            {/* Pixo vertical reto no topo esquerdo */}
            <div className="absolute top-6 left-4 sm:left-6 opacity-35 text-acid">
              <svg width="32" height="90" viewBox="0 0 50 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                <line x1="10" y1="15" x2="40" y2="15" />
                <line x1="25" y1="15" x2="25" y2="45" />
                <line x1="12" y1="55" x2="12" y2="85" />
                <line x1="12" y1="55" x2="25" y2="70" />
                <line x1="25" y1="70" x2="38" y2="55" />
                <line x1="38" y1="55" x2="38" y2="85" />
                <line x1="15" y1="95" x2="35" y2="95" />
                <line x1="32" y1="95" x2="32" y2="115" />
                <line x1="32" y1="115" x2="15" y2="115" />
              </svg>
            </div>

            {/* Tag e Drip no topo direito */}
            <div className="absolute top-6 right-4 sm:right-6 opacity-35 text-urbanOrange text-right">
              <span className="font-mono text-[9px] tracking-[0.25em] text-acid font-bold block">† TMJ †</span>
              <span className="font-mono text-[8px] text-stencil tracking-widest uppercase block">047 // SQUAD</span>
              <div className="w-1 h-5 bg-urbanOrange/60 rounded-full mx-auto mt-1 ml-auto mr-2"></div>
            </div>

            {/* Tag de pixo na base */}
            <div className="absolute bottom-4 left-6 opacity-30 text-stencil font-mono text-[9px] tracking-widest">
              † RESENHA OU MORTE †
            </div>
          </div>

          <div className="relative z-10 w-full max-w-[340px] flex flex-col items-center my-auto">
            {/* LOGO COMPACTA COM DESTAQUE */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mb-1">
              <img
                src={TMJ_LOGO_URL}
                alt="TMJ"
                className="w-full h-full object-contain mix-blend-screen drop-shadow-[0_0_25px_var(--color-urbanOrange)]"
              />
            </div>

            <h2 className="font-display text-4xl sm:text-5xl text-chalk mb-0.5 tracking-wide drop-shadow-[2px_2px_0px_var(--color-asphalt)]">
              QUEM É VOCÊ?
            </h2>
            <p className="font-mono text-xs text-acid mb-6 tracking-widest font-semibold drop-shadow-[1px_1px_0px_var(--color-asphalt)]">
              ACESSO RESTRITO AO TRIO
            </p>

            <div id="login-users-grid" className="w-full space-y-3">
            {squadMembers.map((m) => {
              const hasPwd = m.password && m.password.trim() !== '';
              const resolvedColor = normalizeSquadColor(m.color);
              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectLoginMember(m)}
                  className="bg-asphalt border-2 border-bunker hover:border-acid p-4 rounded-sm flex items-center justify-between cursor-pointer transition-all shadow-md active:translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    {m.customAvatar ? (
                      <img
                        src={m.customAvatar}
                        alt={m.name}
                        className="w-12 h-12 rounded-sm object-cover border"
                        style={{ borderColor: resolvedColor }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-sm flex items-center justify-center font-display text-xl bg-concrete"
                        style={{ color: resolvedColor }}
                      >
                        {m.name[0]}
                      </div>
                    )}
                    <div>
                      <h4 className="font-display text-xl text-chalk tracking-wide">{m.name}</h4>
                      <p className="font-mono text-[10px] text-stencil uppercase">{m.role || m.handle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono text-[9px] px-2 py-1 rounded-sm border ${
                        hasPwd
                          ? 'border-acid/40 text-acid bg-acid/10'
                          : 'border-urbanOrange/40 text-urbanOrange bg-urbanOrange/10'
                      }`}
                    >
                      {hasPwd ? 'SENHA SALVA 🔒' : 'CRIAR SENHA ⚡'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal Interno de Senha */}
          {isPasswordPromptOpen && selectedLoginUser && (
            <div id="password-prompt" className="absolute inset-x-4 bottom-6 bg-bunker border border-bunker p-6 rounded-sm shadow-2xl max-w-[340px] mx-auto z-50">
              <div className="flex justify-between items-center mb-4 border-b border-bunker pb-2">
                <h3 id="pwd-title" className="font-display text-2xl text-chalk tracking-wide">
                  {passwordTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPasswordPromptOpen(false)}
                  className="w-8 h-8 rounded-sm bg-asphalt text-stencil cursor-pointer flex items-center justify-center hover:text-chalk"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p id="pwd-subtitle" className="font-mono text-[10px] text-urbanOrange mb-4 tracking-wide uppercase">
                {passwordSubtitle}
              </p>

              <input
                type="password"
                autoFocus
                id="pwd-input"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitPassword();
                }}
                className="w-full bg-asphalt border-2 border-bunker rounded-sm px-4 py-3 text-chalk mb-4 focus:border-acid focus:outline-none text-center tracking-[0.5em] font-mono text-lg"
              />

              <button
                type="button"
                id="pwd-submit-btn"
                disabled={isSavingPassword}
                onClick={handleSubmitPassword}
                className="w-full bg-acid text-asphalt font-display text-lg tracking-widest py-3 rounded-sm border border-asphalt shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-1 active:shadow-none transition-all cursor-pointer font-bold disabled:opacity-50"
              >
                {isSavingPassword ? 'SALVANDO...' : 'CONFIRMAR'}
              </button>
            </div>
          )}
          </div>
        </div>
      )}

      {/* ==================== 3. MOBILE-FIRST APP CONTAINER ==================== */}
      {currentScreen === 'app' && activeMember && (
        <div id="app-shell" className={`w-full max-w-[460px] min-h-screen bg-concrete-texture border-x border-bunker/80 flex flex-col relative z-10 shadow-2xl ${virtualKeyboardHeight > 0 ? 'pb-2' : 'pb-20'}`}>
          
          {/* HEADER BANNER MARQUEE */}
          <div className="bg-acid text-asphalt overflow-hidden py-1 border-b-2 border-asphalt flex relative z-40">
            <div className="font-mono text-[10px] sm:text-[11px] font-semibold tracking-[0.22em] animate-ticker whitespace-nowrap uppercase">
              +++ TRIO TMJ  +++ RESENHA OU MORTE +++ DAAAAMN +++ VOCE ME SENTE? +++ TMJ +++ APENAS ME DIGA QUEM VAI MORRER HOJE! +++ CONCEPT? +++
            </div>
          </div>

          {/* HEADER (SEM BANNER, VISUAL LIMPO E OTIMIZADO PARA O CONTEÚDO) */}
          <header className="sticky top-0 z-30 bg-asphalt/95 backdrop-blur-md border-b border-bunker px-4 py-2.5">
            <div className="flex items-center justify-between">
              <img
                src={TMJ_LOGO_URL}
                alt="TMJ"
                className="h-10 w-auto object-contain mix-blend-screen"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openSquadModal}
                  className="bg-concrete border border-bunker hover:border-acid rounded-sm px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-mono text-chalk shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
                >
                  <span>SQUAD ID</span>
                  <BadgeCheck className="w-3.5 h-3.5 text-acid" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMember(null);
                    setCurrentScreen('login');
                  }}
                  title="Sair da conta"
                  className="bg-bunker border border-bunker rounded-sm w-8 h-7 flex items-center justify-center text-stencil hover:text-urbanOrange transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </header>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 flex flex-col min-h-0">
            {/* ==================== TAB 1: MIDIA DOS GURI (VAULT) ==================== */}
            {activeTab === 'vault' && (
              <section id="view-vault" className="flex-1 flex flex-col px-3 pt-4 pb-6">
                <div className="flex items-center justify-between mb-4 px-1 border-b border-bunker border-dashed pb-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-2xl text-chalk uppercase tracking-wide">midia dos guri</h2>
                    <span id="vault-count-badge" className="font-mono text-[10px] text-sprayCyan border border-sprayCyan/30 bg-sprayCyan/10 px-2 py-0.5 rounded-sm font-bold">
                      {vaultItems.length} DROPS
                    </span>
                  </div>

                  {/* TOGGLE VISUALIZAÇÃO: FEED VS GRADE */}
                  <div className="flex items-center gap-1 bg-bunker p-0.5 rounded-sm border border-bunker">
                    <button
                      type="button"
                      onClick={() => setVaultViewMode('feed')}
                      title="Visualização em Feed"
                      className={`px-2 py-1 text-[10px] font-mono rounded-xs flex items-center gap-1 transition-colors cursor-pointer ${
                        vaultViewMode === 'feed'
                          ? 'bg-acid text-asphalt font-bold shadow-xs'
                          : 'text-stencil hover:text-chalk'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>FEED</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVaultViewMode('grid')}
                      title="Visualização em Grade"
                      className={`px-2 py-1 text-[10px] font-mono rounded-xs flex items-center gap-1 transition-colors cursor-pointer ${
                        vaultViewMode === 'grid'
                          ? 'bg-acid text-asphalt font-bold shadow-xs'
                          : 'text-stencil hover:text-chalk'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>GRADE</span>
                    </button>
                  </div>
                </div>

                {vaultItems.length === 0 ? (
                  <div className="text-center py-16 bg-concrete border-2 border-dashed border-bunker rounded-sm">
                    <img
                      src={TMJ_LOGO_URL}
                      alt="TMJ"
                      className="w-20 h-20 object-contain mix-blend-screen mx-auto mb-2 opacity-60"
                    />
                    <p className="font-mono text-xs text-stencil uppercase tracking-widest">Nenhuma mídia no Vault ainda.</p>
                    <p className="font-mono text-[10px] text-stencil/70 mt-1">Toque em + ADD MÍDIA para soltar o primeiro drop!</p>
                  </div>
                ) : vaultViewMode === 'grid' ? (
                  /* ==================== MODO GRADE ==================== */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {vaultItems.map((item) => {
                      const docId = item.docId || item.id;
                      const resolvedAuthorColor = normalizeSquadColor(item.authorColor);

                      return (
                        <div
                          key={docId}
                          className="bg-concrete border border-bunker rounded-sm overflow-hidden aspect-square relative group cursor-pointer shadow-md"
                          onClick={() => setFullMediaModalItem(item)}
                        >
                          {item.type === 'video' ? (
                            <div className="w-full h-full bg-asphalt flex items-center justify-center relative">
                              <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                              <div className="absolute inset-0 bg-asphalt/50 flex items-center justify-center group-hover:bg-asphalt/30 transition-colors">
                                <div className="w-10 h-10 rounded-full bg-acid/90 text-asphalt flex items-center justify-center">
                                  <Play className="w-5 h-5 fill-asphalt ml-0.5" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={item.url}
                              alt={item.caption || 'Vault Drop'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          )}

                          {/* Gradient and info overlay */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-asphalt/95 via-asphalt/50 to-transparent p-2 flex items-end justify-between">
                            <div className="min-w-0 pr-1">
                              <span className="font-mono text-[10px] uppercase font-bold truncate block" style={{ color: resolvedAuthorColor }}>
                                {item.authorName}
                              </span>
                              {item.caption && (
                                <p className="font-sans text-[10px] text-chalk truncate">
                                  {item.caption}
                                </p>
                              )}
                            </div>

                            {/* Download Icon on Grid */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMediaFile(item.url, `TMJ_${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`);
                              }}
                              title="Baixar em alta qualidade"
                              className="w-7 h-7 bg-asphalt/85 hover:bg-acid hover:text-asphalt text-chalk rounded-xs border border-bunker flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ==================== MODO FEED (LOOKBOOK) ==================== */
                  <div id="vault-items-container" className="space-y-6">
                    {vaultItems.map((item) => {
                      const docId = item.docId || item.id;
                      const isMine = item.authorId === activeMember.id;
                      const resolvedAuthorColor = normalizeSquadColor(item.authorColor);

                      return (
                        <div key={docId} className="bg-concrete border-2 border-bunker rounded-sm overflow-hidden relative shadow-lg">
                          <div className="p-3 bg-asphalt border-b border-bunker flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-display tracking-wide uppercase text-sm" style={{ color: resolvedAuthorColor }}>
                                {item.authorName}
                              </span>
                              <span className="font-mono text-[9px] text-stencil">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                            </div>

                            {/* BOTAO BAIXAR EM ALTA RESOLUÇÃO */}
                            <button
                              type="button"
                              onClick={() => downloadMediaFile(item.url, `TMJ_${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`)}
                              title="Baixar arquivo original sem perder qualidade"
                              className="flex items-center gap-1 bg-bunker hover:bg-concrete border border-bunker hover:border-acid text-chalk hover:text-acid px-2 py-1 rounded-xs font-mono text-[10px] transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>BAIXAR</span>
                            </button>
                          </div>

                          <div className="relative group bg-asphalt">
                            {item.type === 'video' ? (
                              <video src={item.url} className="w-full max-h-96 object-cover" controls playsInline></video>
                            ) : (
                              <img
                                src={item.url}
                                alt={item.caption || 'Vault Drop'}
                                className="w-full max-h-96 object-cover cursor-pointer"
                                onClick={() => setFullMediaModalItem(item)}
                              />
                            )}
                            <div className="absolute top-2 right-2 bg-asphalt/85 px-1.5 py-0.5 rounded-sm border border-bunker pointer-events-none">
                              <img src={TMJ_LOGO_URL} alt="TMJ" className="h-5 w-auto object-contain mix-blend-screen" />
                            </div>
                            {isMine && (
                              <button
                                onClick={() => deleteVaultItem(docId)}
                                title="Excluir da mídia"
                                className="absolute top-2 left-2 w-8 h-8 bg-asphalt/90 text-red-500 rounded-full border border-red-500/50 flex items-center justify-center hover:bg-red-500 hover:text-asphalt transition cursor-pointer z-20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="p-3 bg-concrete space-y-3">
                            <p className="font-sans text-sm text-chalk">{item.caption || ''}</p>

                            {/* Thread de Comentários */}
                            <div className="bg-asphalt border border-bunker rounded-sm p-2 space-y-1 max-h-36 overflow-y-auto">
                              {item.comments && item.comments.length > 0 ? (
                                item.comments.map((c, i) => (
                                  <div key={i} className="text-xs font-mono py-1 border-b border-bunker last:border-0 flex items-center justify-between">
                                    <div>
                                      <span className="font-bold mr-2 uppercase" style={{ color: normalizeSquadColor(c.color) }}>{c.author}:</span>
                                      <span className="text-chalk">{c.text}</span>
                                    </div>
                                    <span className="text-[9px] text-stencil">{c.time}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="font-mono text-[10px] text-stencil italic">Nenhum comentário na thread.</p>
                              )}
                            </div>

                            <input
                              type="text"
                              placeholder="Responder no drop..."
                              className="w-full bg-asphalt border border-bunker rounded-sm px-3 py-2 text-xs text-chalk focus:border-acid focus:outline-none font-mono"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addVaultComment(docId, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ==================== TAB 2: RESENHA (CHAT) ==================== */}
            {activeTab === 'chat' && (
              <section 
                id="view-chat" 
                style={{
                  paddingBottom: virtualKeyboardHeight > 0 
                    ? `${virtualKeyboardHeight + 12}px` 
                    : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
                  transition: 'padding-bottom 0.15s ease-out'
                }}
                className="flex-1 flex flex-col min-h-0 justify-between px-3 pt-3 overflow-hidden"
              >
                <div className="mb-2 px-1 border-b border-bunker border-dashed pb-2 shrink-0">
                  <h2 className="font-display text-xl text-chalk uppercase tracking-wide">resenha ou morte</h2>
                </div>

                <div 
                  ref={chatListRef} 
                  id="chat-messages-list" 
                  className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 py-2 pb-6 overscroll-contain"
                >
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="font-mono text-xs text-stencil uppercase tracking-widest">A resenha começou. Manda o papo!</p>
                    </div>
                  ) : (
                    chatMessages.map((m) => {
                      const isMine = m.authorId === activeMember.id;
                      const isAudioPlaying = playingAudioId === m.id;
                      const durStr = `00:${String(m.duration || 5).padStart(2, '0')}`;
                      
                      const author = squadMembers.find((s) => s.id === m.authorId);
                      const avatarUrl = m.authorAvatar || author?.customAvatar;
                      const resolvedAuthorColor = normalizeSquadColor(m.authorColor);

                      return (
                        <div key={m.id} className={`flex items-start gap-2.5 ${isMine ? 'flex-row-reverse self-end' : 'self-start'} max-w-[92%]`}>
                          {/* FOTO DE PERFIL DO AUTOR DA MENSAGEM */}
                          <div className="shrink-0 mt-1">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={m.authorName}
                                className="w-8 h-8 rounded-sm object-cover border shadow-sm"
                                style={{ borderColor: resolvedAuthorColor }}
                              />
                            ) : (
                              <div
                                className="w-8 h-8 rounded-sm bg-concrete border flex items-center justify-center font-display text-sm font-bold shadow-sm"
                                style={{ borderColor: resolvedAuthorColor, color: resolvedAuthorColor }}
                              >
                                {m.authorName[0]}
                              </div>
                            )}
                          </div>

                          <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} space-y-1 min-w-0`}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] uppercase font-bold" style={{ color: resolvedAuthorColor }}>
                                {m.authorName}
                              </span>
                              <span className="font-mono text-[9px] text-stencil">
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>

                              {/* BOTAO PARA DELETAR MENSAGEM */}
                              {isMine && (
                                <button
                                  type="button"
                                  onClick={() => deleteChatMessage(m.docId || m.id)}
                                  title="Deletar mensagem"
                                  className="text-stencil hover:text-urbanOrange p-0.5 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div className="bg-concrete border border-bunker rounded-sm p-3 shadow-md relative group">
                              {m.text && <p className="text-sm font-sans text-chalk leading-relaxed">{m.text}</p>}

                              {m.mediaUrl && (
                                <div className="relative group/media mt-1">
                                  <img
                                    src={m.mediaUrl}
                                    alt="Chat media"
                                    className="rounded-sm max-h-48 object-cover cursor-pointer"
                                    onClick={() => setFullMediaModalItem({
                                      id: m.id,
                                      authorId: m.authorId,
                                      authorName: m.authorName,
                                      authorColor: m.authorColor,
                                      type: m.mediaType === 'video' ? 'video' : 'image',
                                      url: m.mediaUrl || '',
                                      caption: 'Mídia enviada na Resenha',
                                      timestamp: m.timestamp
                                    })}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => downloadMediaFile(m.mediaUrl || '', `CHAT_${m.id}.jpg`)}
                                    title="Baixar foto"
                                    className="absolute bottom-2 right-2 bg-asphalt/85 hover:bg-acid hover:text-asphalt text-chalk p-1.5 rounded-xs border border-bunker transition-colors cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {m.audioUrl && (
                                <div className="flex items-center gap-3 bg-asphalt border border-sprayCyan/40 p-2.5 rounded-sm w-56 sm:w-64">
                                  <audio id={`audio_${m.id}`} src={m.audioUrl} preload="metadata"></audio>
                                  <button
                                    id={`btn_play_${m.id}`}
                                    onClick={() => togglePlayChatAudio(m.id, m.duration)}
                                    className="w-9 h-9 rounded-sm bg-sprayCyan/20 text-sprayCyan hover:bg-sprayCyan hover:text-asphalt transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    {isAudioPlaying ? (
                                      <Pause className="w-4 h-4" />
                                    ) : (
                                      <Play className="w-4 h-4 ml-0.5" />
                                    )}
                                  </button>
                                  <div className="flex-1 space-y-1.5 min-w-0">
                                    <div className="w-full bg-bunker h-1.5 rounded-full overflow-hidden">
                                      <div
                                        id={`prog_${m.id}`}
                                        className="bg-acid h-full transition-all duration-150"
                                        style={{ width: isAudioPlaying && audioProgress?.id === m.id ? `${audioProgress.pct}%` : '0%' }}
                                      ></div>
                                    </div>
                                    <div className="flex justify-between font-mono text-[9px] text-stencil">
                                      <span id={`time_${m.id}`}>
                                        {isAudioPlaying && audioProgress?.id === m.id ? audioProgress.current : '00:00'}
                                      </span>
                                      <span>{durStr}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {/* Anchor e espaço de segurança garantido para teclado aberto */}
                  <div ref={chatBottomAnchorRef} className="h-4 shrink-0" />
                </div>

                {/* Gírias Rápidas */}
                <div className="py-2 flex items-center gap-2 w-full overflow-x-auto whitespace-nowrap snap-x no-scrollbar border-t border-bunker px-1 mt-1 shrink-0 relative z-20">
                  {['hoje é aonde?', 'resenha', 'to off', 'concept?'].map((stk) => (
                    <button
                      key={stk}
                      type="button"
                      onClick={() => handleChatSubmit(stk)}
                      className="snap-start shrink-0 bg-concrete border border-bunker text-chalk font-mono text-[10px] px-4 py-2 rounded-sm active:scale-95 transition hover:bg-bunker cursor-pointer"
                    >
                      {stk}
                    </button>
                  ))}
                </div>

                {/* Chat Input System */}
                <div className="bg-concrete border-2 border-bunker rounded-sm p-2 mb-2 shrink-0">
                  {/* Estado 1: Padrão */}
                  {chatRecordingState === 'default' && (
                    <div id="chat-default-bar" className="flex items-center gap-2">
                      <label 
                        title="Enviar Foto, Vídeo ou Áudio" 
                        className="w-10 h-10 rounded-sm bg-bunker hover:bg-concrete text-acid flex items-center justify-center cursor-pointer shrink-0 border border-bunker"
                      >
                        <Camera className="w-4 h-4" />
                        <input 
                          ref={fileInputChatRef} 
                          type="file" 
                          accept="image/*,video/*,audio/*" 
                          className="hidden" 
                          onChange={sendChatMedia} 
                        />
                      </label>
                      <input
                        id="chat-input"
                        type="text"
                        placeholder="Manda o papo..."
                        value={chatInput}
                        onFocus={() => {
                          setTimeout(() => scrollChatToBottom(true), 200);
                        }}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleChatSubmit();
                        }}
                        className="flex-1 bg-asphalt border border-bunker rounded-sm px-3 py-2 text-sm text-chalk focus:outline-none focus:border-acid font-mono"
                      />
                      <button
                        type="button"
                        onClick={startChatAudioRecord}
                        title="Gravar Áudio"
                        className="w-10 h-10 rounded-sm bg-bunker text-sprayCyan hover:border-sprayCyan flex items-center justify-center shrink-0 border border-bunker cursor-pointer active:scale-95 transition-all"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChatSubmit()}
                        className="bg-acid text-asphalt font-display tracking-widest px-4 py-2 rounded-sm text-sm shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer font-bold flex items-center gap-1"
                      >
                        <span>ENVIAR</span>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Estado 2: Gravando Áudio */}
                  {chatRecordingState === 'recording' && (
                    <div id="chat-recording-bar" className="flex items-center justify-between gap-2 bg-bunker p-1 rounded-sm border border-urbanOrange">
                      <div className="flex items-center gap-3 text-urbanOrange animate-pulse px-3">
                        <Mic className="w-5 h-5" />
                        <span id="chat-rec-timer" className="font-mono text-sm font-bold tracking-widest">
                          {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={pauseChatAudioRecord}
                        className="bg-urbanOrange text-asphalt font-display px-6 py-2 rounded-sm text-sm tracking-wider shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none cursor-pointer font-bold flex items-center gap-1.5"
                      >
                        <Square className="w-3 h-3 fill-asphalt" />
                        <span>PAUSAR</span>
                      </button>
                    </div>
                  )}

                  {/* Estado 3: Preview do Áudio */}
                  {chatRecordingState === 'preview' && (
                    <div id="chat-preview-bar" className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={discardChatAudio}
                        title="Descartar áudio"
                        className="w-10 h-10 rounded-sm bg-red-500/10 text-red-500 border border-red-500/50 flex items-center justify-center shrink-0 cursor-pointer hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="flex-1 bg-asphalt border border-sprayCyan/50 rounded-sm px-3 py-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-sprayCyan font-bold tracking-widest uppercase">ÁUDIO PRONTO</span>
                        <button
                          type="button"
                          onClick={playPreviewAudio}
                          className="w-8 h-8 flex items-center justify-center bg-sprayCyan/20 text-sprayCyan hover:bg-sprayCyan hover:text-asphalt rounded-sm cursor-pointer transition-colors"
                        >
                          {isPlayingPreview ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={sendChatAudio}
                        className="bg-acid text-asphalt font-display px-4 py-2 rounded-sm text-sm shrink-0 shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none cursor-pointer font-bold"
                      >
                        ENVIAR 🚀
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </main>

          {/* DOCK */}
          <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[460px] z-40 bg-asphalt/95 backdrop-blur-lg border-t-2 border-bunker px-4 py-2 ${virtualKeyboardHeight > 0 ? 'hidden' : 'flex'} items-center justify-around`}>
            <button
              id="nav-vault"
              onClick={() => setActiveTab('vault')}
              className={`flex flex-col items-center py-1 px-6 cursor-pointer transition-colors ${activeTab === 'vault' ? 'text-acid' : 'text-stencil hover:text-chalk'}`}
            >
              <Layers className="w-5 h-5 mb-1" />
              <span className="font-bebas tracking-widest text-xs">MÍDIAS</span>
            </button>
            <button
              onClick={() => {
                setPendingUploadData(null);
                setUploadCaption('');
                setIsUploadModalOpen(true);
              }}
              className="-mt-8 bg-acid text-asphalt font-display text-lg px-5 py-3 rounded-sm border-2 border-asphalt shadow-[4px_4px_0px_var(--color-urbanOrange)] active:translate-y-1 active:shadow-[1px_1px_0px_var(--color-urbanOrange)] transition-all cursor-pointer font-bold flex items-center gap-1.5"
            >
              <Plus className="w-5 h-5" />
              <span>ADD MÍDIA</span>
            </button>
            <button
              id="nav-chat"
              onClick={() => setActiveTab('chat')}
              className={`flex flex-col items-center py-1 px-6 cursor-pointer transition-colors ${activeTab === 'chat' ? 'text-acid' : 'text-stencil hover:text-chalk'}`}
            >
              <MessageSquare className="w-5 h-5 mb-1" />
              <span className="font-bebas tracking-widest text-xs">RESENHA</span>
            </button>
          </nav>

          {/* MODAL: ADD MÍDIA PRO VAULT */}
          {isUploadModalOpen && (
            <div id="modal-upload" className="fixed inset-0 z-50 bg-asphalt/90 backdrop-blur-md flex items-center justify-center p-4">
              <div className="w-full max-w-[400px] bg-concrete border-2 border-bunker rounded-sm p-5 shadow-2xl relative">
                <div className="absolute -top-3 -right-3 w-12 h-6 bg-acid/80 rotate-12 z-10"></div>

                <div className="flex justify-between items-center mb-6 border-b border-bunker pb-2 relative z-20">
                  <h3 className="font-display text-2xl text-chalk tracking-wide">NOVA MÍDIA</h3>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="text-stencil hover:text-chalk cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <label className="block w-full border-2 border-dashed border-bunker rounded-sm p-4 text-center cursor-pointer bg-asphalt mb-4 hover:border-acid transition-colors">
                  <input
                    type="file"
                    id="file-input-media"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleVaultFilePreview}
                  />
                  {!pendingUploadData ? (
                    <div id="upload-preview-placeholder" className="py-6">
                      <Upload className="w-8 h-8 text-acid mx-auto mb-2" />
                      <p className="font-mono text-sm text-chalk font-bold tracking-widest uppercase">Toque para adicionar</p>
                      <p className="font-mono text-[10px] text-stencil mt-1">FOTO OU VÍDEO (ALTA DEFINIÇÃO / GIF)</p>
                    </div>
                  ) : (
                    <div id="upload-preview-box" className="relative rounded-sm overflow-hidden max-h-56 flex items-center justify-center bg-asphalt border border-bunker">
                      {pendingUploadData.type === 'video' ? (
                        <video src={pendingUploadData.url} className="w-full h-48 object-cover" controls></video>
                      ) : (
                        <img src={pendingUploadData.url} alt="Preview" className="w-full h-48 object-cover" />
                      )}
                    </div>
                  )}
                </label>

                <label className="font-mono text-[10px] text-acid block mb-1 uppercase tracking-widest">Legenda do Drop</label>
                <input
                  id="upload-caption"
                  type="text"
                  placeholder="Escreva a legenda..."
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  className="w-full bg-asphalt border-2 border-bunker rounded-sm px-3 py-3 text-sm text-chalk mb-6 focus:border-acid focus:outline-none font-sans"
                />

                <button
                  type="button"
                  onClick={submitVaultDrop}
                  className="w-full bg-acid text-asphalt font-display text-xl tracking-widest py-3 rounded-sm border-2 border-asphalt shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-1 active:shadow-[1px_1px_0px_var(--color-asphalt)] transition-all cursor-pointer font-bold"
                >
                  PUBLICAR NA MÍDIA
                </button>
              </div>
            </div>
          )}

          {/* MODAL: SQUAD ID & PERFIL (Upload de Imagem ou GIF) */}
          {isSquadModalOpen && (
            <div id="modal-squad" className="fixed inset-0 z-50 bg-asphalt/90 backdrop-blur-md flex items-center justify-center p-4">
              <div className="w-full max-w-[420px] bg-concrete border-2 border-bunker rounded-sm p-5 shadow-2xl relative">
                <div className="absolute -top-3 -left-3 w-12 h-6 bg-urbanOrange/80 -rotate-12 z-10"></div>

                <div className="flex items-center justify-between pb-2 mb-5 border-b border-bunker relative z-20">
                  <h3 className="font-display text-2xl text-chalk tracking-wide">SQUAD ID</h3>
                  <button
                    type="button"
                    onClick={() => setIsSquadModalOpen(false)}
                    className="text-stencil hover:text-chalk cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div id="squad-edit-form" className="space-y-4 mb-6 max-h-[65vh] overflow-y-auto pr-1">
                  {squadMembers.map((m) => {
                    const isCurrent = m.id === activeMember.id;
                    const resolvedColor = normalizeSquadColor(m.color);
                    return (
                      <div
                        key={m.id}
                        className={`bg-asphalt border ${isCurrent ? 'border-acid' : 'border-bunker'} p-3.5 rounded-sm space-y-3`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg" style={{ color: resolvedColor }}>
                            {m.name} {isCurrent ? '(Você)' : ''}
                          </span>
                          <span className="font-mono text-[9px] text-stencil uppercase">{m.handle}</span>
                        </div>

                        {isCurrent ? (
                          <>
                            <div>
                              <label className="block font-mono text-[9px] text-acid uppercase tracking-widest mb-1">Sua Tag Personalizada:</label>
                              <input
                                type="text"
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value)}
                                className="w-full bg-concrete border border-bunker rounded-sm px-2.5 py-1.5 text-xs text-chalk font-mono focus:border-acid focus:outline-none"
                              />
                            </div>

                            {/* UPLOAD DE FOTO DE PERFIL / GIF POR ARQUIVO */}
                            <div>
                              <label className="block font-mono text-[9px] text-acid uppercase tracking-widest mb-1">Foto de Perfil (Arquivo ou GIF):</label>
                              
                              <div className="flex items-center gap-3 mb-2">
                                {editAvatar ? (
                                  <img
                                    src={editAvatar}
                                    alt="Preview Avatar"
                                    className="w-14 h-14 rounded-sm object-cover border-2 shrink-0"
                                    style={{ borderColor: resolvedColor }}
                                  />
                                ) : (
                                  <div
                                    className="w-14 h-14 rounded-sm bg-concrete border flex items-center justify-center font-display text-2xl shrink-0"
                                    style={{ borderColor: resolvedColor, color: resolvedColor }}
                                  >
                                    {m.name[0]}
                                  </div>
                                )}

                                <div className="flex-1">
                                  <label className="w-full bg-concrete hover:bg-bunker border border-bunker hover:border-acid rounded-sm p-2 text-center cursor-pointer block transition-colors">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={handleAvatarFileUpload}
                                    />
                                    <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-chalk">
                                      <Upload className="w-3.5 h-3.5 text-acid" />
                                      <span>ESCOLHER FOTO / GIF</span>
                                    </div>
                                  </label>
                                  {editAvatar && (
                                    <button
                                      type="button"
                                      onClick={() => setEditAvatar('')}
                                      className="text-[9px] font-mono text-red-400 hover:underline mt-1 block"
                                    >
                                      Remover foto
                                    </button>
                                  )}
                                </div>
                              </div>

                              <input
                                type="text"
                                value={editAvatar}
                                onChange={(e) => setEditAvatar(e.target.value)}
                                placeholder="Ou cole URL da foto / GIF"
                                className="w-full bg-concrete border border-bunker rounded-sm px-2 py-1 text-[10px] text-stencil font-mono focus:border-acid focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block font-mono text-[9px] text-acid uppercase tracking-widest mb-1">Sua Senha de Acesso:</label>
                              <input
                                type="password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder="Alterar ou definir senha"
                                className="w-full bg-concrete border border-bunker rounded-sm px-2.5 py-1.5 text-xs text-chalk font-mono focus:border-acid focus:outline-none"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2.5 pt-1">
                            {m.customAvatar ? (
                              <img src={m.customAvatar} alt={m.name} className="w-9 h-9 rounded-sm object-cover border" style={{ borderColor: resolvedColor }} />
                            ) : (
                              <div className="w-9 h-9 rounded-sm bg-concrete flex items-center justify-center font-display text-sm" style={{ color: resolvedColor }}>
                                {m.name[0]}
                              </div>
                            )}
                            <p className="font-mono text-[10px] text-chalk">Tag: {m.role || 'Membro do Trio'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={saveSquadProfile}
                  className="w-full bg-acid text-asphalt font-display text-xl tracking-widest py-3 rounded-sm border-2 border-asphalt shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-1 active:shadow-none transition-all cursor-pointer font-bold"
                >
                  SALVAR ALTERAÇÕES
                </button>
              </div>
            </div>
          )}

          {/* FULL MEDIA MODAL COM DOWNLOAD EM ALTA QUALIDADE */}
          {fullMediaModalItem && (
            <div
              className="fixed inset-0 z-[120] bg-asphalt/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-5"
            >
              {/* Header do Modal */}
              <div className="w-full max-w-xl flex items-center justify-between pb-2 border-b border-bunker z-10">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="font-display tracking-wider uppercase text-base" style={{ color: normalizeSquadColor(fullMediaModalItem.authorColor) }}>
                    {fullMediaModalItem.authorName}
                  </span>
                  <span className="text-stencil font-mono text-[10px]">
                    {new Date(fullMediaModalItem.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadMediaFile(fullMediaModalItem.url, `TMJ_${fullMediaModalItem.id}.${fullMediaModalItem.type === 'video' ? 'mp4' : 'jpg'}`)}
                    className="bg-acid text-asphalt font-mono text-xs font-bold px-3 py-1.5 rounded-sm flex items-center gap-1.5 shadow-sm active:translate-y-0.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>BAIXAR ORIGINAL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullMediaModalItem(null)}
                    className="w-8 h-8 rounded-sm bg-bunker text-chalk hover:bg-concrete flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Mídia Central */}
              <div className="flex-1 w-full max-w-xl flex items-center justify-center py-2 min-h-0">
                {fullMediaModalItem.type === 'video' ? (
                  <video src={fullMediaModalItem.url} controls autoPlay playsInline className="max-w-full max-h-[72vh] object-contain rounded-sm" />
                ) : (
                  <img src={fullMediaModalItem.url} alt="Full view" className="max-w-full max-h-[72vh] object-contain rounded-sm shadow-2xl" />
                )}
              </div>

              {/* Legenda na base */}
              {fullMediaModalItem.caption && (
                <div className="w-full max-w-xl bg-concrete/90 border border-bunker p-2.5 rounded-sm text-center">
                  <p className="font-sans text-xs text-chalk">{fullMediaModalItem.caption}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
