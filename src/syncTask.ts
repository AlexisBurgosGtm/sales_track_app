import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { SYNC_TASK_NAME } from './config';
import { syncEmployeeGpsIfDue } from './gpsSync';

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  try {
    const result = await syncEmployeeGpsIfDue();

    if (result?.ok) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background sync task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
