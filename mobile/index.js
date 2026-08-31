// These imports must run before expo-router mounts the React tree.
import './src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import './src/providers/bootstrap';
import { AppRegistry } from 'react-native';
AppRegistry.registerHeadlessTask('AutoDLTaskMonitor', () => async () => {
  const { syncTaskRun } = require('./src/tasks/sync');
  const { stopTaskMonitor } = require('./src/native/taskMonitor');
  const result = await syncTaskRun('service');
  if (result.summary.remaining === 0) await stopTaskMonitor();
  return result.summary;
});
import 'expo-router/entry';
