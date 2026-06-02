import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  API_BASE_URL,
  DEVICE_ACTIVE_STORAGE_KEY,
  DEVICE_EMPLEADO_STORAGE_KEY,
  DEVICE_ID_STORAGE_KEY,
  DEVICE_STATUS_MESSAGE_STORAGE_KEY,
} from './config';
import { getCompanyId } from './companySync';

export type DeviceStatus = {
  activo: boolean;
  empleado: string;
  message: string;
};

export const isDeviceActive = async () => {
  const stored = await AsyncStorage.getItem(DEVICE_ACTIVE_STORAGE_KEY);
  return stored === 'true';
};

export const getDeviceEmpleadoName = async () => {
  const stored = await AsyncStorage.getItem(DEVICE_EMPLEADO_STORAGE_KEY);
  return stored?.trim() ?? '';
};

const persistDeviceStatus = async (status: DeviceStatus) => {
  await AsyncStorage.setItem(DEVICE_ACTIVE_STORAGE_KEY, status.activo ? 'true' : 'false');
  await AsyncStorage.setItem(DEVICE_STATUS_MESSAGE_STORAGE_KEY, status.message);

  if (status.empleado) {
    await AsyncStorage.setItem(DEVICE_EMPLEADO_STORAGE_KEY, status.empleado);
  }
};

export const loadCachedDeviceStatus = async (): Promise<DeviceStatus | null> => {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId?.trim()) {
    return null;
  }

  const active = await AsyncStorage.getItem(DEVICE_ACTIVE_STORAGE_KEY);
  if (active === null) {
    return null;
  }

  const empleado = await getDeviceEmpleadoName();
  const message = await AsyncStorage.getItem(DEVICE_STATUS_MESSAGE_STORAGE_KEY);

  return {
    activo: active === 'true',
    empleado,
    message: message ?? (active === 'true' ? 'Empleado habilitado' : 'Empleado no habilitado'),
  };
};

export const verifyDeviceStatus = async (codigo: string): Promise<DeviceStatus> => {
  const deviceCode = codigo.trim();
  const empnit = (await getCompanyId()).trim();

  if (!deviceCode) {
    return {
      activo: false,
      empleado: '',
      message: 'Ingrese el ID del dispositivo',
    };
  }

  if (!empnit) {
    const status: DeviceStatus = {
      activo: false,
      empleado: '',
      message: 'Configure primero el ID de la empresa',
    };
    await persistDeviceStatus(status);
    return status;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/empleados/verify/${encodeURIComponent(empnit)}/${encodeURIComponent(deviceCode)}`,
    );
    const payload = await response.json();
    const activo = response.ok && payload.activo === true;
    const empleado = payload.empleado ? String(payload.empleado) : '';
    const message =
      payload.message ??
      (activo ? 'Empleado habilitado' : 'Empleado no habilitado o no encontrado');

    const status: DeviceStatus = { activo, empleado, message };
    await persistDeviceStatus(status);
    return status;
  } catch (error) {
    const status: DeviceStatus = {
      activo: false,
      empleado: await getDeviceEmpleadoName(),
      message: error instanceof Error ? error.message : 'No se pudo verificar el empleado',
    };
    await persistDeviceStatus(status);
    return status;
  }
};
