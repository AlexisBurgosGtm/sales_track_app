import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  API_BASE_URL,
  COMPANY_ACTIVE_STORAGE_KEY,
  COMPANY_ID_LOCKED_STORAGE_KEY,
  COMPANY_ID_STORAGE_KEY,
  COMPANY_NAME_STORAGE_KEY,
  COMPANY_STATUS_MESSAGE_STORAGE_KEY,
} from './config';

export type CompanyStatus = {
  activo: boolean;
  empresa: string;
  message: string;
};

export const getCompanyId = async () => {
  const stored = await AsyncStorage.getItem(COMPANY_ID_STORAGE_KEY);
  return stored?.trim() ?? '';
};

export const saveCompanyId = async (companyId: string) => {
  await AsyncStorage.setItem(COMPANY_ID_STORAGE_KEY, companyId.trim());
};

export const isCompanyIdLocked = async () => {
  const stored = await AsyncStorage.getItem(COMPANY_ID_LOCKED_STORAGE_KEY);
  return stored === 'true';
};

export const setCompanyIdLocked = async (locked: boolean) => {
  await AsyncStorage.setItem(COMPANY_ID_LOCKED_STORAGE_KEY, locked ? 'true' : 'false');
};

export const isCompanyActive = async () => {
  const stored = await AsyncStorage.getItem(COMPANY_ACTIVE_STORAGE_KEY);
  return stored === 'true';
};

export const getCompanyName = async () => {
  const stored = await AsyncStorage.getItem(COMPANY_NAME_STORAGE_KEY);
  return stored?.trim() ?? '';
};

const persistCompanyStatus = async (status: CompanyStatus) => {
  await AsyncStorage.setItem(COMPANY_ACTIVE_STORAGE_KEY, status.activo ? 'true' : 'false');
  await AsyncStorage.setItem(COMPANY_STATUS_MESSAGE_STORAGE_KEY, status.message);

  if (status.empresa) {
    await AsyncStorage.setItem(COMPANY_NAME_STORAGE_KEY, status.empresa);
  }
};

export const loadCachedCompanyStatus = async (): Promise<CompanyStatus | null> => {
  const companyId = await getCompanyId();
  if (!companyId) {
    return null;
  }

  const active = await AsyncStorage.getItem(COMPANY_ACTIVE_STORAGE_KEY);
  if (active === null) {
    return null;
  }

  const empresa = await getCompanyName();
  const message = await AsyncStorage.getItem(COMPANY_STATUS_MESSAGE_STORAGE_KEY);

  return {
    activo: active === 'true',
    empresa,
    message: message ?? (active === 'true' ? 'Empresa activa' : 'Empresa inactiva'),
  };
};

export const verifyCompanyStatus = async (empnit: string): Promise<CompanyStatus> => {
  const companyId = empnit.trim();

  if (!companyId) {
    const status: CompanyStatus = {
      activo: false,
      empresa: '',
      message: 'Ingrese el ID de la empresa',
    };
    return status;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/empresas/verify/${encodeURIComponent(companyId)}`,
    );
    const payload = await response.json();
    const activo = response.ok && payload.activo === true;
    const empresa = payload.empresa ? String(payload.empresa) : '';
    const message =
      payload.message ?? (activo ? 'Empresa activa' : 'Empresa inactiva o no encontrada');

    const status: CompanyStatus = { activo, empresa, message };
    await persistCompanyStatus(status);
    return status;
  } catch (error) {
    const status: CompanyStatus = {
      activo: false,
      empresa: await getCompanyName(),
      message: error instanceof Error ? error.message : 'No se pudo verificar la empresa',
    };
    await persistCompanyStatus(status);
    return status;
  }
};
