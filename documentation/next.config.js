const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
});

module.exports = {
  ...withNextra({
    webpack: (config) => {
      // console.log(config.module?.rules);
      config.module?.rules?.unshift({
        resourceQuery: /raw/,
        type: 'asset/source',
      });

      return config;
    },
  }),
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/docs',
        permanent: true,
      },
    ];
  },
};
