import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SYNC_INTERVAL_MS } from './src/config';
import {
  formatBytes,
  formatMonthLabel,
  MonthlyBandwidthUsage,
} from './src/bandwidthDb';
import { refreshBandwidthUsage, startBandwidthTracking } from './src/bandwidthMonitor';
import {
  CompanyStatus,
  getCompanyId,
  getCompanyName,
  isCompanyIdLocked,
  loadCachedCompanyStatus,
  saveCompanyId,
  setCompanyIdLocked,
  verifyCompanyStatus,
} from './src/companySync';
import {
  DeviceStatus,
  loadCachedDeviceStatus,
  verifyDeviceStatus,
} from './src/deviceSync';
import {
  getDeviceId,
  getLastSyncResult,
  getSecondsUntilNextSync,
  isDeviceIdLocked,
  registerBackgroundSync,
  saveDeviceId,
  setDeviceIdLocked,
  syncEmployeeGpsIfDue,
  SyncResult,
} from './src/gpsSync';
import {
  LOCATION_STORAGE_KEY,
  LOCATION_TASK_NAME,
  StoredLocation,
} from './src/locationTask';

const formatCoordinate = (value: number | undefined) =>
  value === undefined ? '--' : value.toFixed(6);

const formatTimestamp = (timestamp: number | undefined) => {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleString();
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function App() {
  const [location, setLocation] = useState<StoredLocation | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [bandwidthUsage, setBandwidthUsage] = useState<MonthlyBandwidthUsage | null>(null);
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);
  const [isCompanyLocked, setIsCompanyLocked] = useState(false);
  const [deviceSaveMessage, setDeviceSaveMessage] = useState('');
  const [companySaveMessage, setCompanySaveMessage] = useState('');
  const [status, setStatus] = useState('Solicitando permisos...');
  const [syncStatus, setSyncStatus] = useState<SyncResult | null>(null);
  const [secondsUntilSync, setSecondsUntilSync] = useState(0);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [isCompanyChecking, setIsCompanyChecking] = useState(false);
  const [isDeviceChecking, setIsDeviceChecking] = useState(false);

  const refreshSyncStatus = useCallback(async () => {
    setSyncStatus(await getLastSyncResult());
  }, []);

  const loadSavedCompanyStatus = useCallback(async () => {
    const cached = await loadCachedCompanyStatus();
    if (cached) {
      setCompanyStatus(cached);
      setCompanyName(cached.empresa || (await getCompanyName()));
    }
  }, []);

  const loadSavedDeviceStatus = useCallback(async () => {
    const cached = await loadCachedDeviceStatus();
    if (cached) {
      setDeviceStatus(cached);
    }
  }, []);

  const refreshBandwidth = useCallback(async () => {
    setBandwidthUsage(await refreshBandwidthUsage());
  }, []);

  const handleSaveDeviceId = async () => {
    const trimmedDeviceId = deviceId.trim();
    await saveDeviceId(trimmedDeviceId);

    if (!trimmedDeviceId) {
      setDeviceSaveMessage('Ingrese el ID del dispositivo');
      setTimeout(() => setDeviceSaveMessage(''), 3500);
      return;
    }

    setIsDeviceChecking(true);

    try {
      const result = await verifyDeviceStatus(trimmedDeviceId);
      setDeviceStatus(result);
      setDeviceSaveMessage(
        result.activo
          ? 'ID guardado. Empleado habilitado'
          : `ID guardado. ${result.message}`,
      );
    } finally {
      setIsDeviceChecking(false);
    }

    setTimeout(() => setDeviceSaveMessage(''), 3500);
  };

  const handleSaveCompanyId = async () => {
    const trimmedCompanyId = companyId.trim();
    await saveCompanyId(trimmedCompanyId);

    if (!trimmedCompanyId) {
      setCompanySaveMessage('Ingrese el ID de la empresa');
      setTimeout(() => setCompanySaveMessage(''), 3500);
      return;
    }

    setIsCompanyChecking(true);

    try {
      const result = await verifyCompanyStatus(trimmedCompanyId);
      setCompanyStatus(result);
      setCompanyName(result.empresa);
      setCompanySaveMessage(
        result.activo
          ? 'Empresa guardada y habilitada'
          : `Empresa guardada. ${result.message}`,
      );
    } finally {
      setIsCompanyChecking(false);
    }

    setTimeout(() => setCompanySaveMessage(''), 3500);
  };

  const handleToggleDeviceLock = async () => {
    const nextLocked = !isDeviceLocked;
    setIsDeviceLocked(nextLocked);
    await setDeviceIdLocked(nextLocked);
  };

  const handleToggleCompanyLock = async () => {
    const nextLocked = !isCompanyLocked;
    setIsCompanyLocked(nextLocked);
    await setCompanyIdLocked(nextLocked);
  };

  useEffect(() => {
    const updateCountdown = async () => {
      setSecondsUntilSync(await getSecondsUntilNextSync());
    };

    void updateCountdown();
    const countdownTimer = setInterval(() => {
      void updateCountdown();
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [syncStatus]);

  useEffect(() => {
    let foregroundSubscription: Location.LocationSubscription | null = null;
    let locationPollInterval: ReturnType<typeof setInterval> | null = null;
    let syncInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const loadStoredLocation = async () => {
      const stored = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
      if (!stored || !mounted) {
        return;
      }

      setLocation(JSON.parse(stored) as StoredLocation);
    };

    const runSyncIfDue = async () => {
      const result = await syncEmployeeGpsIfDue();
      if (result && mounted) {
        setSyncStatus(result);
      }
      if (mounted) {
        setSecondsUntilSync(await getSecondsUntilNextSync());
      }
    };

    const persistLocation = async (next: StoredLocation) => {
      setLocation(next);
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next));
    };

    const startTracking = async () => {
      const savedDeviceId = await getDeviceId();
      const savedCompanyId = await getCompanyId();
      const deviceLocked = await isDeviceIdLocked();
      const companyLocked = await isCompanyIdLocked();

      if (mounted) {
        setDeviceId(savedDeviceId);
        setCompanyId(savedCompanyId);
        setIsDeviceLocked(deviceLocked);
        setIsCompanyLocked(companyLocked);
      }

      await loadSavedCompanyStatus();
      await loadSavedDeviceStatus();
      await refreshSyncStatus();
      await registerBackgroundSync();

      const foregroundPermission =
        await Location.requestForegroundPermissionsAsync();

      if (foregroundPermission.status !== 'granted') {
        setStatus('Permiso de ubicacion denegado');
        return;
      }

      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();
      const hasBackgroundPermission = backgroundPermission.status === 'granted';
      setBackgroundEnabled(hasBackgroundPermission);

      if (hasBackgroundPermission) {
        setStatus('GPS activo en primer plano y segundo plano');
      } else {
        setStatus('GPS activo solo en primer plano');
      }

      const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME,
      );

      if (!alreadyRunning && hasBackgroundPermission) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 5,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          foregroundService: {
            notificationTitle: 'SALES TRACK activo',
            notificationBody: 'Enviando ubicacion cada 5 minutos',
            notificationColor: '#0A0A0A',
          },
        });
      }

      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (currentLocation) => {
          void persistLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            timestamp: currentLocation.timestamp,
          });
        },
      );

      await runSyncIfDue();
    };

    void loadStoredLocation();
    void startTracking();

    locationPollInterval = setInterval(() => {
      void loadStoredLocation();
    }, 5000);

    syncInterval = setInterval(() => {
      void runSyncIfDue();
    }, SYNC_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadStoredLocation();
        void refreshSyncStatus();
        void runSyncIfDue();
        void refreshBandwidth();
      }
    });

    return () => {
      mounted = false;
      foregroundSubscription?.remove();
      if (locationPollInterval) {
        clearInterval(locationPollInterval);
      }
      if (syncInterval) {
        clearInterval(syncInterval);
      }
      appStateSubscription.remove();
    };
  }, [loadSavedCompanyStatus, loadSavedDeviceStatus, refreshSyncStatus, refreshBandwidth]);

  useEffect(() => {
    void refreshBandwidth();
    const stopTracking = startBandwidthTracking(() => {
      void refreshBandwidth();
    });

    return () => stopTracking();
  }, [refreshBandwidth]);

  const companyActive = companyStatus?.activo ?? false;
  const deviceActive = deviceStatus?.activo ?? false;
  const gpsAllowed = companyActive && deviceActive;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>SALES TRACK</Text>
      <Text style={styles.subtitle}>
        Coordenadas en tiempo real y envio automatico cada 5 minutos
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>ID de la empresa</Text>
        <TextInput
          value={companyId}
          onChangeText={setCompanyId}
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={[styles.input, isCompanyLocked && styles.inputLocked]}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isCompanyLocked}
        />
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.button, isCompanyLocked && styles.buttonDisabled]}
            onPress={() => {
              void handleSaveCompanyId();
            }}
            disabled={isCompanyLocked}
          >
            <Text style={styles.buttonText}>Guardar empresa</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => {
              void handleToggleCompanyLock();
            }}
          >
            <Text style={styles.buttonTextSecondary}>
              {isCompanyLocked ? 'Desbloquear' : 'Bloquear'}
            </Text>
          </Pressable>
        </View>
        {companySaveMessage ? (
          <Text style={styles.saveMessage}>{companySaveMessage}</Text>
        ) : null}
        {companyStatus ? (
          <>
            <View style={styles.companyStatusRow}>
              {isCompanyChecking ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <View
                style={[
                  styles.statusPill,
                  companyActive ? styles.statusPillActive : styles.statusPillInactive,
                ]}
              >
                <Text style={styles.statusPillText}>
                  {companyActive ? 'Empresa activa' : 'Empresa inactiva'}
                </Text>
              </View>
            </View>
            <Text style={styles.helper}>
              {companyName ? `${companyName} · ` : ''}
              {companyStatus.message}
            </Text>
          </>
        ) : (
          <Text style={styles.helper}>Guarde el ID de la empresa para verificar si esta activa</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>ID del dispositivo</Text>
        <TextInput
          value={deviceId}
          onChangeText={setDeviceId}
          placeholder="Ej: EMP001"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={[styles.input, isDeviceLocked && styles.inputLocked]}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isDeviceLocked}
        />
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.button, isDeviceLocked && styles.buttonDisabled]}
            onPress={() => {
              void handleSaveDeviceId();
            }}
            disabled={isDeviceLocked}
          >
            <Text style={styles.buttonText}>Guardar ID</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => {
              void handleToggleDeviceLock();
            }}
          >
            <Text style={styles.buttonTextSecondary}>
              {isDeviceLocked ? 'Desbloquear' : 'Bloquear'}
            </Text>
          </Pressable>
        </View>
        {deviceSaveMessage ? <Text style={styles.saveMessage}>{deviceSaveMessage}</Text> : null}
        {deviceStatus ? (
          <>
            <View style={styles.companyStatusRow}>
              {isDeviceChecking ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <View
                style={[
                  styles.statusPill,
                  deviceActive ? styles.statusPillActive : styles.statusPillInactive,
                ]}
              >
                <Text style={styles.statusPillText}>
                  {deviceActive ? 'Empleado habilitado' : 'Empleado no habilitado'}
                </Text>
              </View>
            </View>
            <Text style={styles.helper}>
              {deviceStatus.empleado ? `${deviceStatus.empleado} · ` : ''}
              {deviceStatus.message}
            </Text>
          </>
        ) : (
          <Text style={styles.helper}>
            Guarde el ID para verificar si el empleado esta habilitado en EMPLEADOS
          </Text>
        )}
      </View>

      {bandwidthUsage ? (
        <View style={styles.card}>
          <Text style={styles.label}>Datos moviles de la app</Text>
          <Text style={styles.helper}>
            {formatMonthLabel(bandwidthUsage.year, bandwidthUsage.month)} · solo celular
          </Text>
          <Text style={[styles.label, styles.spacing]}>Descarga</Text>
          <Text style={styles.valueSmall}>{formatBytes(bandwidthUsage.bytesReceived)}</Text>
          <Text style={[styles.label, styles.spacing]}>Subida</Text>
          <Text style={styles.valueSmall}>{formatBytes(bandwidthUsage.bytesSent)}</Text>
          <Text style={styles.helper}>
            Total: {formatBytes(bandwidthUsage.bytesReceived + bandwidthUsage.bytesSent)}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Latitud</Text>
        <Text style={styles.value}>{formatCoordinate(location?.latitude)}</Text>

        <Text style={[styles.label, styles.spacing]}>Longitud</Text>
        <Text style={styles.value}>{formatCoordinate(location?.longitude)}</Text>

        <Text style={[styles.label, styles.spacing]}>Ultima actualizacion GPS</Text>
        <Text style={styles.meta}>{formatTimestamp(location?.timestamp)}</Text>
      </View>

      <View style={styles.statusCard}>
        {!location ? <ActivityIndicator color="#FFFFFF" style={styles.loader} /> : null}
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.platform}>
          Plataforma: {Platform.OS} | Segundo plano:{' '}
          {backgroundEnabled ? 'habilitado' : 'no habilitado'}
        </Text>

        <Text style={styles.platform}>
          Envio GPS: {gpsAllowed ? 'permitido' : 'bloqueado'}
        </Text>
        {!companyActive ? (
          <Text style={styles.platform}>Motivo: empresa inactiva o no configurada</Text>
        ) : null}
        {companyActive && !deviceActive ? (
          <Text style={styles.platform}>Motivo: empleado no habilitado o no encontrado</Text>
        ) : null}

        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Proximo envio en</Text>
          <Text style={styles.timerValue}>
            {secondsUntilSync === 0 ? 'Enviando...' : formatCountdown(secondsUntilSync)}
          </Text>
        </View>

        <Text style={[styles.syncTitle, styles.spacing]}>Ultimo envio a EMPLEADOS_GPS</Text>
        <Text style={styles.syncStatus}>
          {syncStatus
            ? `${syncStatus.ok ? 'OK' : 'Error'}: ${syncStatus.message}`
            : 'Aun no hay envios'}
        </Text>
        <Text style={styles.meta}>
          {syncStatus ? formatTimestamp(syncStatus.syncedAt) : '--'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 28,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputLocked: {
    opacity: 0.55,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  button: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  saveMessage: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    marginTop: 10,
  },
  helper: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  companyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillActive: {
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  statusPillInactive: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  valueSmall: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    marginTop: 6,
  },
  spacing: {
    marginTop: 20,
  },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loader: {
    marginBottom: 12,
  },
  status: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  platform: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginTop: 8,
  },
  syncTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  syncStatus: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    marginTop: 8,
  },
  timerCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timerLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timerValue: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '700',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
});
