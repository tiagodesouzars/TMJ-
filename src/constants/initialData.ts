import { SquadMember, VaultDrop, ChatMessage } from '../types';

export const INITIAL_SQUAD: SquadMember[] = [
  {
    id: 't1',
    name: 'TIAGO',
    handle: '@tiago',
    role: 'Drip & Fit',
    color: '#ccff00', // Acid green
    email: 'tiagodesouzars@gmail.com',
    password: null,
    customAvatar: null
  },
  {
    id: 'j2',
    name: 'JORGE',
    handle: '@jorge',
    role: 'Beats & Áudio',
    color: '#ff5500', // Urban orange
    password: null,
    customAvatar: null
  },
  {
    id: 'm3',
    name: 'MARCUS',
    handle: '@marcus',
    role: 'Film & Visuals',
    color: '#00e5ff', // Spray cyan
    password: null,
    customAvatar: null
  }
];

export const INITIAL_DROPS: VaultDrop[] = [
  {
    id: 'drop-1',
    type: 'photo',
    title: 'OVERSIZED VIBE // SP DOWNTOWN',
    caption: 'Fit check noturno. Moletom pesado, cargo cinza e Jordan 4 Black Cat. Foto tirada na Roosevelt.',
    url: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=800',
    authorId: 't1',
    authorName: 'TIAGO',
    authorHandle: '@tiago',
    authorColor: '#ccff00',
    tag: '#Fit Check 🔥',
    createdAt: 'Hoje às 14:20',
    timestamp: Date.now() - 3600000,
    likes: 2,
    comments: [
      {
        author: 'JORGE',
        color: '#ff5500',
        text: 'Pesado demais mano, o caimento ficou brabo',
        time: '14:35'
      },
      {
        author: 'MARCUS',
        color: '#00e5ff',
        text: 'A iluminação da Roosevelt tá surreal pra shoot',
        time: '14:40'
      }
    ]
  },
  {
    id: 'drop-2',
    type: 'photo',
    title: 'GRAFFITI SPOT // ROOFTOP 011',
    caption: 'Novo painel que encontramos perto da linha férrea. Textura insana pra clipe.',
    url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=800',
    authorId: 'm3',
    authorName: 'MARCUS',
    authorHandle: '@marcus',
    authorColor: '#00e5ff',
    tag: '#Rolê 🛹',
    createdAt: 'Ontem às 21:10',
    timestamp: Date.now() - 86400000,
    likes: 3,
    comments: [
      {
        author: 'TIAGO',
        color: '#ccff00',
        text: 'Vamos colar aí no final de semana gravar take?',
        time: '21:15'
      }
    ]
  },
  {
    id: 'drop-3',
    type: 'audio',
    title: 'BEAT 808 BOOM BAP // RASCUNHO #04',
    caption: 'Fiz no MPC ontem de madrugada. 92 BPM com bumbo seco e grave 808 distorcido no ponto.',
    url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=', // Will be played with web audio synth
    authorId: 'j2',
    authorName: 'JORGE',
    authorHandle: '@jorge',
    authorColor: '#ff5500',
    tag: '#Beat/Áudio 🔊',
    createdAt: 'Ontem às 23:45',
    timestamp: Date.now() - 50000000,
    likes: 3,
    comments: [
      {
        author: 'MARCUS',
        color: '#00e5ff',
        text: 'Esse 808 bateu na alma 🔥',
        time: '00:02'
      }
    ]
  }
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    authorId: 't1',
    authorName: 'TIAGO',
    authorHandle: '@tiago',
    authorColor: '#ccff00',
    text: 'Salve rapaziada! Subi o app TMJ conectado direto no nosso Firebase trioTMJ.',
    timestamp: '14:00',
    createdAt: Date.now() - 7200000
  },
  {
    id: 'msg-2',
    authorId: 'j2',
    authorName: 'JORGE',
    authorHandle: '@jorge',
    authorColor: '#ff5500',
    text: 'Brabo demais! Já subi o beat novo na aba de mídia. Dá pra gravar áudio por aqui também!',
    timestamp: '14:05',
    createdAt: Date.now() - 6900000
  },
  {
    id: 'msg-3',
    authorId: 'm3',
    authorName: 'MARCUS',
    authorHandle: '@marcus',
    authorColor: '#00e5ff',
    text: 'Resenha ou morte! Vou carregar os takes em VHS hoje à noite 🛹',
    timestamp: '14:12',
    createdAt: Date.now() - 6500000
  }
];

export const QUICK_STICKERS = [
  'hoje é aonde?',
  'resenha',
  'to off',
  'concept?',
  'pesado 🔥',
  'brabo 👑',
  'drip 👟',
  'solta o beat 🔊'
];

export const DROP_TAGS = [
  '#Fit Check 🔥',
  '#Sneakers 👟',
  '#Rolê 🛹',
  '#Beat/Áudio 🔊',
  '#Resenha 💀'
];
