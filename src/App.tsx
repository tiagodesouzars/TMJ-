import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  doc, 
  getDoc,
  getDocs,
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
  Eye,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import { StreetVideoPlayer } from './components/StreetVideoPlayer';
import { MediaReactions, FIXED_REACTION_EMOJIS } from './components/MediaReactions';
import { 
  uploadVaultMedia, 
  uploadChatMedia, 
  uploadAvatarMedia, 
  uploadFileToCloudStorage,
  uploadMediaWithFallback,
  uploadVaultMediaWithStrategy,
  deleteVideoChunks,
  fetchAndAssembleChunkedVideo
} from './utils/mediaStorage';
import {
  saveVaultDropsToIndexedDB,
  loadVaultDropsFromIndexedDB,
  saveChatMessagesToIndexedDB,
  loadChatMessagesFromIndexedDB
} from './utils/localMediaDB';

const TMJ_LOGO_URL = '/assets/aistudio/file_00000000547c820ea5b46970c320d81b_15046822.png';
const TMJ_BANNER_URL = '/assets/aistudio/download_ce7e2314.jpg';

// Helper to get or generate persistent device ID for visitors/viewers
export const getViewerDeviceId = (): string => {
  const DEVICE_STORAGE_KEY = 'tmj_viewer_device_id_v2';
  try {
    let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    // Fallback if localStorage is disabled or in private window:
    // Memory session variable that resets on F5/refresh as requested by user
    if (typeof window !== 'undefined') {
      const win = window as any;
      if (!win.__tmj_session_device_id) {
        win.__tmj_session_device_id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      }
      return win.__tmj_session_device_id;
    }
    return 'dev_guest';
  }
};

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
  midiaUrl?: string;
  caption?: string;
  timestamp: number;
  comments?: VaultComment[];
  reactions?: Record<string, number>;
  reactedBy?: Record<string, string[]>;
  deviceReactions?: Record<string, string>;
  isChunked?: boolean;
  totalChunks?: number;
}

export interface ChatMessage {
  id: string;
  docId?: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorAvatar?: string | null;
  text?: string;
  mediaUrl?: string | null;
  midiaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  audioUrl?: string | null;
  duration?: number | null;
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

export function cleanFirestoreData<T extends Record<string, any>>(data: T): T {
  const cleaned: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}


export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'login' | 'app'>('splash');
  const [activeTab, setActiveTab] = useState<'vault' | 'chat'>('vault');
  const [vaultViewMode, setVaultViewMode] = useState<'feed' | 'grid'>('feed');
  const [isViewerMode, setIsViewerMode] = useState<boolean>(false);

  const [squadMembers, setSquadMembers] = useState<SquadMember[]>(DEFAULT_SQUAD);
  const [activeMember, setActiveMember] = useState<SquadMember | null>(null);
  const [selectedLoginUser, setSelectedLoginUser] = useState<SquadMember | null>(null);

  // Instant LocalStorage Cache Helpers (Prevents data loss on page refresh)
  const loadCachedVaultItems = (): VaultItem[] => {
    try {
      const cached = localStorage.getItem('tmj_vault_cached_drops_v3');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  };

  const loadCachedChatMessages = (): ChatMessage[] => {
    try {
      const cached = localStorage.getItem('tmj_chat_cached_messages_v3');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  };

  const saveVaultItemsToCache = (items: VaultItem[]) => {
    // 1. Salva com 100% de fidelidade no IndexedDB (sem limite de 5MB, nunca apaga URLs)
    saveVaultDropsToIndexedDB(items);

    // 2. Salva no localStorage com URLs completas para carregamento instantâneo
    try {
      localStorage.setItem('tmj_vault_cached_drops_v3', JSON.stringify(items.slice(0, 30)));
    } catch {
      try {
        localStorage.setItem('tmj_vault_cached_drops_v3', JSON.stringify(items.slice(0, 10)));
      } catch (e) {
        console.warn('LocalStorage no limite, IndexedDB ativo como cache primário:', e);
      }
    }
  };

  const saveChatMessagesToCache = (messages: ChatMessage[]) => {
    saveChatMessagesToIndexedDB(messages);
    try {
      localStorage.setItem('tmj_chat_cached_messages_v3', JSON.stringify(messages.slice(-50)));
    } catch {}
  };

  const [vaultItems, setVaultItems] = useState<VaultItem[]>(loadCachedVaultItems);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(loadCachedChatMessages);

  // Carrega drops do IndexedDB no boot caso o LocalStorage estivesse com menos itens
  useEffect(() => {
    loadVaultDropsFromIndexedDB().then((indexedDrops) => {
      if (indexedDrops && indexedDrops.length > 0) {
        setVaultItems((prev) => {
          const map = new Map<string, VaultItem>();
          [...prev, ...indexedDrops].forEach((item) => {
            const key = item.docId || item.id;
            if (key && !map.has(key)) map.set(key, item);
          });
          const list = Array.from(map.values());
          list.sort((a, b) => b.timestamp - a.timestamp);
          return list;
        });
      }
    });

    loadChatMessagesFromIndexedDB().then((indexedMsgs) => {
      if (indexedMsgs && indexedMsgs.length > 0) {
        setChatMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          [...prev, ...indexedMsgs].forEach((m) => {
            const key = m.docId || m.id;
            if (key && !map.has(key)) map.set(key, m);
          });
          const list = Array.from(map.values());
          list.sort((a, b) => a.timestamp - b.timestamp);
          return list;
        });
      }
    });
  }, []);

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
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState<boolean>(false);
  const [uploadProgressStatus, setUploadProgressStatus] = useState<string>('');
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

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
  const [isChatInputFocused, setIsChatInputFocused] = useState(false);
  const initialWindowHeightRef = useRef<number>(typeof window !== 'undefined' ? window.innerHeight : 800);

  // Concurrency locks to guarantee zero duplicated drops or messages
  const isSubmittingVaultRef = useRef(false);
  const isSendingChatMediaRef = useRef(false);
  const isSendingChatTextRef = useRef(false);

  const isKeyboardOpen = isChatInputFocused || virtualKeyboardHeight > 0;

  const appId = 'triotmj-3187e';

