import appConfig from '../../app.json';

/** Runtime compatibility gates share the version shipped in the app configuration. */
export const APP_VERSION = appConfig.expo.version;
