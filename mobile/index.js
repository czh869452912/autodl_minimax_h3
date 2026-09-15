// These imports must run before expo-router mounts the React tree.
import './src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import './src/providers/bootstrap';
import { AppRegistry } from 'react-native';
AppRegistry.registerHeadlessTask('AutoDLTaskMonitor', () => async (taskData) => {
  const { runTaskMonitorHeadless } = require('./src/native/taskMonitor');
  return runTaskMonitorHeadless(typeof taskData?.sessionId === 'string' ? taskData.sessionId : '');
});
import 'expo-router/entry';
