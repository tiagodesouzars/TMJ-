import { supabase, TMJ_MEDIA_BUCKET } from '../supabaseClient';

/**
 * Sanitizes a file name for cloud storage paths
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Lightweight canvas image optimizer.
 * Compresses oversized photos to high-definition WebP/JPEG (<200KB)
 * to conserve Supabase free tier storage without any visible quality loss.
 */
export async function optimizeImageForUpload(file: File | Blob, maxWidth = 1600, quality = 0.82): Promise<Blob> {
  // If not an image or is an animated GIF/SVG, keep original blob
  if (!file.type.startsWith('image/') || file.type.includes('gif') || file.type.includes('svg')) {
    return file;
  }

  // If already under 300KB, skip extra compression
  if (file.size <= 300 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) {
                resolve(blob);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads any media (photo, GIF, video, voice note) directly to Supabase Storage ('tmj-media' bucket).
 * Returns the permanent public download URL to be stored in Cloud Firestore.
 */
export async function uploadMediaToSupabase(
  file: File | Blob,
  folder: string,
  preferredName?: string,
  onProgress?: (status: string) => void
): Promise<string> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  let rawFileName: string;
  if (preferredName) {
    rawFileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(preferredName)}`;
  } else if ('name' in file && file.name) {
    rawFileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(file.name)}`;
  } else {
    const ext = file.type.includes('mp4') ? 'mp4' 
      : file.type.includes('webm') ? 'webm' 
      : file.type.includes('png') ? 'png' 
      : file.type.includes('gif') ? 'gif' 
      : file.type.includes('ogg') ? 'ogg' 
      : 'jpg';
    rawFileName = `${timestamp}_${randomSuffix}.${ext}`;
  }

  const filePath = `${folder}/${rawFileName}`;

  try {
    if (onProgress) onProgress('Otimizando mídia...');
    const readyFile = file.type.startsWith('image/') && !file.type.includes('gif')
      ? await optimizeImageForUpload(file)
      : file;

    if (onProgress) onProgress('Enviando para Supabase Storage...');

    const { error: uploadError } = await supabase.storage
      .from(TMJ_MEDIA_BUCKET)
      .upload(filePath, readyFile, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      console.error('Erro no upload para Supabase Storage:', uploadError.message);
      throw new Error(`Falha no Supabase Storage: ${uploadError.message}`);
    }

    if (onProgress) onProgress('Recuperando URL pública...');
    const { data: publicUrlData } = supabase.storage
      .from(TMJ_MEDIA_BUCKET)
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error('Não foi possível obter a URL pública do Supabase.');
    }

    if (onProgress) onProgress('Mídia enviada com sucesso!');
    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.error('Erro no processamento da mídia:', err);
    throw err;
  }
}

/**
 * Direct upload alias for Vault drops (Photos, GIFs, Videos)
 */
export async function uploadVaultMedia(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  const isVideo = file.type.startsWith('video');
  const isGif = file.type === 'image/gif';

  if (onProgress) {
    if (isVideo) {
      onProgress('Enviando vídeo para o Supabase Storage...');
    } else if (isGif) {
      onProgress('Enviando GIF animado para o Supabase...');
    } else {
      onProgress('Enviando foto para o Supabase Storage...');
    }
  }

  const publicUrl = await uploadMediaToSupabase(file, 'tmj_vault', undefined, onProgress);
  return publicUrl;
}

/**
 * Direct upload alias for Chat attachments (Photos, GIFs, Videos, Voice notes)
 */
export async function uploadChatMedia(
  file: File | Blob,
  onProgress?: (status: string) => void
): Promise<string> {
  if (onProgress) onProgress('Enviando anexo para o Supabase...');
  const publicUrl = await uploadMediaToSupabase(file, 'tmj_chat', undefined, onProgress);
  return publicUrl;
}

/**
 * Direct upload helper for Squad Member Profile Avatars
 */
export async function uploadAvatarMedia(
  file: File,
  memberId: string,
  onProgress?: (status: string) => void
): Promise<string> {
  if (onProgress) onProgress('Enviando avatar para o Supabase...');
  const publicUrl = await uploadMediaToSupabase(file, 'tmj_avatars', `avatar_${memberId}_${file.name}`, onProgress);
  return publicUrl;
}

/**
 * Compatibility alias
 */
export async function uploadFileToCloudStorage(
  file: File | Blob,
  folder: string,
  preferredName?: string,
  onProgress?: (status: string) => void
): Promise<string> {
  return uploadMediaToSupabase(file, folder, preferredName, onProgress);
}

/**
 * Direct upload alias for Vault media returning URL structure
 */
export async function uploadMediaWithFallback(
  file: File,
  _dropId?: string,
  onProgress?: (status: string) => void
): Promise<{ url: string; isChunked: boolean; totalChunks: number }> {
  const url = await uploadVaultMedia(file, onProgress);
  return { url, isChunked: false, totalChunks: 0 };
}
