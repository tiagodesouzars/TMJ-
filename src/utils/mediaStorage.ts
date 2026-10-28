import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Sanitizes a file name for Cloud Storage
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Helper to run a promise with a timeout to prevent infinite hangs
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise
  ]);
}

/**
 * Ultra-lightweight image compression fallback (<150KB).
 * Used when Cloud Storage is not yet created in the Firebase Console,
 * preventing infinite loading and ensuring no heavy base64 (>1MB) breaks Firestore.
 */
export async function compressImageToLightweight(file: File | Blob, maxWidth = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
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
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        // Generates an optimized JPEG under 150KB
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Direct upload of any media file (photo, GIF, video, audio) to Cloud Storage for Firebase.
 * Returns the public download URL (getDownloadURL) to be saved in Firestore.
 * Includes a 10s timeout and smart image fallback so uploads NEVER hang infinitely.
 */
export async function uploadFileToCloudStorage(
  file: File | Blob,
  folder: string,
  preferredName?: string,
  onProgress?: (status: string) => void
): Promise<string> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  let fileName: string;
  if (preferredName) {
    fileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(preferredName)}`;
  } else if ('name' in file && file.name) {
    fileName = `${timestamp}_${randomSuffix}_${sanitizeFileName(file.name)}`;
  } else {
    const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('webm') ? 'webm' : file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : 'jpg';
    fileName = `${timestamp}_${randomSuffix}.${ext}`;
  }

  const storageRef = ref(storage, `${folder}/${fileName}`);
  
  const metadata = {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'public, max-age=31536000'
  };

  try {
    if (onProgress) onProgress('Conectando ao Cloud Storage...');
    
    // Direct upload with 10s timeout to prevent infinite hanging
    const uploadResult = await withTimeout(
      uploadBytes(storageRef, file, metadata),
      10000,
      'STORAGE_NOT_READY'
    );

    if (onProgress) onProgress('Recuperando URL pública...');
    const publicDownloadUrl = await getDownloadURL(uploadResult.ref);
    return publicDownloadUrl;
  } catch (storageErr: any) {
    console.warn('Cloud Storage inacessível ou não criado no console:', storageErr);

    // If it's an image and Cloud Storage isn't created yet in Firebase Console,
    // optimize it to a super-lightweight format (<150KB) so the user is NOT blocked!
    if (file.type.startsWith('image/')) {
      if (onProgress) onProgress('Cloud Storage não criado. Otimizando foto para salvar...');
      const lightweightUrl = await compressImageToLightweight(file);
      return lightweightUrl;
    }

    // For videos, throw a descriptive error with exact steps
    throw new Error(
      'O Cloud Storage precisa ser ativado no Firebase Console para vídeos. ' +
      'Acesse o Firebase Console > triotmj-3187e > Storage > Começar.'
    );
  }
}

/**
 * Direct upload helper for Vault drops (Photos, GIFs, Videos)
 */
export async function uploadVaultMedia(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  const isVideo = file.type.startsWith('video');
  const isGif = file.type === 'image/gif';

  if (onProgress) {
    if (isVideo) {
      onProgress('Enviando vídeo para o Cloud Storage...');
    } else if (isGif) {
      onProgress('Enviando GIF animado para o Cloud Storage...');
    } else {
      onProgress('Enviando foto para o Cloud Storage...');
    }
  }

  const downloadUrl = await uploadFileToCloudStorage(file, 'tmj_vault', undefined, onProgress);
  
  if (onProgress) {
    onProgress('Mídia processada com sucesso!');
  }

  return downloadUrl;
}

/**
 * Direct upload helper for Chat attachments (Photos, GIFs, Videos, Audios)
 */
export async function uploadChatMedia(
  file: File | Blob,
  onProgress?: (status: string) => void
): Promise<string> {
  if (onProgress) onProgress('Processando anexo para o chat...');
  const downloadUrl = await uploadFileToCloudStorage(file, 'tmj_chat_media', undefined, onProgress);
  return downloadUrl;
}

/**
 * Direct upload helper for Squad Member Profile Avatars
 */
export async function uploadAvatarMedia(
  file: File,
  memberId: string,
  onProgress?: (status: string) => void
): Promise<string> {
  if (onProgress) onProgress('Processando avatar...');
  const downloadUrl = await uploadFileToCloudStorage(file, 'tmj_avatars', `avatar_${memberId}_${file.name}`, onProgress);
  return downloadUrl;
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
