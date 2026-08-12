import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { API_URL, getAuthHeaders } from '@/services/auth';

export const INSPECTIONS_STORAGE_KEY = 'inspections';

const INSPECTION_SAVE_PATH = process.env.EXPO_PUBLIC_INSPECTION_SAVE_PATH ?? '/ingreso/movil/guardar';
const INSPECTION_SYNC_TIMEOUT_MS = 180000;

export type InspectionSyncStatus = 'pending' | 'sent' | 'failed';

export type InspectionServiceType = 'Avaluo' | 'Inspección' | 'Avaluo e Inspección' | 'Sec Bogota';

export const INSPECTION_SERVICE_TYPES: InspectionServiceType[] = [
  'Avaluo',
  'Inspección',
  'Avaluo e Inspección',
  'Sec Bogota',
];

export interface InspectionImage {
  uri: string;
  name: string;
  type: string;
  dataUri?: string | null;
}

export interface InspectionItem {
  id: string;
  placa: string;
  kilometraje: string;
  tipoServicio: InspectionServiceType;
  observaciones: string;
  imagenes: InspectionImage[];
  createdAt: string;
  syncStatus: InspectionSyncStatus;
  syncAttempts: number;
  syncedAt?: string | null;
  lastSyncError?: string | null;
  serverId?: number | string | null;
}

export interface InspectionPayload {
  client_id: string;
  placa: string;
  kilometraje: string;
  observaciones: string;
  tipo_servicio: InspectionServiceType;
  tiposervicio: InspectionServiceType;
  fecha_inspeccion: string;
  origen: 'app_movil';
}

export interface SyncResult {
  sent: InspectionItem[];
  pending: InspectionItem[];
  failed: InspectionItem[];
}

interface LaravelSaveResponse {
  id?: number | string;
  data?: {
    id?: number | string;
    ingreso?: {
      id?: number | string;
    };
    avaluo?: {
      id?: number | string;
    };
    imagenes?: unknown[];
    imagenes_advertencias?: string[];
  };
}

const getImageName = (uri: string, index: number) => {
  const name = uri.split('/').pop()?.split('?')[0];
  return name || `inspeccion-${index + 1}.jpg`;
};

