import * as SQLite from 'expo-sqlite';

const DB_NAME = 'sales_track.db';

export type MonthlyBandwidthUsage = {
  year: number;
  month: number;
  bytesReceived: number;
  bytesSent: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS mobile_bandwidth (
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          bytes_received INTEGER NOT NULL DEFAULT 0,
          bytes_sent INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (year, month)
        );
      `);
      return db;
    })();
  }

  return dbPromise;
};

const getCurrentPeriod = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
};

export const getCurrentMonthBandwidthUsage = async (): Promise<MonthlyBandwidthUsage> => {
  const db = await getDb();
  const { year, month } = getCurrentPeriod();

  const row = await db.getFirstAsync<{
    bytes_received: number;
    bytes_sent: number;
  }>(
    `SELECT bytes_received, bytes_sent
     FROM mobile_bandwidth
     WHERE year = ? AND month = ?`,
    year,
    month,
  );

  if (!row) {
    return { year, month, bytesReceived: 0, bytesSent: 0 };
  }

  return {
    year,
    month,
    bytesReceived: row.bytes_received,
    bytesSent: row.bytes_sent,
  };
};

export const addMobileBandwidthUsage = async (rxBytes: number, txBytes: number) => {
  if (rxBytes <= 0 && txBytes <= 0) {
    return;
  }

  const db = await getDb();
  const { year, month } = getCurrentPeriod();

  await db.runAsync(
    `INSERT INTO mobile_bandwidth (year, month, bytes_received, bytes_sent)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(year, month) DO UPDATE SET
       bytes_received = bytes_received + excluded.bytes_received,
       bytes_sent = bytes_sent + excluded.bytes_sent`,
    year,
    month,
    Math.max(0, rxBytes),
    Math.max(0, txBytes),
  );
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatMonthLabel = (year: number, month: number) => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
};
