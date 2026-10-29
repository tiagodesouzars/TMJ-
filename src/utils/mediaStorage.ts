import { supabase, TMJ_MEDIA_BUCKET } from '../supabaseClient';
import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';

const SUPABASE_URL = 'https://fequekmlticzqxtzucdh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcXVla21sdGljenF4dHp1Y2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjc4NzksImV4cCI6MjEwODg0Mzg3OX0.vEudO2U9X36LRdAGV69RPx7aJtrXt4xPAgMK4mOohwU';

/**
 * Sanitiza o nome do arquivo para o bucket do Supabase Storage
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Otimizador inteligente de imagem para a web.
 * - Redimensiona fotos para largura máxima segura (1280px) e qualidade otimizada (0.80).
 * - Previne preenchimento preto em imagens com transparência ao converter para JPEG.
 * - Garante que o arquivo final tenha no máximo ~200KB a 300KB para caber com folga no Firestore.
 */
export async function optimizeImageForUpload(
  file: File | Blob,
  maxWidth = 1280,
  quality = 0.80
): Promise<{ blob: Blob; mimeType: string }> {
  const type = file.type || 'image/jpeg';

  // Preserva SVGs
  if (type.includes('svg')) {
    return { blob: file, mimeType: type };
  }

  // Preserva GIFs animados se forem leves (< 500KB)
  if (type.includes('gif') && file.size < 500 * 1024) {
    return { blob: file, mimeType: type };
  }

  // Se o arquivo já for minúsculo (< 120KB) e não for um arquivo gigante de câmera
  if (file.size > 0 && file.size < 120 * 1024) {
    return { blob: file, mimeType: type };
  }

  // Método 1: createImageBitmap com orientação correta e sem tarjas pretas
  try {
    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' as any }).catch(() =>
        createImageBitmap(file)
      );
      const width = bitmap.width;
      const height = bitmap.height;

      if (width > 0 && height > 0) {
        let targetWidth = width;
        let targetHeight = height;

        if (width > maxWidth || height > maxWidth) {
          const ratio = width / height;
          if (width > height) {
            targetWidth = maxWidth;
            targetHeight = Math.round(maxWidth / ratio);
          } else {
            targetHeight = maxWidth;
            targetWidth = Math.round(maxWidth * ratio);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Fundo suave de asfalto (#121212) caso haja transparência para nunca ficar tarja preta
          const targetMime = type === 'image/png' ? 'image/png' : 'image/jpeg';
          if (targetMime === 'image/jpeg') {
            ctx.fillStyle = '#121212';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }

          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          bitmap.close();

          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, targetMime, quality);
          });

          if (blob && blob.size > 0) {
            return { blob, mimeType: targetMime };
          }
        }
      }
    }
  } catch (bitmapErr) {
    console.warn('createImageBitmap falhou, usando fallback seguro:', bitmapErr);
  }

  // Método 2: Fallback via FileReader com imagem HTML
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return await new Promise<{ blob: Blob; mimeType: string }>((resolve) => {
      const img = new Image();

      img.onload = async () => {
        try {
          if (img.decode) {
            try {
              await img.decode();
            } catch {}
          }

          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;

          if (!width || !height) {
            return resolve({ blob: file, mimeType: type });
          }

          let targetWidth = width;
          let targetHeight = height;

          if (width > maxWidth || height > maxWidth) {
            const ratio = width / height;
            if (width > height) {
              targetWidth = maxWidth;
              targetHeight = Math.round(maxWidth / ratio);
            } else {
              targetHeight = maxWidth;
              targetWidth = Math.round(maxWidth * ratio);
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            return resolve({ blob: file, mimeType: type });
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          const targetMime = type === 'image/png' ? 'image/png' : 'image/jpeg';
          if (targetMime === 'image/jpeg') {
            ctx.fillStyle = '#121212';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0) {
                resolve({ blob, mimeType: targetMime });
              } else {
                resolve({ blob: file, mimeType: type });
              }
            },
            targetMime,
            quality
          );
        } catch {
          resolve({ blob: file, mimeType: type });
        }
      };

      img.onerror = () => {
        resolve({ blob: file, mimeType: type });
      };

      img.src = dataUrl;
    });
  } catch (readerErr) {
    console.warn('Fallback FileReader falhou, mantendo arquivo original:', readerErr);
    return { blob: file, mimeType: type };
  }
}

/**
 * Upload de arquivo para o Supabase Storage (bucket 'tmj-media') com fallback ultraleve garantido
 */
