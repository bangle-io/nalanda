const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
});

module.exports = {
  ...withNextra({
    trailingSlash: true,
    images: {
      unoptimized: true,
    },
    swcMinify: true,
    webpack: (config) => {
      // console.log(config.module?.rules);
      config.module?.rules?.unshift({
        resourceQuery: /raw/,
        type: 'asset/source',
      });

      return config;
    },
  }),
};
