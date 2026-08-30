// These imports must run before expo-router mounts the React tree.
import './src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import './src/providers/bootstrap';
import 'expo-router/entry';
