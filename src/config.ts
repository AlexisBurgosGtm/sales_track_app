export const DEVICE_ID_STORAGE_KEY = 'device-id';
export const DEVICE_ID_LOCKED_STORAGE_KEY = 'device-id-locked';
export const DEVICE_ACTIVE_STORAGE_KEY = 'device-active';
export const DEVICE_EMPLEADO_STORAGE_KEY = 'device-empleado';
export const DEVICE_STATUS_MESSAGE_STORAGE_KEY = 'device-status-message';
export const COMPANY_ID_STORAGE_KEY = 'company-id';
export const COMPANY_ID_LOCKED_STORAGE_KEY = 'company-id-locked';
export const COMPANY_ACTIVE_STORAGE_KEY = 'company-active';
export const COMPANY_NAME_STORAGE_KEY = 'company-name';
export const COMPANY_STATUS_MESSAGE_STORAGE_KEY = 'company-status-message';
export const LAST_SYNC_STORAGE_KEY = 'last-gps-sync';
export const LAST_SYNC_ATTEMPT_STORAGE_KEY = 'last-gps-sync-attempt';
export const LAST_SYNC_STATUS_STORAGE_KEY = 'last-gps-sync-status';
export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const SYNC_TASK_NAME = 'background-gps-sync-task';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');