module.exports = ({ config }) => {
  if (process.env.AUTODL_BUILD_VARIANT !== 'beta') return config;
  return {
    ...config,
    name: 'AutoDL H3 测试版',
    scheme: 'autodlh3-beta',
    version: `${config.version}-beta`,
    android: { ...config.android, package: 'com.example.autodlh3.beta' },
  };
};