const getImageType = (uri: string) => {
  const extension = uri.split('.').pop()?.toLowerCase().split('?')[0];

  if (extension === 'png') {
    return 'image/png';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
};

const toDataUri = (value: string | null | undefined, type: string) => {
  if (!value) {
    return null;
  }

  return value.startsWith('data:') ? value : `data:${type};base64,${value}`;
};

const isDownloadableImageUrl = (uri: string) => /^https?:\/\//i.test(uri);

const isReadableLocalImageUri = (uri: string) => /^(file|content|asset):\/\//i.test(uri);

const canUploadNativeFileUri = (uri: string) => /^(file|content):\/\//i.test(uri);

type FormDataImagePart = string | { uri: string; name: string; type: string };
type NativeImagePart = string;
type UploadImagePart = FormDataImagePart | NativeImagePart;

const IMAGE_UPLOAD_RETRIES = 3;
const IMAGE_UPLOAD_RETRY_DELAY_MS = 1200;

const wait = (milliseconds: number) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const resolveImageData = async (image: InspectionImage, index: number): Promise<FormDataImagePart | null> => {
  const normalizedImage = normalizeInspectionImage(image, index);

  if (Platform.OS !== 'web' && normalizedImage.dataUri) {
    return normalizedImage.dataUri;
  }

  if (Platform.OS !== 'web' && canUploadNativeFileUri(normalizedImage.uri)) {
    try {
      const base64 = await FileSystem.readAsStringAsync(normalizedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return toDataUri(base64, normalizedImage.type);
    } catch {
      return null;
    }
  }

  if (normalizedImage.dataUri) {
    return normalizedImage.dataUri;
  }

  if (isDownloadableImageUrl(normalizedImage.uri)) {
    return normalizedImage.uri;
  }

  if (!normalizedImage.uri || !isReadableLocalImageUri(normalizedImage.uri)) {
    return null;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(normalizedImage.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return toDataUri(base64, normalizedImage.type);
  } catch {
    return null;
  }
};

const normalizeInspectionImage = (
  image: (Partial<InspectionImage> & { base64?: string | null; data?: string | null }) | string,
  index: number,
): InspectionImage => {
  if (typeof image === 'string') {
    const type = getImageType(image);

    return {
      uri: image,
      name: getImageName(image, index),
      type,
      dataUri: image.startsWith('data:') ? image : null,
    };
  }

  const uri = image.uri ?? '';
  const type = image.type ?? getImageType(uri);

  return {
    uri,
    name: image.name ?? getImageName(uri, index),
    type,
    dataUri: image.dataUri ?? toDataUri(image.base64 ?? image.data, type),
  };
};

export const createInspectionItem = ({
  placa,
  kilometraje,
  tipoServicio,
  observaciones,
  imagenes,
}: Pick<InspectionItem, 'placa' | 'kilometraje' | 'tipoServicio' | 'observaciones' | 'imagenes'>): InspectionItem => ({
  id: Date.now().toString(),
  placa,
  kilometraje,
  tipoServicio,
  observaciones,
  imagenes,
  createdAt: new Date().toISOString(),
  syncStatus: 'pending',
  syncAttempts: 0,
  syncedAt: null,
  lastSyncError: null,
  serverId: null,
});

const parseStoredInspections = (raw: string | null): InspectionItem[] => {
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as Partial<InspectionItem>[];

  return parsed.map((item) => ({
    id: item.id ?? Date.now().toString(),
    placa: item.placa ?? '',
    kilometraje: item.kilometraje ?? '',
    tipoServicio: item.tipoServicio ?? 'Avaluo',
    observaciones: item.observaciones ?? '',
    imagenes: Array.isArray(item.imagenes)
      ? item.imagenes.map((image, index) => normalizeInspectionImage(image, index))
      : [],
    createdAt: item.createdAt ?? new Date().toISOString(),
    syncStatus: item.syncStatus ?? 'pending',
    syncAttempts: item.syncAttempts ?? 0,
    syncedAt: item.syncedAt ?? null,
    lastSyncError: item.lastSyncError ?? null,
    serverId: item.serverId ?? null,
  }));
};

const removeEmbeddedImageData = (image: InspectionImage): InspectionImage => ({
  ...image,
  dataUri: null,
});

const prepareInspectionForStorage = (inspection: InspectionItem): InspectionItem => ({
  ...inspection,
  imagenes: inspection.imagenes.map(removeEmbeddedImageData),
});

const saveInspections = (inspections: InspectionItem[]) =>
  AsyncStorage.setItem(
    INSPECTIONS_STORAGE_KEY,
    JSON.stringify(inspections.map(prepareInspectionForStorage)),
  );

export const getStoredInspections = async () => {
  const current = await AsyncStorage.getItem(INSPECTIONS_STORAGE_KEY);
  return parseStoredInspections(current);
};

export const saveInspectionOffline = async (inspection: InspectionItem) => {
  const current = await getStoredInspections();
  await saveInspections([inspection, ...current]);
  return inspection;
};

export const updateInspectionOffline = async (inspection: InspectionItem) => {
  const current = await getStoredInspections();
  const updatedInspection: InspectionItem = {
    ...inspection,
    syncStatus: 'pending',
    syncAttempts: 0,
    syncedAt: null,
    lastSyncError: null,
  };
  const exists = current.some((item) => item.id === inspection.id);
  const updated = exists
    ? current.map((item) => (item.id === inspection.id ? updatedInspection : item))
    : [updatedInspection, ...current];

  await saveInspections(updated);
  return updatedInspection;
};

export const getPendingInspections = async () => {
  const inspections = await getStoredInspections();
  return inspections.filter((inspection) => inspection.syncStatus !== 'sent');
};

export const getPendingInspectionsCount = async () => {
  const pending = await getPendingInspections();
  return pending.length;
};

export const buildLaravelInspectionPayload = (inspection: InspectionItem): InspectionPayload => ({
  client_id: inspection.id,
  placa: inspection.placa,
  kilometraje: inspection.kilometraje,
  observaciones: inspection.observaciones,
  tipo_servicio: inspection.tipoServicio,
  tiposervicio: inspection.tipoServicio,
  fecha_inspeccion: inspection.createdAt,
  origen: 'app_movil',
});

const resolveInspectionImagesForUpload = async (inspection: InspectionItem) => (
  await Promise.all(
    inspection.imagenes.map((image, index) => resolveImageData(image, index)),
  )
).filter((image): image is FormDataImagePart => Boolean(image));

export const buildLaravelInspectionFormData = async (
  inspection: InspectionItem,
  imageParts?: FormDataImagePart[],
) => {
  const payload = buildLaravelInspectionPayload(inspection);
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, String(value ?? ''));
  });

  const images = imageParts ?? await resolveInspectionImagesForUpload(inspection);

  images.forEach((image) => {
    formData.append('imagenes[]', image as unknown as Blob);
  });

  return formData;
};



