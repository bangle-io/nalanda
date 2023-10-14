import type { DocsThemeConfig } from 'nextra-theme-docs';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useConfig } from 'nextra-theme-docs';

const config: DocsThemeConfig = {
  logo: (
    <span className="animate-gradientAnimation font-black inline-block text-transparent bg-clip-text bg-gradient-to-r dark:from-red-100 dark:to-amber-500 from-red-600 to-amber-500">
      Nalanda
    </span>
  ),
  docsRepositoryBase:
    'https://github.com/bangle-io/nalanda/blob/dev/documentation/pages',
  project: {
    link: 'https://github.com/bangle-io/nalanda',
  },
  useNextSeoProps() {
    const { asPath } = useRouter();
    if (asPath !== '/') {
      return {
        titleTemplate: '%s – Nalanda',
      };
    }
  },
  primaryHue: {
    light: 40,
    dark: 50,
  },
  primarySaturation: {
    light: 65,
    dark: 70,
  },
  head: function useHead() {
    const { asPath, defaultLocale, locale } = useRouter();
    const { frontMatter } = useConfig();
    const url =
      'https://nalanda.bangle.io' +
      (defaultLocale === locale ? asPath : `/${locale}${asPath}`);

    return (
      <>
        <meta httpEquiv="Content-Language" content="en" />
        <meta name="msapplication-TileColor" content="#fff" />
        <meta name="theme-color" content="#fff" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Powerful state management for Javascript apps."
        />
        <meta property="og:url" content={url} />
        <meta
          property="og:title"
          content={frontMatter.title || 'Nalanda State Management'}
        />
        <link rel="icon" href="/nalanda.png" type="image/png" />
        <meta
          property="og:description"
          content={
            frontMatter.description ||
            'Powerful state management for Javascript apps.'
          }
        />
      </>
    );
  },
  footer: {
    text: (
      <div className="flex w-full flex-col items-center sm:items-start">
        <div>
          <a
            className="flex items-center gap-1 text-current"
            target="_blank"
            rel="noopener noreferrer"
            title="Bangle.io"
            href="https://bangle.io"
          >
            <span>Bangle.io</span>
          </a>
        </div>
      </div>
    ),
  },
};

export default config;
