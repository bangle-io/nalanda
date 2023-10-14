const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
});

module.exports = {
  ...withNextra({
    reactStrictMode: true,
    eslint: {
      // ESLint behaves weirdly in this monorepo.
      ignoreDuringBuilds: true,
    },
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
