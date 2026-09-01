// These imports must run before expo-router mounts the React tree.
import './src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import './src/providers/bootstrap';
import { AppRegistry } from 'react-native';
AppRegistry.registerHeadlessTask('AutoDLTaskMonitor', () => async (taskData) => {
  const { syncTaskRun } = require('./src/tasks/sync');
  const { stopTaskMonitor } = require('./src/native/taskMonitor');
  const { getTaskMonitorStatus } = require('./src/native/taskMonitor');
  const monitor = await getTaskMonitorStatus();
  const taskIds = Array.isArray(taskData?.taskIds) ? taskData.taskIds.map(String) : monitor.taskIds;
  const result = await syncTaskRun('service', taskIds);
  if (result.summary.remaining === 0) await stopTaskMonitor();
  return result.summary;
});
import 'expo-router/entry';
