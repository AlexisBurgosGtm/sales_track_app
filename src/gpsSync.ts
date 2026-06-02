import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  API_BASE_URL,
  DEVICE_ID_LOCKED_STORAGE_KEY,
  DEVICE_ID_STORAGE_KEY,
  LAST_SYNC_ATTEMPT_STORAGE_KEY,
  LAST_SYNC_STATUS_STORAGE_KEY,
  LAST_SYNC_STORAGE_KEY,
  SYNC_INTERVAL_MS,
} from './config';
import { isCompanyActive, getCompanyId } from './companySync';
import { isDeviceActive } from './deviceSync';
import { LOCATION_STORAGE_KEY, StoredLocation } from './locationTask';

export type SyncResult = {
  ok: boolean;
  message: string;
  syncedAt: number;
};

const pad = (value: number) => value.toString().padStart(2, '0');

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
};

const formatLocalTime = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const getDeviceId = async () => {
  const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  return stored?.trim() ?? '';
};

export const saveDeviceId = async (deviceId: string) => {
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId.trim());
};

export const isDeviceIdLocked = async () => {
  const stored = await AsyncStorage.getItem(DEVICE_ID_LOCKED_STORAGE_KEY);
  return stored === 'true';
};

export const setDeviceIdLocked = async (locked: boolean) => {
  await AsyncStorage.setItem(DEVICE_ID_LOCKED_STORAGE_KEY, locked ? 'true' : 'false');
};

type ApiResponse = {
  message?: string;
};

const parseApiResponse = async (response: Response): Promise<ApiResponse> => {
  const body = await response.text();
  const trimmed = body.trim();

  if (!trimmed) {
    return {
      message: response.ok
        ? 'Respuesta vacia del servidor'
        : `Error HTTP ${response.status}`,
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as ApiResponse;
    } catch {
      return { message: 'Respuesta JSON invalida del servidor' };
    }
  }

  const preview = trimmed.replace(/\s+/g, ' ').slice(0, 100);

  return {
    message: `El servidor respondio HTML en lugar de JSON (${response.status}). Verifica EXPO_PUBLIC_API_URL. ${preview}`,
  };
};

export const getLastSyncResult = async (): Promise<SyncResult | null> => {
  const stored = await AsyncStorage.getItem(LAST_SYNC_STATUS_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  return JSON.parse(stored) as SyncResult;
};

const saveLastSyncResult = async (result: SyncResult) => {
  await AsyncStorage.setItem(LAST_SYNC_STATUS_STORAGE_KEY, JSON.stringify(result));
  await AsyncStorage.setItem(LAST_SYNC_STORAGE_KEY, result.syncedAt.toString());
};

const markSyncAttempt = async () => {
  await AsyncStorage.setItem(LAST_SYNC_ATTEMPT_STORAGE_KEY, Date.now().toString());
};

const buildConfigError = async (message: string): Promise<SyncResult> => {
  const result: SyncResult = {
    ok: false,
    message,
    syncedAt: Date.now(),
  };
  await AsyncStorage.setItem(LAST_SYNC_STATUS_STORAGE_KEY, JSON.stringify(result));
  return result;
};

export const shouldSyncNow = async () => {
  const lastAttempt = await AsyncStorage.getItem(LAST_SYNC_ATTEMPT_STORAGE_KEY);
  if (!lastAttempt) {
    return true;
  }

  return Date.now() - Number(lastAttempt) >= SYNC_INTERVAL_MS;
};

export const getSecondsUntilNextSync = async () => {
  const lastAttempt = await AsyncStorage.getItem(LAST_SYNC_ATTEMPT_STORAGE_KEY);
  if (!lastAttempt) {
    return 0;
  }

  const elapsed = Date.now() - Number(lastAttempt);
  const remaining = SYNC_INTERVAL_MS - elapsed;

  return Math.max(0, Math.ceil(remaining / 1000));
};

export const syncEmployeeGps = async (): Promise<SyncResult> => {
  const deviceId = await getDeviceId();
  if (!deviceId) {
    return buildConfigError('Configura el ID del dispositivo');
  }

  const companyId = await getCompanyId();
  if (!companyId) {
    return buildConfigError('Configura el ID de la empresa');
  }

  if (!(await isCompanyActive())) {
    return buildConfigError('Empresa inactiva. Envio GPS bloqueado');
  }

  if (!(await isDeviceActive())) {
    return buildConfigError('Empleado no habilitado. Envio GPS bloqueado');
  }

  const storedLocation = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
  if (!storedLocation) {
    return buildConfigError('Esperando ubicacion GPS');
  }

  const location = JSON.parse(storedLocation) as StoredLocation;
  const now = new Date();

  await markSyncAttempt();

  try {
    const response = await fetch(`${API_BASE_URL}/api/gps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        codigo: deviceId,
        fecha: formatLocalDate(now),
        hora: formatLocalTime(now),
        latitud: location.latitude,
        longitud: location.longitude,
      }),
    });

    const payload = await parseApiResponse(response);
    const result: SyncResult = {
      ok: response.ok,
      message: payload.message ?? (response.ok ? 'Datos enviados' : 'Error al enviar'),
      syncedAt: Date.now(),
    };

    if (result.ok) {
      await saveLastSyncResult(result);
    } else {
      await AsyncStorage.setItem(LAST_SYNC_STATUS_STORAGE_KEY, JSON.stringify(result));
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo conectar al servidor';

    const result: SyncResult = {
      ok: false,
      message,
      syncedAt: Date.now(),
    };

    await AsyncStorage.setItem(LAST_SYNC_STATUS_STORAGE_KEY, JSON.stringify(result));
    return result;
  }
};

export const syncEmployeeGpsIfDue = async () => {
  if (!(await shouldSyncNow())) {
    return null;
  }

  return syncEmployeeGps();
};

export const syncEmployeeGpsNow = async () => syncEmployeeGps();

export const registerBackgroundSync = async () => {
  const BackgroundFetch = await import('expo-background-fetch');
  const TaskManager = await import('expo-task-manager');
  const { SYNC_TASK_NAME } = await import('./config');

  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (isRegistered) {
    return;
  }

  await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
    minimumInterval: SYNC_INTERVAL_MS / 1000,
    stopOnTerminate: false,
    startOnBoot: true,
  });
};
