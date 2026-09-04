// These imports must run before expo-router mounts the React tree.
import './src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import './src/providers/bootstrap';
import { AppRegistry } from 'react-native';
AppRegistry.registerHeadlessTask('AutoDLTaskMonitor', () => async (taskData) => {
  const { getTaskMonitorStatus, runTaskMonitorHeadless } = require('./src/native/taskMonitor');
  const monitor = await getTaskMonitorStatus();
  const taskIds = Array.isArray(taskData?.taskIds) ? taskData.taskIds.map(String) : monitor.taskIds;
  return runTaskMonitorHeadless(taskIds);
});
import 'expo-router/entry';