const buildNativeInspectionPayload = (inspection: InspectionItem, imageParts: NativeImagePart[] = []) => ({
  ...buildLaravelInspectionPayload(inspection),
  imagenes: imageParts,
});

const parseLaravelResponse = async (response: Response): Promise<LaravelSaveResponse> => {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as LaravelSaveResponse;
  } catch {
    if (!response.ok) {
      throw new Error(sanitizeTechnicalMessage(responseText));
    }

    return {};
  }
};

const throwLaravelResponseError = (response: Response, data: LaravelSaveResponse): never => {
  throw new Error(
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : `Error ${response.status} al guardar en Laravel.`,
  );
};

const postNativeInspectionPayload = async (
  inspection: InspectionItem,
  imageParts: NativeImagePart[] = [],
): Promise<LaravelSaveResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INSPECTION_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${INSPECTION_SAVE_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify(buildNativeInspectionPayload(inspection, imageParts)),
      signal: controller.signal,
    });
    const data = await parseLaravelResponse(response);

    if (!response.ok) {
      throwLaravelResponseError(response, data);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const getErrorResponse = (error: unknown) => (axios.isAxiosError(error) ? error.response : undefined);

const MAX_SYNC_ERROR_LENGTH = 240;

const isBackendStorageFullError = (message: string) => (
  /no space left on device/i.test(message) || /errno=28/i.test(message)
);

const sanitizeTechnicalMessage = (message: string) => {
  const normalizedMessage = message.replace(/\s+/g, ' ').trim();

  if (isBackendStorageFullError(normalizedMessage)) {
    return 'El servidor Laravel no tiene espacio disponible para escribir logs o guardar archivos. Libera espacio en el backend y vuelve a sincronizar.';
  }

  if (normalizedMessage.length <= MAX_SYNC_ERROR_LENGTH) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, MAX_SYNC_ERROR_LENGTH).trim()}...`;
};

const getSyncErrorMessage = (error: unknown) => {
  const response = getErrorResponse(error);
  const responseData = response?.data;

  const message = responseData && typeof responseData === 'object'
    ? (responseData as Record<string, unknown>).message
    : null;

  if (typeof message === 'string') {
    return sanitizeTechnicalMessage(message);
  }

  const errors = responseData && typeof responseData === 'object'
    ? (responseData as Record<string, unknown>).errors
    : null;

  if (errors && typeof errors === 'object') {
    const [firstError] = Object.values(errors as Record<string, unknown>);

    if (Array.isArray(firstError) && typeof firstError[0] === 'string') {
      return sanitizeTechnicalMessage(firstError[0]);
    }

    if (typeof firstError === 'string') {
      return sanitizeTechnicalMessage(firstError);
    }
  }

  const responseText = typeof responseData === 'string' ? responseData : null;

  if (responseText) {
    return sanitizeTechnicalMessage(responseText);
  }

  if (response) {
    return `Error ${response.status} al guardar en Laravel.`;
  }

  if (error instanceof Error && error.message && error.message !== 'Network Error') {
    return `Sin conexión o el servicio no respondió. Detalle técnico: ${sanitizeTechnicalMessage(error.message)}.`;
  }

  return 'Sin conexión o el servicio no respondió.';
};


const postInspectionFormData = async (formData: FormData): Promise<LaravelSaveResponse> => {
  const { data } = await axios.post<LaravelSaveResponse>(
    `${API_URL}${INSPECTION_SAVE_PATH}`,
    formData,
    {
      headers: {
        Accept: 'application/json',
        ...(await getAuthHeaders()),
      },
      timeout: INSPECTION_SYNC_TIMEOUT_MS,
    },
  );

  return data;
};

const getResponseImageCount = (response: LaravelSaveResponse) => (
  Array.isArray(response.data?.imagenes) ? response.data.imagenes.length : 0
);

const getResponseImageWarnings = (response: LaravelSaveResponse) => (
  Array.isArray(response.data?.imagenes_advertencias) ? response.data.imagenes_advertencias : []
);

const uploadImageWithRetry = async (inspection: InspectionItem, image: UploadImagePart, imageNumber: number) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= IMAGE_UPLOAD_RETRIES; attempt += 1) {
    try {
      const response = Platform.OS === 'web'
        ? await postInspectionFormData(await buildLaravelInspectionFormData(inspection, [image as FormDataImagePart]))
        : await postNativeInspectionPayload(inspection, [image as NativeImagePart]);
      const warnings = getResponseImageWarnings(response);

      if (getResponseImageCount(response) < 1) {
        throw new Error(
          warnings.length > 0
            ? `Imagen ${imageNumber}: ${warnings.join(' ')}`
            : `Imagen ${imageNumber}: el servidor respondió, pero no confirmó que guardó la imagen.`,
        );
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < IMAGE_UPLOAD_RETRIES) {
        await wait(IMAGE_UPLOAD_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
};

export const submitInspectionToLaravel = async (inspection: InspectionItem) => {
  const images = await resolveInspectionImagesForUpload(inspection);

  if (Platform.OS !== 'web' && inspection.imagenes.length > 0 && images.length !== inspection.imagenes.length) {
    throw new Error(`No se pudieron preparar ${inspection.imagenes.length - images.length} imagen(es) para enviar. Abre la inspección y vuelve a tomar las fotos faltantes.`);
  }

  if (Platform.OS !== 'web') {
    if (images.length === 0) {
      return postNativeInspectionPayload(inspection, []);
    }

    let lastResponse = await postNativeInspectionPayload(inspection, []);

    for (const [index, image] of images.entries()) {
      lastResponse = await uploadImageWithRetry(inspection, image, index + 1);
    }

    return lastResponse;
  }

  return postInspectionFormData(await buildLaravelInspectionFormData(inspection, images));
};

const getSavedInspectionServerId = (response: LaravelSaveResponse) =>
  response.id
  ?? response.data?.id
  ?? response.data?.ingreso?.id
  ?? response.data?.avaluo?.id;

const markInspectionAsSent = (inspection: InspectionItem, response: LaravelSaveResponse): InspectionItem => ({
  ...inspection,
  syncStatus: 'sent',
  syncedAt: new Date().toISOString(),
  lastSyncError: null,
  serverId: getSavedInspectionServerId(response) ?? inspection.serverId ?? null,
});

const markInspectionAsFailed = (inspection: InspectionItem, error: unknown): InspectionItem => ({
  ...inspection,
  syncStatus: 'failed',
  syncAttempts: inspection.syncAttempts + 1,
  lastSyncError: getSyncErrorMessage(error),
});


const storeInspection = async (inspection: InspectionItem) => {
  const current = await getStoredInspections().catch(() => []);
  const exists = current.some((item) => item.id === inspection.id);
  const updated = exists
    ? current.map((item) => (item.id === inspection.id ? inspection : item))
    : [inspection, ...current];

  await saveInspections(updated);
};

export const saveInspectionWithImmediateSync = async (inspection: InspectionItem) => {
  const pendingInspection: InspectionItem = {
    ...inspection,
    syncStatus: 'pending',
    syncAttempts: 0,
    syncedAt: null,
    lastSyncError: null,
  };

  try {
    const response = await submitInspectionToLaravel(pendingInspection);
    const sentInspection = markInspectionAsSent(pendingInspection, response);
    await storeInspection(sentInspection).catch(() => undefined);
    return sentInspection;
  } catch (error) {
    const failedInspection = markInspectionAsFailed(pendingInspection, error);
    await storeInspection(failedInspection);
    return failedInspection;
  }
};

export const syncInspection = async (inspection: InspectionItem) => {
  const current = await getStoredInspections();
  let syncedInspection: InspectionItem;

  try {
    const response = await submitInspectionToLaravel(inspection);
    syncedInspection = markInspectionAsSent(inspection, response);
  } catch (error) {
    syncedInspection = markInspectionAsFailed(inspection, error);
  }

  const exists = current.some((item) => item.id === inspection.id);
  const updated = exists
    ? current.map((item) => (item.id === inspection.id ? syncedInspection : item))
    : [syncedInspection, ...current];

  await saveInspections(updated);

  return syncedInspection;
};

export const syncPendingInspections = async (): Promise<SyncResult> => {
  const inspections = await getStoredInspections();
  const updated: InspectionItem[] = [];
  const sent: InspectionItem[] = [];
  const failed: InspectionItem[] = [];

  for (const inspection of inspections) {
    if (inspection.syncStatus === 'sent') {
      updated.push(inspection);
      continue;
    }

    try {
      const response = await submitInspectionToLaravel(inspection);
      const sentInspection = markInspectionAsSent(inspection, response);
      sent.push(sentInspection);
      updated.push(sentInspection);
    } catch (error) {
      const failedInspection = markInspectionAsFailed(inspection, error);
      failed.push(failedInspection);
      updated.push(failedInspection);
    }
  }

  await saveInspections(updated);

  return {
    sent,
    failed,
    pending: updated.filter((inspection) => inspection.syncStatus !== 'sent'),
  };
};