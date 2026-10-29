import { supabase, BUCKET_NAME } from '../supabaseClient';

export interface UploadProgressCallback {
  (percentage: number): void;
}

export interface UploadOptions {
  userId: string;
  originalFileName?: string;
  mediaType: 'image' | 'video' | 'photo';
  onProgress?: UploadProgressCallback;
}

/**
 * Comprime imagens usando Canvas antes do upload para economizar a cota gratuita do Supabase (1GB)
 * Limite de dimensão: 1600px na maior borda
 * Qualidade: 85% (0.85) JPEG
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ blob: Blob; mimeType: string }> {
  const type = file.type || 'image/jpeg';
  if (!type.startsWith('image/') || type.includes('gif') || type.includes('svg')) {
    return { blob: file, mimeType: type };
  }

  if (file.size > 0 && file.size < 350 * 1024) {
    return { blob: file, mimeType: type };
  }

  try {
    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;

      if (width > 0 && height > 0) {
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, 0, 0, width, height);
          bitmap.close();

          const targetMime = type === 'image/png' ? 'image/png' : 'image/jpeg';
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, targetMime, quality);
          });

          if (blob && blob.size > 0) {
            return { blob, mimeType: targetMime };
          }
        }
      }
    }
  } catch (err) {
    console.warn('createImageBitmap falhou:', err);
  }

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
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (!width || !height) return resolve({ blob: file, mimeType: type });

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve({ blob: file, mimeType: type });

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const targetMime = type === 'image/png' ? 'image/png' : 'image/jpeg';
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
      img.onerror = () => resolve({ blob: file, mimeType: type });
      img.src = dataUrl;
    });
  } catch (e) {
    return { blob: file, mimeType: type };
  }
}

/**
 * Faz o upload de um arquivo para o Supabase Storage no bucket 'tmj-media'
 * com acompanhamento de progresso de 0% a 100%.
 */
export async function uploadVaultMediaToSupabase(
  file: File,
  options: UploadOptions
): Promise<string> {
  const { userId, originalFileName, mediaType, onProgress } = options;
  const isVideo = mediaType === 'video' || file.type.startsWith('video/');

  let uploadBlob: Blob = file;
  let ext = 'jpg';

  if (isVideo) {
    uploadBlob = file;
    const parts = (originalFileName || file.name || 'video.mp4').split('.');
    ext = parts.length > 1 ? parts.pop()!.toLowerCase() : 'mp4';
  } else {
    // Comprime imagem para no máx 1600px e 85% de qualidade
    if (onProgress) onProgress(5); // Começando compressão
    const compressed = await compressImage(file, 1600, 0.85);
    uploadBlob = compressed.blob;
    ext = compressed.mimeType === 'image/gif' ? 'gif' : 'jpg';
  }

  // Gera nome único para o arquivo: timestamp_userId_rand.ext
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const filePath = `vault/${timestamp}_${safeUserId}_${randomSuffix}.${ext}`;

  if (onProgress) onProgress(15);

  // Upload com XMLHttpRequest para reportar progresso em tempo real
  const supabaseUrl = 'https://fequekmlticzqxtzucdh.supabase.co';
  const supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcXVla21sdGljenF4dHp1Y2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjc4NzksImV4cCI6MjEwODg0Mzg3OX0.vEudO2U9X36LRdAGV69RPx7aJtrXt4xPAgMK4mOohwU';

  const uploadViaXhr = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const targetUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;

      xhr.open('POST', targetUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
      xhr.setRequestHeader('apikey', supabaseAnonKey);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Content-Type', uploadBlob.type || 'application/octet-stream');

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          // Escala de 15% até 95% durante a transferência dos bytes
          const percentLoaded = Math.round((evt.loaded / evt.total) * 80) + 15;
          onProgress(Math.min(95, percentLoaded));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve();
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            reject(new Error(res.message || res.error || `Erro de upload HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Erro de upload HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Falha de conexão na rede ao enviar mídia para o Supabase.'));
      };

      xhr.send(uploadBlob);
    });
  };

  try {
    await uploadViaXhr();
  } catch (xhrErr) {
    console.warn('Falha no upload via XHR, tentando via SDK do Supabase:', xhrErr);
    // Fallback usando o SDK do Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, uploadBlob, {
        cacheControl: '3600',
        upsert: true,
        contentType: uploadBlob.type
      });

    if (uploadError) {
      console.error('Erro no upload para o Supabase Storage:', uploadError);
      throw new Error(uploadError.message || 'Erro no upload para o Supabase');
    }
  }

  // Obter a URL pública permanente
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error('Não foi possível obter a URL pública do arquivo enviado.');
  }

  return publicUrlData.publicUrl;
}
