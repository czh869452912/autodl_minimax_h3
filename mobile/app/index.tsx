import { Redirect } from 'expo-router';

/**
 * Explicit entry point for the app scheme (autodlh3:///).
 * Without a root route Expo Router renders its unmatched-route screen on a
 * cold launch because the tabs are only defined inside a route group.
 */
export default function IndexRoute() {
  return <Redirect href="/(tabs)/create" />;
}
