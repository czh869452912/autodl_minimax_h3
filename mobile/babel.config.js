module.exports = function (api) {
  const isAndroid = api.caller(caller => caller?.platform === 'android');
  // The current Android Hermes native-async path can lose resolved values
  // (reproduced by the project-read device probe). Keep async lowering on
  // Android until that runtime passes the same probe; web/iOS stay default.
  return {
    presets: ['babel-preset-expo'],
    plugins: isAndroid ? ['@babel/plugin-transform-async-to-generator'] : [],
  };
};
