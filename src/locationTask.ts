import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK_NAME = 'background-location-task';
export const LOCATION_STORAGE_KEY = 'last-location';

export type StoredLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)
    ?.locations;

  const location = locations?.[0];
  if (!location) {
    return;
  }

  const payload: StoredLocation = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
  };

  await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(payload));

  const { syncEmployeeGpsIfDue } = await import('./gpsSync');
  await syncEmployeeGpsIfDue();
});