  // Helper to persist a member to Firestore (saves to both root and artifacts path with timeout protection)
  const persistMemberToFirestore = async (member: SquadMember) => {
    const isBase64Avatar = member.customAvatar?.startsWith('data:');
    const cleanMember: SquadMember = {
      id: member.id,
      name: member.name,
      handle: member.handle,
      role: member.role || '',
      color: member.color,
      password: member.password ?? null,
      customAvatar: isBase64Avatar ? null : (member.customAvatar ?? null)
    };
    try {
      // Timeout de 2.5s para evitar que qualquer lentidão na rede trave a aplicação
      const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
      const writeOps = Promise.all([
        setDoc(doc(db, 'tmj_members', member.id), cleanMember, { merge: true }).catch(() => null),
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_members', member.id), cleanMember, { merge: true }).catch(() => null)
      ]);
      await Promise.race([writeOps, timeout]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tmj_members/${member.id}`);
    }
  };

  // Seeding guard refs to prevent infinite loop triggers
  const isMembersSeededRef = useRef(false);
  const isMigrationRunningRef = useRef(false);

  // Wipe all legacy Firestore data and rebuild Trio TMJ structure under the new terms (midiaUrl + Cloud Storage)
  const purgeAndRebuildFirestoreNewTerms = async () => {
    const collectionsToClear = [
      collection(db, 'tmj_vault'),
      collection(db, 'tmj_chat'),
      collection(db, 'tmj_vault_chunks'),
      collection(db, 'artifacts', appId, 'public', 'data', 'tmj_vault'),
      collection(db, 'artifacts', appId, 'public', 'data', 'tmj_chat'),
      collection(db, 'artifacts', appId, 'public', 'data', 'tmj_vault_chunks')
    ];

    for (const colRef of collectionsToClear) {
      try {
        const snap = await getDocs(colRef);
        for (const d of snap.docs) {
          await deleteDoc(d.ref).catch(() => null);
        }
      } catch {
        // Ignore if collection does not exist
      }
    }

    // Re-seed clean Trio TMJ members under the new terms
    for (const m of DEFAULT_SQUAD) {
      await persistMemberToFirestore(m);
    }
    setSquadMembers(DEFAULT_SQUAD);
    setVaultItems([]);

    // Welcome message in Resenha confirming new terms
    const welcomeMsg: ChatMessage = {
      id: 'msg_init_terms_v3',
      authorId: 't1',
      authorName: 'TIAGO',
      authorColor: 'var(--color-acid)',
      text: 'Banco Trio TMJ recriado do zero nos novos termos (Cloud Storage + midiaUrl)! 🔥',
      timestamp: Date.now()
    };
    await setDoc(doc(db, 'tmj_chat', welcomeMsg.id), welcomeMsg).catch(() => null);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_chat', welcomeMsg.id), welcomeMsg).catch(() => null);
    setChatMessages([welcomeMsg]);

    // Record migration completion in Firestore
    await setDoc(doc(db, 'tmj_meta', 'terms_v3_clean'), {
      completed: true,
      version: 'v3_cloud_storage_midiaUrl',
      projectId: appId,
      updatedAt: Date.now()
    }).catch(() => null);
  };

  // Dynamic visual viewport detection for mobile virtual keyboard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    initialWindowHeightRef.current = Math.max(window.innerHeight, initialWindowHeightRef.current);

    const handleVisualViewportResize = () => {
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const baseHeight = Math.max(window.innerHeight, initialWindowHeightRef.current);
      const keyboardOffset = Math.max(0, Math.round(baseHeight - viewportHeight));

      if (keyboardOffset > 110) {
        setVirtualKeyboardHeight(keyboardOffset);
      } else {
        setVirtualKeyboardHeight(0);
        if (document.activeElement?.id !== 'chat-input') {
          setIsChatInputFocused(false);
        }
      }
    };

    window.visualViewport?.addEventListener('resize', handleVisualViewportResize);
    window.addEventListener('resize', handleVisualViewportResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
      window.removeEventListener('resize', handleVisualViewportResize);
    };
  }, []);

  // 1. Initial Firestore Setup, One-Time Legacy Wipe & Real-time Listeners (with loop guards)
  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(() => null);
    }

    let unsubMembers: (() => void) | null = null;
    let unsubVault: (() => void) | null = null;
    let unsubChat: (() => void) | null = null;
    let isCancelled = false;

    const initFirestoreAndListeners = async () => {
      if (isCancelled) return;

      // Members sync: listens to root tmj_members, auto-seeds clean Trio TMJ members if empty
      const membersColRef = collection(db, 'tmj_members');
      unsubMembers = onSnapshot(membersColRef, async (snap) => {
        if (snap.empty) {
          setSquadMembers(DEFAULT_SQUAD);
          if (!isMembersSeededRef.current) {
            isMembersSeededRef.current = true;
            for (const m of DEFAULT_SQUAD) {
              await persistMemberToFirestore(m);
            }
          }
        } else {
          isMembersSeededRef.current = true;
          const loaded = snap.docs.map((d) => {
            const data = d.data();
            const localPwd = typeof window !== 'undefined' ? localStorage.getItem(`tmj_pwd_${d.id}`) : null;
            return {
              ...data,
              id: d.id,
              password: data.password || localPwd || null
            } as SquadMember;
          });
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

      // Vault sync: listens to root tmj_vault under new terms (midiaUrl)
      const vaultColRef = collection(db, 'tmj_vault');
      unsubVault = onSnapshot(vaultColRef, (snap) => {
        if (snap.empty) {
          // Mantém os dados locais caso existam no cache, evitando tela branca
          const cached = loadCachedVaultItems();
          if (cached.length > 0) {
            setVaultItems(cached);
          } else {
            setVaultItems([]);
          }
        } else {
          const map = new Map<string, VaultItem>();
          snap.docs.forEach((d) => {
            const data = d.data();
            const effectiveUrl = data.midiaUrl || data.url || '';
            const key = d.id;
            map.set(key, {
              ...data,
              id: data.id || d.id,
              docId: d.id,
              url: effectiveUrl,
              midiaUrl: effectiveUrl
            } as VaultItem);
          });
          const items = Array.from(map.values());
          items.sort((a, b) => b.timestamp - a.timestamp);
          setVaultItems(items);
          saveVaultItemsToCache(items);
        }
      }, (err) => {
        console.warn('Aviso de sincronização do Vault no Firestore:', err);
        handleFirestoreError(err, OperationType.LIST, 'tmj_vault');
        // Carrega drops do cache persistente para visualização imediata
        const cached = loadCachedVaultItems();
        if (cached.length > 0) setVaultItems(cached);
      });

      // Chat sync: listens to root tmj_chat under new terms (midiaUrl)
      const chatColRef = collection(db, 'tmj_chat');
      unsubChat = onSnapshot(chatColRef, (snap) => {
        if (snap.empty) {
          const cached = loadCachedChatMessages();
          if (cached.length > 0) setChatMessages(cached);
        } else {
          const map = new Map<string, ChatMessage>();
          snap.docs.forEach((d) => {
            const data = d.data();
            const effectiveMedia = data.midiaUrl || data.mediaUrl;
            const effectiveAudio = data.audioUrl;
            const key = d.id;
            map.set(key, {
              ...data,
              id: data.id || d.id,
              docId: d.id,
              mediaUrl: effectiveMedia,
              audioUrl: effectiveAudio,
              midiaUrl: effectiveMedia || effectiveAudio
            } as ChatMessage);
          });
          const msgs = Array.from(map.values());
          msgs.sort((a, b) => a.timestamp - b.timestamp);
          setChatMessages(msgs);
          saveChatMessagesToCache(msgs);
        }
      }, (err) => {
        console.warn('Aviso de sincronização do Chat no Firestore:', err);
        handleFirestoreError(err, OperationType.LIST, 'tmj_chat');
        const cached = loadCachedChatMessages();
        if (cached.length > 0) setChatMessages(cached);
      });
    };

    initFirestoreAndListeners();

    return () => {
      isCancelled = true;
      if (unsubMembers) unsubMembers();
      if (unsubVault) unsubVault();
      if (unsubChat) unsubChat();
    };
  }, []);

  // Auto-scroll chat on new messages or tab open without locking manual scroll
  const scrollChatToBottom = (smooth = true) => {
    if (chatListRef.current) {
      chatListRef.current.scrollTo({
        top: chatListRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      const timer = setTimeout(() => scrollChatToBottom(false), 60);
      return () => clearTimeout(timer);
    }
  }, [chatMessages.length, activeTab]);

  // Keep activeMember and selectedLoginUser in sync with freshest squad state without infinite re-render loops
  useEffect(() => {
    if (activeMember && !isViewerMode) {
      const found = squadMembers.find((m) => m.id === activeMember.id);
      if (found && (
        found.name !== activeMember.name ||
        found.role !== activeMember.role ||
        found.color !== activeMember.color ||
        found.password !== activeMember.password ||
        found.customAvatar !== activeMember.customAvatar
      )) {
        setActiveMember(found);
      }
    }
    if (selectedLoginUser) {
      const foundSelected = squadMembers.find((m) => m.id === selectedLoginUser.id);
      if (foundSelected && (
        foundSelected.name !== selectedLoginUser.name ||
        foundSelected.role !== selectedLoginUser.role ||
        foundSelected.color !== selectedLoginUser.color ||
        foundSelected.password !== selectedLoginUser.password ||
        foundSelected.customAvatar !== selectedLoginUser.customAvatar
      )) {
        setSelectedLoginUser(foundSelected);
      }
    }
  }, [squadMembers, isViewerMode]);


  // Download media helper
  const downloadMediaFile = async (url: string, filename: string, dropId?: string, isChunked?: boolean) => {
    try {
      let downloadUrl = url;
      if ((isChunked || url === 'chunked') && dropId) {
        downloadUrl = await fetchAndAssembleChunkedVideo(dropId);
      }
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      if (url && url !== 'chunked') {
        window.open(url, '_blank');
      }
    }
  };

  // Login handler
  const handleSelectLoginMember = (member: SquadMember) => {
    const latestMember = squadMembers.find((m) => m.id === member.id) || member;
    const localPwd = typeof window !== 'undefined' ? localStorage.getItem(`tmj_pwd_${latestMember.id}`) : null;
    const effectivePwd = latestMember.password || localPwd || null;
    const resolvedMember: SquadMember = { ...latestMember, password: effectivePwd };

    setSelectedLoginUser(resolvedMember);
    setIsPasswordPromptOpen(true);
    setPasswordInput('');

    if (!effectivePwd || effectivePwd.trim() === '') {
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
    const localPwd = typeof window !== 'undefined' ? localStorage.getItem(`tmj_pwd_${latestUser.id}`) : null;
    const effectivePwd = latestUser.password || localPwd || null;

    if (!effectivePwd || effectivePwd.trim() === '') {
      setIsSavingPassword(true);
      const updated: SquadMember = { ...latestUser, password: inputVal };

      // 1. Salva imediatamente no localStorage (Zero latência, nunca se perde)
      try {
        localStorage.setItem(`tmj_pwd_${updated.id}`, inputVal);
      } catch {}

      // 2. Transição instantânea de tela e estado (impede "banco infinitado")
      setSquadMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setActiveMember(updated);
      setIsPasswordPromptOpen(false);
      setPasswordInput('');
      setCurrentScreen('app');
      setIsSavingPassword(false);

      // 3. Persistência no Firestore em background com timeout de segurança
      persistMemberToFirestore(updated).catch((err) => {
        console.warn('Sincronização em background da senha no Firestore:', err);
      });
    } else {
      if (String(effectivePwd).trim() === inputVal) {
        const loggedUser: SquadMember = { ...latestUser, password: inputVal };
        setActiveMember(loggedUser);
        setIsPasswordPromptOpen(false);
        setPasswordInput('');
        setCurrentScreen('app');
      } else {
        setPasswordTitle('SENHA INCORRETA ❌');
        setTimeout(() => {
          setPasswordTitle(`LOGIN: ${latestUser.name}`);
        }, 1500);
      }
    }
  };

  // Helper to cleanly close and reset all upload states (prevents infinite loading state)
  const closeAndResetUploadModal = () => {
    setIsUploadModalOpen(false);
    setIsUploadingMedia(false);
    setUploadProgressPercent(0);
    setUploadProgressStatus('');
    setPendingUploadData(null);
    setSelectedUploadFile(null);
    setUploadCaption('');
    setUploadErrorMessage(null);
    isSubmittingVaultRef.current = false;
  };

  const handleOpenUploadModal = () => {
    closeAndResetUploadModal();
    setIsUploadModalOpen(true);
  };

  // Vault Actions
  const handleVaultFilePreview = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedUploadFile(file);

    const isVideo = file.type.startsWith('video');
    const localUrl = URL.createObjectURL(file);
    setPendingUploadData({
      type: isVideo ? 'video' : 'image',
      url: localUrl
    });
  };

  const submitVaultDrop = async () => {
    if (!pendingUploadData || !activeMember) {
      return;
    }
    // Previne envio duplicado por múltiplos cliques rápidos ou eventos simultâneos de touch
    if (isSubmittingVaultRef.current) {
      return;
    }
    isSubmittingVaultRef.current = true;
    setUploadErrorMessage(null);

    const dropId = 'drop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    setIsUploadingMedia(true);
    setUploadProgressPercent(5);
    setUploadProgressStatus('Preparando envio da mídia...');

    try {
      let finalUrl = pendingUploadData.url;
      let isChunked = false;
      let totalChunks = 0;

      if (selectedUploadFile) {
        setUploadProgressStatus('Otimizando e enviando mídia...');
        const uploadResult = await uploadVaultMediaWithStrategy(
          selectedUploadFile,
          dropId,
          (status, pct) => {
            setUploadProgressStatus(status);
            if (pct !== undefined) {
              setUploadProgressPercent(pct);
            }
          }
        );
        finalUrl = uploadResult.url;
        isChunked = uploadResult.isChunked;
        totalChunks = uploadResult.totalChunks;
      }

      setUploadProgressPercent(98);
      setUploadProgressStatus('Gravando na Mídia do Squad...');

      const newDrop: VaultItem = {
        id: dropId,
        docId: dropId,
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorColor: activeMember.color || 'var(--color-acid)',
        type: pendingUploadData.type,
        url: finalUrl,
        midiaUrl: finalUrl,
        isChunked,
        totalChunks,
        caption: uploadCaption.trim() || '',
        timestamp: Date.now(),
        comments: [],
        reactions: {},
        reactedBy: {},
        deviceReactions: {}
      };

      const cleanDrop = cleanFirestoreData(newDrop);

      // 1. Atualiza estado local e cache persistente imediatamente (Zero latência, nunca se perde)
      setVaultItems((prev) => {
        const map = new Map<string, VaultItem>();
        [newDrop, ...prev].forEach((item) => {
          const key = item.docId || item.id;
          if (key && !map.has(key)) map.set(key, item);
        });
        const updatedList = Array.from(map.values());
        saveVaultItemsToCache(updatedList);
        return updatedList;
      });

      // 2. Salva no Firestore com timeout de segurança (3.5s) para não travar a tela
      try {
        const writeTimeout = new Promise((resolve) => setTimeout(resolve, 3500));
        const writeOp = Promise.all([
          setDoc(doc(db, 'tmj_vault', newDrop.id), cleanDrop),
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', newDrop.id), cleanDrop).catch(() => null)
        ]);
        await Promise.race([writeOp, writeTimeout]);
      } catch (dbErr) {
        console.warn('Persistência Firestore em background do drop:', dbErr);
      }

      setUploadProgressPercent(100);
      setUploadProgressStatus('Drop publicado com sucesso!');

      // Fecha o modal e reseta todos os estados de upload de forma limpa
      setTimeout(() => {
        closeAndResetUploadModal();
      }, 350);
    } catch (err: any) {
      console.warn('Erro ao processar envio de mídia:', err);
      setUploadErrorMessage(err?.message || 'Falha ao salvar mídia. Verifique a conexão e tente novamente.');
      setUploadProgressStatus('');
      setUploadProgressPercent(0);
      setIsUploadingMedia(false);
      isSubmittingVaultRef.current = false;
    } finally {
      isSubmittingVaultRef.current = false;
      setIsUploadingMedia(false);
    }
  };

  const deleteVaultItem = async (docId: string) => {
    setVaultItems((prev) => {
      const filtered = prev.filter((item) => (item.docId || item.id) !== docId);
      saveVaultItemsToCache(filtered);
      return filtered;
    });
    try {
      await deleteDoc(doc(db, 'tmj_vault', docId)).catch(() => null);
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', docId)).catch(() => null);
      await deleteVideoChunks(docId).catch(() => null);
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
    setVaultItems((prev) => {
      const updated = prev.map((i) => ((i.docId || i.id) === docId ? updatedItem : i));
      saveVaultItemsToCache(updated);
      return updated;
    });

    try {
      await setDoc(doc(db, 'tmj_vault', docId), updatedItem, { merge: true }).catch(() => null);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', docId), updatedItem, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tmj_vault/${docId}`);
    }
  };