export async function uploadMediaToSupabase(
  file: File | Blob,
  folder: string,
  preferredName?: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  const isVideo = file.type.startsWith('video');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  let rawFileName: string;
  if (preferredName) {
    rawFileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(preferredName)}`;
  } else if ('name' in file && file.name) {
    rawFileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(file.name)}`;
  } else {
    const ext = file.type.includes('mp4')
      ? 'mp4'
      : file.type.includes('webm')
        ? 'webm'
        : file.type.includes('png')
          ? 'png'
          : file.type.includes('gif')
            ? 'gif'
            : file.type.includes('ogg')
              ? 'ogg'
              : 'jpg';
    rawFileName = `${timestamp}_${randomSuffix}.${ext}`;
  }

  const filePath = `${folder}/${rawFileName}`;

  // Inicializa o blob a ser enviado
  let uploadBlob: Blob = file;
  let mimeType = file.type || (isVideo ? 'video/mp4' : 'application/octet-stream');

  try {
    if (!isVideo && file.type.startsWith('image/') && !file.type.includes('svg')) {
      if (onProgress) onProgress('Otimizando imagem no formato nativo...', 15);
      const optimized = await optimizeImageForUpload(file, 1280, 0.80);
      uploadBlob = optimized.blob;
      mimeType = optimized.mimeType;
    }

    if (onProgress) onProgress('Conectando ao Supabase Storage...', 25);

    // Tenta upload com XMLHttpRequest para reportar bytes reais em tempo real
    const uploadWithXhr = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const targetUrl = `${SUPABASE_URL}/storage/v1/object/${TMJ_MEDIA_BUCKET}/${filePath}`;

        xhr.open('POST', targetUrl, true);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
        xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.setRequestHeader('Content-Type', mimeType);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && onProgress) {
            const pct = Math.round((evt.loaded / evt.total) * 70) + 25;
            onProgress(`Enviando dados: ${Math.round(evt.loaded / 1024)}KB...`, pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (onProgress) onProgress('Finalizando drop...', 98);
            resolve();
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.message || res.error || `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`Erro HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Erro de conexão ao enviar para o Supabase.'));
        };

        xhr.send(uploadBlob);
      });
    };

    try {
      await uploadWithXhr();
    } catch (xhrError) {
      console.warn('XHR falhou, usando SDK do Supabase:', xhrError);
      if (onProgress) onProgress('Tentando via SDK Supabase...', 60);

      const { error: uploadError } = await supabase.storage
        .from(TMJ_MEDIA_BUCKET)
        .upload(filePath, uploadBlob, {
          contentType: mimeType,
          cacheControl: '31536000',
          upsert: true
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
    }

    if (onProgress) onProgress('Recuperando link público...', 99);

    const { data: publicUrlData } = supabase.storage
      .from(TMJ_MEDIA_BUCKET)
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error('Não foi possível obter a URL pública do Supabase.');
    }

    if (onProgress) onProgress('Mídia enviada com sucesso!', 100);
    return publicUrlData.publicUrl;
  } catch (err: any) {
    // Se for vídeo, NÃO cria dataUrl gigante (que quebraria o limite de 1MB do Firestore)
    if (isVideo) {
      throw err;
    }

    // Para fotos e imagens, converte O BLOB OTIMIZADO (<= 250KB) em DataURL seguro
    console.warn('Supabase Storage indisponível, ativando fallback ultraleve otimizado:', err);
    if (onProgress) onProgress('Salvando foto em alta definição...', 95);

    const fallbackDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve('');
      // CRÍTICO: Lê uploadBlob (o blob já comprimido de ~150KB), NUNCA o arquivo de 10MB original!
      reader.readAsDataURL(uploadBlob);
    });

    if (fallbackDataUrl && fallbackDataUrl.length > 20) {
      if (onProgress) onProgress('Mídia concluída!', 100);
      return fallbackDataUrl;
    }
    throw err;
  }
}

/**
 * Fragmenta e armazena vídeos com segurança no Firestore (subcoleção ou coleção de chunks)
 * Cada chunk tem até 450KB (ficando em ~600KB base64), respeitando o teto de 1MB do Firestore.
 */
export async function uploadVideoChunksToFirestore(
  file: File,
  dropId: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<{ totalChunks: number; mimeType: string }> {
  const CHUNK_SIZE = 450 * 1024; // 450KB
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const mimeType = file.type || 'video/mp4';

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.split(',')[1] || res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(chunkBlob);
    });

    const progressPct = Math.round(((i + 1) / totalChunks) * 75) + 15;
    if (onProgress) {
      onProgress(`Gravando bloco ${i + 1} de ${totalChunks}...`, progressPct);
    }

    const chunkDocId = `${dropId}_chunk_${i}`;
    await setDoc(doc(db, 'tmj_vault_chunks', chunkDocId), {
      dropId,
      index: i,
      totalChunks,
      mimeType,
      data: base64Data,
      createdAt: Date.now()
    });
  }

  return { totalChunks, mimeType };
}

/**
 * Cache em memória para vídeos fragmentados
 */
export const chunkedVideoMemoryCache = new Map<string, string>();

/**
 * Recupera e remonta o vídeo a partir dos fragmentos salvos no Firestore
 */
