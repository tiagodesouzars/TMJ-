export interface SquadMember {
  id: string;
  name: string;
  handle: string;
  role: string;
  color: string;
  customAvatar?: string | null;
  password?: string | null;
  email?: string | null;
}

export interface VaultComment {
  author: string;
  color: string;
  text: string;
  time: string;
}

export interface VaultDrop {
  id: string;
  docId?: string;
  type: 'photo' | 'video' | 'audio';
  title: string;
  caption?: string;
  url: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorColor?: string;
  tag: string;
  createdAt: string;
  timestamp: number;
  comments?: VaultComment[];
  likes?: number;
}

export interface ChatMessage {
  id: string;
  docId?: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorColor?: string;
  authorAvatar?: string | null;
  text?: string;
  isAudio?: boolean;
  audioUrl?: string | null;
  audioDuration?: number | null;
  mediaUrl?: string | null;
  mediaType?: 'photo' | 'video' | 'image' | null;
  timestamp: string | number;
  createdAt?: number;
}