  // Helper to get persistent identifier for user or viewer device
  const getCurrentActorId = () => {
    if (isViewerMode) return getViewerDeviceId();
    return activeMember?.id || getViewerDeviceId();
  };

  // Entry handler for Visualizar (Guest / Public viewer)
  const handleEnterViewerMode = () => {
    const viewerDeviceId = getViewerDeviceId();
    const guestMember: SquadMember = {
      id: viewerDeviceId,
      name: 'VISUALIZADOR',
      handle: '@espectador',
      role: 'Apenas Ver',
      color: 'var(--color-sprayCyan)',
      password: null,
      customAvatar: null
    };
    setIsViewerMode(true);
    setActiveMember(guestMember);
    setActiveTab('vault');
    setCurrentScreen('app');
  };

  // Emoji Reaction Toggle: 1 REACTION PER DEVICE for Visualizador & Members
  const handleToggleReaction = async (docId: string, emoji: string) => {
    const item = vaultItems.find((i) => (i.docId || i.id) === docId);
    if (!item) return;

    // Use device ID for visualizador, member ID for squad
    const actorId = isViewerMode ? getViewerDeviceId() : (activeMember?.id || getViewerDeviceId());

    const currentReactions: Record<string, number> = { ...(item.reactions || {}) };
    const currentReactedBy: Record<string, string[]> = { ...(item.reactedBy || {}) };
    const currentDeviceReactions: Record<string, string> = { ...(item.deviceReactions || {}) };

    // What emoji has this device or member already chosen for this drop?
    const previousEmoji = currentDeviceReactions[actorId] || (
      Object.keys(currentReactedBy).find((e) => currentReactedBy[e]?.includes(actorId))
    );

    let updatedReactions = { ...currentReactions };
    let updatedReactedBy = { ...currentReactedBy };
    let updatedDeviceReactions = { ...currentDeviceReactions };

    if (previousEmoji === emoji) {
      // Tapped the same emoji again -> remove reaction (toggle off)
      delete updatedDeviceReactions[actorId];

      const prevList = updatedReactedBy[emoji] || [];
      updatedReactedBy[emoji] = prevList.filter((u) => u !== actorId);
      updatedReactions[emoji] = Math.max(0, (updatedReactions[emoji] || 1) - 1);
    } else {
      // 1 REACTION PER DEVICE:
      // If there was an earlier reaction on this device, decrement it and remove this actor
      if (previousEmoji) {
        const prevList = updatedReactedBy[previousEmoji] || [];
        updatedReactedBy[previousEmoji] = prevList.filter((u) => u !== actorId);
        updatedReactions[previousEmoji] = Math.max(0, (updatedReactions[previousEmoji] || 1) - 1);
      }

      // Add the new reaction
      updatedDeviceReactions[actorId] = emoji;
      const newList = updatedReactedBy[emoji] || [];
      if (!newList.includes(actorId)) {
        updatedReactedBy[emoji] = [...newList, actorId];
      }
      updatedReactions[emoji] = (updatedReactions[emoji] || 0) + 1;
    }

    const updatedItem: VaultItem = {
      ...item,
      reactions: updatedReactions,
      reactedBy: updatedReactedBy,
      deviceReactions: updatedDeviceReactions
    };

    setVaultItems((prev) => {
      const updated = prev.map((i) => ((i.docId || i.id) === docId ? updatedItem : i));
      saveVaultItemsToCache(updated);
      return updated;
    });

    if (fullMediaModalItem && (fullMediaModalItem.docId || fullMediaModalItem.id) === docId) {
      setFullMediaModalItem(updatedItem);
    }

    try {
      await setDoc(
        doc(db, 'tmj_vault', docId),
        { 
          reactions: updatedReactions, 
          reactedBy: updatedReactedBy, 
          deviceReactions: updatedDeviceReactions 
        },
        { merge: true }
      ).catch(() => null);
      await setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'tmj_vault', docId),
        { 
          reactions: updatedReactions, 
          reactedBy: updatedReactedBy, 
          deviceReactions: updatedDeviceReactions 
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tmj_vault/${docId}`);
    }
  };

  // Chat Actions
  const handleChatSubmit = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : chatInput).trim();
    if (!textToSend || !activeMember) return;

    if (isSendingChatTextRef.current) return;
    isSendingChatTextRef.current = true;

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const msg: ChatMessage = {
      id: msgId,
      docId: msgId,
      authorId: activeMember.id,
      authorName: activeMember.name,
      authorColor: activeMember.color || 'var(--color-acid)',
      authorAvatar: activeMember.customAvatar || null,
      text: textToSend,
      timestamp: Date.now()
    };

    setChatInput('');
    setChatMessages((prev) => {
      const map = new Map<string, ChatMessage>();
      [...prev, msg].forEach((m) => {
        const key = m.docId || m.id;
        if (key && !map.has(key)) map.set(key, m);
      });
      const updatedList = Array.from(map.values());
      saveChatMessagesToCache(updatedList);
      return updatedList;
    });

    try {
      const cleanMsg = cleanFirestoreData(msg);
      const writeTimeout = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([
        setDoc(doc(db, 'tmj_chat', msg.id), cleanMsg),
        writeTimeout
      ]);
    } catch (err) {
      console.warn('Erro ao salvar chat no Firestore:', err);
      handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
    } finally {
      isSendingChatTextRef.current = false;
    }
  };

  // Delete message from chat
  const deleteChatMessage = async (msgId: string) => {
    setChatMessages((prev) => {
      const filtered = prev.filter((m) => (m.docId || m.id) !== msgId);
      saveChatMessagesToCache(filtered);
      return filtered;
    });
    try {
      await deleteDoc(doc(db, 'tmj_chat', msgId)).catch(() => null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tmj_chat/${msgId}`);
    }
  };

  const sendChatMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeMember) return;
    // Reset file input value to allow re-upload of the same file if desired
    event.target.value = '';

    if (isSendingChatMediaRef.current) return;
    isSendingChatMediaRef.current = true;

    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');

    try {
      const downloadUrl = await uploadChatMedia(file);

      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const msg: ChatMessage = {
        id: msgId,
        docId: msgId,
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorColor: activeMember.color || 'var(--color-acid)',
        authorAvatar: activeMember.customAvatar || null,
        mediaUrl: isAudio ? null : downloadUrl,
        midiaUrl: downloadUrl,
        mediaType: isVideo ? 'video' : isAudio ? null : 'image',
        audioUrl: isAudio ? downloadUrl : null,
        duration: isAudio ? 10 : null,
        timestamp: Date.now()
      };

      const cleanMsg = cleanFirestoreData(msg);
      setChatMessages((prev) => {
        const map = new Map<string, ChatMessage>();
        [...prev, cleanMsg].forEach((m) => {
          const key = m.docId || m.id;
          if (key && !map.has(key)) map.set(key, m);
        });
        const updatedList = Array.from(map.values());
        saveChatMessagesToCache(updatedList);
        return updatedList;
      });

      const writeTimeout = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([
        setDoc(doc(db, 'tmj_chat', msg.id), cleanMsg),
        writeTimeout
      ]);
    } catch (err) {
      console.error('Erro ao enviar mídia para o chat:', err);
      handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
    } finally {
      isSendingChatMediaRef.current = false;
    }
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

  const sendChatAudio = async () => {
    if (!recordedAudioBlob || !activeMember) return;
    const blobToSend = recordedAudioBlob;
    const durationToSend = recSeconds;
    discardChatAudio();

    try {
      const downloadUrl = await uploadChatMedia(blobToSend);

      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const msg: ChatMessage = {
        id: msgId,
        docId: msgId,
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorColor: activeMember.color || 'var(--color-acid)',
        authorAvatar: activeMember.customAvatar || null,
        audioUrl: downloadUrl,
        midiaUrl: downloadUrl,
        duration: durationToSend || 5,
        timestamp: Date.now()
      };

      const cleanMsg = cleanFirestoreData(msg);
      setChatMessages((prev) => {
        const map = new Map<string, ChatMessage>();
        [...prev, cleanMsg].forEach((m) => {
          const key = m.docId || m.id;
          if (key && !map.has(key)) map.set(key, m);
        });
        const updatedList = Array.from(map.values());
        saveChatMessagesToCache(updatedList);
        return updatedList;
      });

      const writeTimeout = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([
        setDoc(doc(db, 'tmj_chat', msg.id), cleanMsg),
        writeTimeout
      ]);
    } catch (err) {
      console.error('Erro ao enviar áudio para o chat:', err);
      handleFirestoreError(err, OperationType.WRITE, 'tmj_chat');
    }
  };

  const togglePlayChatAudio = (audioId: string, duration?: number | null) => {
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

  // Avatar file upload handler (Image or animated GIF via Cloud Storage)
  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMember) return;
    e.target.value = '';

    try {
      // Direct upload to Cloud Storage for Firebase (Zero Base64 in Firestore)
      const downloadUrl = await uploadAvatarMedia(file, activeMember.id);
      setEditAvatar(downloadUrl);
    } catch (err) {
      console.error('Erro ao fazer upload do avatar para Cloud Storage:', err);
      alert('Erro ao enviar avatar para o Cloud Storage. Tente novamente.');
    }
  };

  const saveSquadProfile = async () => {
    if (!activeMember) return;
    const newPassword = editPassword.trim() || activeMember.password || null;
    const updated: SquadMember = {
      ...activeMember,
      role: editRole.trim(),
      customAvatar: editAvatar.trim() || null,
      password: newPassword
    };

    if (newPassword) {
      try {
        localStorage.setItem(`tmj_pwd_${updated.id}`, newPassword);
      } catch {}
    }

    setActiveMember(updated);
    setSquadMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setIsSquadModalOpen(false);

    persistMemberToFirestore(updated).catch((err) => {
      console.warn('Erro ao atualizar perfil no Firestore em background:', err);
    });
  };

  // Limpar todos os dados antigos e recriar banco do Trio TMJ no Firestore sob novos termos
  const handleResetAndReseedDatabase = async () => {
    try {
      await purgeAndRebuildFirestoreNewTerms();
      setIsSquadModalOpen(false);
    } catch (err) {
      console.error('Erro ao recriar banco:', err);
    }
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

          {/* NOVA ENTRADA: VISUALIZAR (ACESSO PÚBLICO SEM LOGIN) */}
          <div className="w-full pt-3 mt-1">
            <button
              type="button"
              onClick={handleEnterViewerMode}
              className="w-full bg-concrete hover:bg-bunker border-2 border-sprayCyan/70 hover:border-sprayCyan p-3 rounded-sm flex items-center justify-between cursor-pointer transition-all shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-0.5 active:shadow-none group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-sm bg-asphalt border border-sprayCyan/60 flex items-center justify-center text-sprayCyan group-hover:bg-sprayCyan group-hover:text-asphalt transition-colors shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-display text-lg sm:text-xl text-chalk tracking-wide leading-none">VISUALIZAR</h4>
                    <span className="font-mono text-[8px] bg-sprayCyan/20 text-sprayCyan px-1.5 py-0.5 rounded-xs border border-sprayCyan/40 font-bold uppercase">
                      LIVRE
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-stencil mt-1">
                    Ver fotos, vídeos e reagir com emojis
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-sprayCyan group-hover:translate-x-1 transition-transform shrink-0" />
            </button>
            <p className="font-mono text-[9px] text-stencil/60 text-center mt-2">
              Acesso exclusivo à aba mídias • Sem necessidade de senha
            </p>
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
        <div
          id="app-shell"
          className={`w-full max-w-[460px] bg-concrete-texture border-x border-bunker/80 flex flex-col relative z-10 shadow-2xl ${
            activeTab === 'chat'
              ? 'h-[100dvh] max-h-[100dvh] overflow-hidden'
              : isViewerMode
                ? 'min-h-screen pb-6'
                : 'min-h-screen pb-20'
          }`}
        >
          
          {/* HEADER BANNER MARQUEE */}
          <div className="bg-acid text-asphalt overflow-hidden py-1 border-b-2 border-asphalt flex relative z-40 shrink-0">
            <div className="font-mono text-[10px] sm:text-[11px] font-semibold tracking-[0.22em] animate-ticker whitespace-nowrap uppercase">
              +++ TRIO TMJ  +++ RESENHA OU MORTE +++ DAAAAMN +++ VOCE ME SENTE? +++ TMJ +++ APENAS ME DIGA QUEM VAI MORRER HOJE! +++ CONCEPT? +++
            </div>
          </div>

          {/* HEADER (SEM BANNER, VISUAL LIMPO E OTIMIZADO PARA O CONTEÚDO) */}
          <header className="sticky top-0 z-30 bg-asphalt/95 backdrop-blur-md border-b border-bunker px-4 py-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <img
                src={TMJ_LOGO_URL}
                alt="TMJ"
                className="h-10 w-auto object-contain mix-blend-screen"
              />

              <div className="flex items-center gap-2">
                {isViewerMode ? (
                  <div className="flex items-center gap-2">
                    <div className="bg-concrete border border-sprayCyan/50 rounded-sm px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-mono text-sprayCyan font-bold">
                      <Eye className="w-3.5 h-3.5 text-sprayCyan" />
                      <span>VISUALIZANDO</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsViewerMode(false);
                        setActiveMember(null);
                        setCurrentScreen('login');
                      }}
                      title="Entrar com conta do Squad"
                      className="bg-bunker hover:bg-concrete border border-bunker hover:border-acid rounded-sm px-2.5 py-1 flex items-center gap-1.5 font-mono text-[10px] text-chalk transition-colors cursor-pointer"
                    >
                      <span>LOGIN SQUAD</span>
                      <LogOut className="w-3 h-3 text-acid" />
                    </button>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </header>

          {/* MAIN CONTENT AREA */}
          <main className={`flex-1 flex flex-col min-h-0 ${activeTab === 'chat' ? 'overflow-hidden' : ''}`}>
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
                      const isMine = !isViewerMode && activeMember && item.authorId === activeMember.id;
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
                              onClick={() => downloadMediaFile(item.midiaUrl || item.url, `TMJ_${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`, docId, item.isChunked)}
                              title="Baixar arquivo original sem perder qualidade"
                              className="flex items-center gap-1 bg-bunker hover:bg-concrete border border-bunker hover:border-acid text-chalk hover:text-acid px-2 py-1 rounded-xs font-mono text-[10px] transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>BAIXAR</span>
                            </button>
                          </div>

                          <div className="relative group bg-black/95 w-full flex items-center justify-center overflow-hidden">
                            {item.type === 'video' ? (
                              <StreetVideoPlayer
                                src={item.midiaUrl || item.url}
                                dropId={docId}
                                isChunked={item.isChunked}
                                className="w-full max-h-[60vh]"
                                onFullscreenRequest={() => setFullMediaModalItem(item)}
                              />
                            ) : (
                              <img
                                src={item.midiaUrl || item.url}
                                alt={item.caption || 'Vault Drop'}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                className="max-h-[70vh] w-auto max-w-full object-contain cursor-pointer block mx-auto rounded-xs"
                                onClick={() => setFullMediaModalItem(item)}
                              />
                            )}
                            <div className="absolute top-2 right-2 bg-asphalt/85 px-1.5 py-0.5 rounded-sm border border-bunker pointer-events-none z-10">
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
                            {item.caption && (
                              <p className="font-sans text-sm text-chalk">{item.caption}</p>
                            )}

                            {/* SISTEMA DE REAÇÃO STREET COM 14 EMOJIS FIXOS (1 REAÇÃO POR DISPOSITIVO) */}
                            <div className="pt-1 border-t border-bunker/80">
                              <MediaReactions
                                reactions={item.reactions}
                                reactedBy={item.reactedBy}
                                currentDeviceId={isViewerMode ? getViewerDeviceId() : (activeMember?.id || getViewerDeviceId())}
                                userSelectedEmoji={item.deviceReactions?.[isViewerMode ? getViewerDeviceId() : (activeMember?.id || getViewerDeviceId())] || null}
                                isViewer={isViewerMode}
                                onToggleReaction={(emoji) => handleToggleReaction(docId, emoji)}
                              />
                            </div>

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

                            {!isViewerMode ? (
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
                            ) : (
                              <div className="bg-asphalt/60 border border-bunker/70 rounded-xs py-2 px-3 text-center">
                                <p className="font-mono text-[10px] text-stencil">
                                  Modo Espectador: comentários restritos ao trio. Deixe sua reação nos emojis acima! 👆
                                </p>
                              </div>
                            )}
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
                className={`flex-1 flex flex-col min-h-0 justify-between px-3 pt-2.5 overflow-hidden transition-all duration-150 ${
                  isKeyboardOpen ? 'pb-1.5' : 'pb-[68px]'
                }`}
              >
                <div className="mb-1.5 px-1 border-b border-bunker border-dashed pb-1.5 shrink-0">
                  <h2 className="font-display text-xl text-chalk uppercase tracking-wide">resenha ou morte</h2>
                </div>

                <div
                  ref={chatListRef}
                  id="chat-messages-list"
                  className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y space-y-4 pr-1 py-2 pb-4"
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
                        <div key={m.id} className={`flex items-start gap-2.5 ${isMine ? 'flex-row-reverse ml-auto' : 'mr-auto'} max-w-[92%]`}>
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
                              {m.text && <p className="text-sm font-sans text-chalk leading-relaxed break-words">{m.text}</p>}

                              {m.mediaUrl && (
                                <div className="relative group/media mt-1">
                                  <img
                                    src={m.mediaUrl}
                                    alt="Chat media"
                                    className="rounded-sm max-h-60 w-auto max-w-full object-contain cursor-pointer"
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
                  <div ref={chatBottomAnchorRef} className="h-2 shrink-0" />
                </div>

                {/* ÁREA FIXA DE DIGITAÇÃO (Gírias Rápidas + Barra de Input Coesa) */}
                <div className="shrink-0 w-full bg-asphalt/95 backdrop-blur-md border-t border-bunker pt-1.5 pb-1 z-20">
                  {/* Gírias Rápidas */}
                  <div className="pb-1.5 flex items-center gap-1.5 w-full overflow-x-auto whitespace-nowrap snap-x no-scrollbar px-0.5">
                    {['hoje é aonde?', 'resenha', 'to off', 'concept?'].map((stk) => (
                      <button
                        key={stk}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleChatSubmit(stk)}
                        className="snap-start shrink-0 bg-concrete border border-bunker text-chalk font-mono text-[10px] px-3 py-1.5 rounded-sm active:scale-95 transition hover:bg-bunker cursor-pointer"
                      >
                        {stk}
                      </button>
                    ))}
                  </div>

                  {/* Chat Input System */}
                  <div className="bg-concrete border-2 border-bunker rounded-sm p-1.5 w-full">
                    {/* Estado 1: Padrão */}
                    {chatRecordingState === 'default' && (
                      <div id="chat-default-bar" className="flex items-center gap-1.5 sm:gap-2 w-full">
                        <label 
                          title="Enviar Foto, Vídeo ou Áudio" 
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-sm bg-bunker hover:bg-concrete text-acid flex items-center justify-center cursor-pointer shrink-0 border border-bunker"
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
                            setIsChatInputFocused(true);
                            setTimeout(() => scrollChatToBottom(true), 150);
                          }}
                          onBlur={() => {
                            setTimeout(() => setIsChatInputFocused(false), 150);
                          }}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleChatSubmit();
                          }}
                          className="flex-1 min-w-0 bg-asphalt border border-bunker rounded-sm px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-chalk focus:outline-none focus:border-acid font-mono"
                        />
                        <button
                          type="button"
                          onClick={startChatAudioRecord}
                          title="Gravar Áudio"
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-sm bg-bunker text-sprayCyan hover:border-sprayCyan flex items-center justify-center shrink-0 border border-bunker cursor-pointer active:scale-95 transition-all"
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleChatSubmit()}
                          className="bg-acid text-asphalt font-display tracking-wider sm:tracking-widest px-2.5 sm:px-3.5 py-2 rounded-sm text-xs sm:text-sm shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer font-bold flex items-center gap-1 shrink-0"
                        >
                          <span>ENVIAR</span>
                          <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                        </button>
                      </div>
                    )}

                    {/* Estado 2: Gravando Áudio */}
                    {chatRecordingState === 'recording' && (
                      <div id="chat-recording-bar" className="flex items-center justify-between gap-2 bg-bunker p-1 rounded-sm border border-urbanOrange w-full">
                        <div className="flex items-center gap-2.5 text-urbanOrange animate-pulse px-2.5">
                          <Mic className="w-4 h-4 shrink-0" />
                          <span id="chat-rec-timer" className="font-mono text-xs sm:text-sm font-bold tracking-widest">
                            {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={pauseChatAudioRecord}
                          className="bg-urbanOrange text-asphalt font-display px-4 sm:px-6 py-1.5 sm:py-2 rounded-sm text-xs sm:text-sm tracking-wider shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none cursor-pointer font-bold flex items-center gap-1.5 shrink-0"
                        >
                          <Square className="w-3 h-3 fill-asphalt" />
                          <span>PAUSAR</span>
                        </button>
                      </div>
                    )}

                    {/* Estado 3: Preview do Áudio */}
                    {chatRecordingState === 'preview' && (
                      <div id="chat-preview-bar" className="flex items-center gap-1.5 sm:gap-2 w-full">
                        <button
                          type="button"
                          onClick={discardChatAudio}
                          title="Descartar áudio"
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-sm bg-red-500/10 text-red-500 border border-red-500/50 flex items-center justify-center shrink-0 cursor-pointer hover:bg-red-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0 bg-asphalt border border-sprayCyan/50 rounded-sm px-2.5 py-1.5 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-sprayCyan font-bold tracking-widest uppercase truncate">ÁUDIO PRONTO</span>
                          <button
                            type="button"
                            onClick={playPreviewAudio}
                            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-sprayCyan/20 text-sprayCyan hover:bg-sprayCyan hover:text-asphalt rounded-sm cursor-pointer transition-colors shrink-0"
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
                          className="bg-acid text-asphalt font-display px-3 sm:px-4 py-2 rounded-sm text-xs sm:text-sm shrink-0 shadow-[2px_2px_0px_var(--color-asphalt)] active:translate-y-[2px] active:shadow-none cursor-pointer font-bold"
                        >
                          ENVIAR 🚀
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </main>

          {/* DOCK (OCULTO NO MODO VISUALIZAR OU QUANDO O TECLADO VIRTUAL ESTIVER ABERTO) */}
          {!isViewerMode && (
            <nav
              className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[460px] z-40 bg-asphalt/95 backdrop-blur-lg border-t-2 border-bunker px-3 py-1.5 ${
                isKeyboardOpen ? 'hidden' : 'flex'
              } items-center justify-around`}
            >
              <button
                id="nav-vault"
                onClick={() => setActiveTab('vault')}
                className={`flex flex-col items-center py-1 px-4 sm:px-6 cursor-pointer transition-colors ${activeTab === 'vault' ? 'text-acid' : 'text-stencil hover:text-chalk'}`}
              >
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                <span className="font-bebas tracking-widest text-[11px] sm:text-xs">MÍDIAS</span>
              </button>
              <button
                onClick={handleOpenUploadModal}
                translate="no"
                className="notranslate -mt-4 sm:-mt-6 bg-acid text-asphalt font-display text-xs sm:text-base px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-sm border-2 border-asphalt shadow-[3px_3px_0px_var(--color-urbanOrange)] active:translate-y-0.5 active:shadow-[1px_1px_0px_var(--color-urbanOrange)] transition-all cursor-pointer font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>ADD MÍDIA</span>
              </button>
              <button
                id="nav-chat"
                onClick={() => setActiveTab('chat')}
                className={`flex flex-col items-center py-1 px-4 sm:px-6 cursor-pointer transition-colors ${activeTab === 'chat' ? 'text-acid' : 'text-stencil hover:text-chalk'}`}
              >
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                <span className="font-bebas tracking-widest text-[11px] sm:text-xs">RESENHA</span>
              </button>
            </nav>
          )}

          {/* MODAL: ADD MÍDIA PRO VAULT */}
          {isUploadModalOpen && (
            <div id="modal-upload" className="fixed inset-0 z-50 bg-asphalt/90 backdrop-blur-md flex items-center justify-center p-4">
              <div className="w-full max-w-[400px] bg-concrete border-2 border-bunker rounded-sm p-5 shadow-2xl relative">
                <div className="absolute -top-3 -right-3 w-12 h-6 bg-acid/80 rotate-12 z-10"></div>

                <div className="flex justify-between items-center mb-6 border-b border-bunker pb-2 relative z-20">
                  <h3 className="font-display text-2xl text-chalk tracking-wide">NOVA MÍDIA</h3>
                  <button
                    type="button"
                    onClick={closeAndResetUploadModal}
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
                    <div id="upload-preview-box" className="relative rounded-sm overflow-hidden h-60 max-h-60 flex items-center justify-center bg-black/90 border border-bunker">
                      {pendingUploadData.type === 'video' ? (
                        <StreetVideoPlayer src={pendingUploadData.url} className="w-full h-full max-h-60" />
                      ) : (
                        <img src={pendingUploadData.url} alt="Preview" className="w-full h-full max-h-56 object-contain" />
                      )}
                    </div>
                  )}
                </label>

                <label className="font-mono text-[10px] text-acid block mb-1 uppercase tracking-widest">Legenda do Drop</label>
                <input
                  id="upload-caption"
                  type="text"
                  disabled={isUploadingMedia}
                  placeholder="Escreva a legenda..."
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  className="w-full bg-asphalt border-2 border-bunker rounded-sm px-3 py-3 text-sm text-chalk mb-4 focus:border-acid focus:outline-none font-sans disabled:opacity-50"
                />

                {/* Visual Progress Bar & Percentage during upload */}
                {isUploadingMedia && (
                  <div className="bg-asphalt border border-acid/60 p-3 rounded-sm mb-4 space-y-2">
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-acid font-bold flex items-center gap-1.5 truncate pr-2">
                        <Loader2 className="w-3.5 h-3.5 text-acid animate-spin shrink-0" />
                        <span>{uploadProgressStatus || 'Enviando para o Supabase Storage...'}</span>
                      </span>
                      <span className="text-chalk font-mono font-bold tabular-nums shrink-0">
                        {uploadProgressPercent}%
                      </span>
                    </div>
                    {/* Visual Progress Track */}
                    <div className="w-full bg-bunker rounded-full h-2.5 overflow-hidden border border-neutral-700">
                      <div
                        className="bg-acid h-full transition-all duration-200 ease-out shadow-[0_0_8px_#ccff00]"
                        style={{ width: `${Math.max(5, uploadProgressPercent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Mensagem de Erro Caso Ocorra */}
                {uploadErrorMessage && (
                  <div className="bg-red-950/80 border border-red-500/60 p-3 rounded-sm mb-3">
                    <p className="font-mono text-xs text-red-300 font-bold leading-relaxed">
                      {uploadErrorMessage}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    disabled={isUploadingMedia}
                    onClick={closeAndResetUploadModal}
                    className="flex-1 bg-bunker hover:bg-concrete border border-neutral-700 text-stencil py-3 rounded-sm font-mono text-xs hover:text-white cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    disabled={isUploadingMedia || !pendingUploadData}
                    onClick={submitVaultDrop}
                    className="flex-2 bg-acid text-asphalt font-display text-lg sm:text-xl tracking-widest py-3 rounded-sm border-2 border-asphalt shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-1 active:shadow-[1px_1px_0px_var(--color-asphalt)] transition-all cursor-pointer font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploadingMedia ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>SALVANDO DROP...</span>
                      </>
                    ) : (
                      <span>PUBLICAR NA MÍDIA</span>
                    )}
                  </button>
                </div>

                {/* Status do Storage: Supabase Ativo */}
                <div className="border-t border-bunker pt-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-sprayCyan bg-asphalt/80 border border-sprayCyan/30 p-2 rounded-xs">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>STORAGE: SUPABASE (TMJ-MEDIA) ATIVO</span>
                    </span>
                    <span className="text-[9px] text-stencil uppercase">100% Gratuito</span>
                  </div>
                </div>
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
                  className="w-full bg-acid text-asphalt font-display text-xl tracking-widest py-3 rounded-sm border-2 border-asphalt shadow-[4px_4px_0px_var(--color-asphalt)] active:translate-y-1 active:shadow-none transition-all cursor-pointer font-bold mb-2.5"
                >
                  SALVAR ALTERAÇÕES
                </button>

                {/* BOTÃO PARA RECRIAR BANCO TMJ LIMPO SOB NOVOS TERMOS */}
                <button
                  type="button"
                  onClick={handleResetAndReseedDatabase}
                  className="w-full bg-bunker hover:bg-concrete border border-sprayCyan/60 text-sprayCyan font-mono text-[11px] tracking-wider py-2.5 rounded-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🔄 RECRIAR / RESUBIR DADOS DO BANCO TMJ</span>
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
                  <StreetVideoPlayer
                    src={fullMediaModalItem.url}
                    dropId={fullMediaModalItem.docId || fullMediaModalItem.id}
                    isChunked={fullMediaModalItem.isChunked}
                    autoPlay
                    className="w-full max-h-[70vh]"
                  />
                ) : (
                  <img src={fullMediaModalItem.url} alt="Full view" className="max-w-full max-h-[72vh] object-contain rounded-sm shadow-2xl" />
                )}
              </div>

              {/* Legenda e Reações na base */}
              <div className="w-full max-w-xl bg-concrete border border-bunker p-3 rounded-sm space-y-2.5">
                {fullMediaModalItem.caption && (
                  <p className="font-sans text-xs text-chalk text-center">{fullMediaModalItem.caption}</p>
                )}
                <MediaReactions
                  reactions={fullMediaModalItem.reactions}
                  reactedBy={fullMediaModalItem.reactedBy}
                  currentDeviceId={isViewerMode ? getViewerDeviceId() : (activeMember?.id || getViewerDeviceId())}
                  userSelectedEmoji={fullMediaModalItem.deviceReactions?.[isViewerMode ? getViewerDeviceId() : (activeMember?.id || getViewerDeviceId())] || null}
                  isViewer={isViewerMode}
                  onToggleReaction={(emoji) => handleToggleReaction(fullMediaModalItem.docId || fullMediaModalItem.id, emoji)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
