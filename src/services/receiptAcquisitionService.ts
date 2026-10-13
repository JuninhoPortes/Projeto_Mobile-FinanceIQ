import { File, Paths } from 'expo-file-system';
import type { ReceiptAcquisitionResult, ReceiptDocument, ReceiptSource } from '../types/receipt';
import { normalizeReceiptDocument, RECEIPT_MIME_TYPES } from './receiptDocumentService';

// Somente fotos temporárias retornadas pela câmera são elegíveis para limpeza.
const cameraFiles = new Set<string>();

export function releaseReceiptDocument(document: ReceiptDocument): void {
  releaseCameraFile(document.uri);
}

function releaseCameraFile(uri: string): void {
  if (!cameraFiles.delete(uri)) return;
  try {
    const cachePrefix = Paths.cache.uri.replace(/\/+$/, '') + '/';
    if (uri.startsWith(cachePrefix) && !uri.includes('/../') && !uri.includes('/./')) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  } catch {
    // Falha de limpeza não interrompe o cadastro manual; o arquivo fica no cache.
  }
}

export async function acquireReceiptDocument(
  source: ReceiptSource,
  signal: AbortSignal
): Promise<ReceiptAcquisitionResult> {
  if (signal.aborted) return { status: 'cancelled' };
  let cameraUri: string | undefined;

  try {
    let metadata;
    if (source === 'camera') {
      const ImagePicker = await import('expo-image-picker');
      if (signal.aborted) return { status: 'cancelled' };
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (signal.aborted) return { status: 'cancelled' };
      if (!permission.granted) {
        return {
          status: 'error',
          message: permission.canAskAgain
            ? 'Acesso à câmera recusado. Você pode escolher um arquivo ou tentar novamente.'
            : 'A câmera está bloqueada. Ative o acesso nas configurações do dispositivo ou escolha um arquivo.'
        };
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 1,
        cameraType: ImagePicker.CameraType.back, base64: false, exif: false
      });
      if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
      const asset = result.assets[0];
      cameraUri = asset.uri;
      cameraFiles.add(cameraUri);
      if (signal.aborted) {
        releaseCameraFile(cameraUri);
        return { status: 'cancelled' };
      }
      metadata = {
        uri: asset.uri,
        name: asset.uri.split('/').pop() || asset.fileName || 'foto.jpg',
        mimeType: asset.mimeType,
        size: asset.fileSize ?? new File(asset.uri).size,
        source
      };
    } else {
      const DocumentPicker = await import('expo-document-picker');
      if (signal.aborted) return { status: 'cancelled' };
      const result = await DocumentPicker.getDocumentAsync({
        type: RECEIPT_MIME_TYPES, multiple: false,
        copyToCacheDirectory: false, base64: false
      });
      if (signal.aborted || result.canceled || !result.assets?.[0]) {
        return { status: 'cancelled' };
      }
      const asset = result.assets[0];
      metadata = {
        uri: asset.uri, name: asset.name, mimeType: asset.mimeType,
        size: asset.size ?? new File(asset.uri).size, source
      };
    }

    return { status: 'selected', document: normalizeReceiptDocument(metadata) };
  } catch (error) {
    if (cameraUri) releaseCameraFile(cameraUri);
    if (signal.aborted) return { status: 'cancelled' };
    return {
      status: 'error',
      message: error instanceof Error && (
        error.message.startsWith('Formato não permitido') ||
        error.message.startsWith('Não foi possível verificar') ||
        error.message.startsWith('O arquivo excede')
      ) ? error.message : 'Não foi possível selecionar a nota. Tente novamente ou continue preenchendo manualmente.'
    };
  }
}