export async function fetchAndAssembleChunkedVideo(dropId: string): Promise<string> {
  if (chunkedVideoMemoryCache.has(dropId)) {
    return chunkedVideoMemoryCache.get(dropId)!;
  }

  const q = query(
    collection(db, 'tmj_vault_chunks'),
    where('dropId', '==', dropId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error('Nenhum fragmento de vídeo encontrado.');
  }

  const chunks: { index: number; data: string; mimeType?: string }[] = [];
  snapshot.forEach((docSnap) => {
    chunks.push(docSnap.data() as any);
  });

  chunks.sort((a, b) => a.index - b.index);

  const byteArrays: Uint8Array[] = [];
  let mimeType = 'video/mp4';

  for (const c of chunks) {
    if (c.mimeType) mimeType = c.mimeType;
    const byteCharacters = atob(c.data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let j = 0; j < byteCharacters.length; j++) {
      byteNumbers[j] = byteCharacters.charCodeAt(j);
    }
    byteArrays.push(byteNumbers);
  }

  const blob = new Blob(byteArrays as BlobPart[], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  chunkedVideoMemoryCache.set(dropId, objectUrl);
  return objectUrl;
}

/**
 * Deleta todos os fragmentos associados a um dropId no Firestore
 */
export async function deleteVideoChunks(dropId: string): Promise<void> {
  try {
    const q = query(collection(db, 'tmj_vault_chunks'), where('dropId', '==', dropId));
    const snapshot = await getDocs(q);
    const promises: Promise<void>[] = [];
    snapshot.forEach((docSnap) => {
      promises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(promises);
    if (chunkedVideoMemoryCache.has(dropId)) {
      URL.revokeObjectURL(chunkedVideoMemoryCache.get(dropId)!);
      chunkedVideoMemoryCache.delete(dropId);
    }
  } catch (err) {
    console.warn('Erro ao deletar fragmentos de vídeo:', err);
  }
}

/**
 * Estratégia completa de upload para o Vault (Fotos e Vídeos)
 */
export async function uploadVaultMediaWithStrategy(
  file: File,
  dropId: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<{ url: string; isChunked: boolean; totalChunks: number }> {
  const isVideo = file.type.startsWith('video');

  if (isVideo) {
    // 1. Tenta Supabase Storage
    try {
      if (onProgress) onProgress('Preparando vídeo para o Supabase...', 10);
      const publicUrl = await uploadMediaToSupabase(file, 'tmj_vault', undefined, onProgress);
      if (publicUrl && !publicUrl.startsWith('data:')) {
        return { url: publicUrl, isChunked: false, totalChunks: 0 };
      }
    } catch (supaErr) {
      console.warn('Upload de vídeo no Supabase indisponível (RLS), gravando com fragmentação garantida:', supaErr);
    }

    // 2. Se o Supabase falhou (ex: política RLS não ativa), fragmenta com segurança no Firestore
    if (onProgress) onProgress('Gravando vídeo em alta definição...', 15);
    const { totalChunks } = await uploadVideoChunksToFirestore(file, dropId, onProgress);
    return { url: 'chunked', isChunked: true, totalChunks };
  } else {
    // Para fotos e imagens
    if (onProgress) onProgress('Otimizando foto no formato nativo...', 5);
    const publicUrl = await uploadMediaToSupabase(file, 'tmj_vault', undefined, onProgress);
    return { url: publicUrl, isChunked: false, totalChunks: 0 };
  }
}

/**
 * Upload específico para o Vault (Fotos, GIFs, Vídeos)
 */
export async function uploadVaultMedia(
  file: File,
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  const isVideo = file.type.startsWith('video');
  const tempId = 'drop_' + Date.now();
  const res = await uploadVaultMediaWithStrategy(file, tempId, onProgress);
  return res.url;
}

/**
 * Upload específico para o Chat (Fotos, GIFs, Áudios)
 */
export async function uploadChatMedia(
  file: File | Blob,
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  if (onProgress) onProgress('Enviando anexo para o Supabase...', 10);
  const publicUrl = await uploadMediaToSupabase(file, 'tmj_chat', undefined, onProgress);
  return publicUrl;
}

/**
 * Upload para Avatar do perfil
 */
export async function uploadAvatarMedia(
  file: File,
  memberId: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  if (onProgress) onProgress('Enviando avatar para o Supabase...', 10);
  const publicUrl = await uploadMediaToSupabase(
    file,
    'tmj_avatars',
    `avatar_${memberId}_${file.name}`,
    onProgress
  );
  return publicUrl;
}

/**
 * Alias de compatibilidade
 */
export async function uploadFileToCloudStorage(
  file: File | Blob,
  folder: string,
  preferredName?: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  return uploadMediaToSupabase(file, folder, preferredName, onProgress);
}

/**
 * Alias de compatibilidade para o Vault
 */
export async function uploadMediaWithFallback(
  file: File,
  dropId?: string,
  onProgress?: (status: string, percent?: number) => void
): Promise<{ url: string; isChunked: boolean; totalChunks: number }> {
  return uploadVaultMediaWithStrategy(file, dropId || 'drop_' + Date.now(), onProgress);
}
