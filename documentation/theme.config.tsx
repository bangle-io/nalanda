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
    return undefined;
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
          content={frontMatter['title'] || 'Nalanda State Management'}
        />
        <link rel="icon" href="/nalanda.png" type="image/png" />
        <meta
          property="og:description"
          content={
            frontMatter['description'] ||
            'Powerful state management for Javascript apps.'
          }
        />
      </>
    );
  },
  footer: {
    text: (
      <div className="flex w-full justify-around">
        <div className="flex flex-col items-start">
          <a
            className="flex items-center gap-1 text-current mb-2"
            target="_blank"
            rel="noopener noreferrer"
            title="Bangle.io"
            href="https://bangle.io"
          >
            <span>Bangle.io - An opensource local note-taking app</span>
          </a>
        </div>

        <div className="flex flex-col items-start gap-1">
          <a
            className="pr-8 inline-flex flex-row-reverse"
            href="https://discord.gg/Fn8ZRMkFAb"
            target="_blank"
          >
            <span className="pl-2 ">Discord</span>
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 71 55"
            >
              <g clip-path="url(#a)">
                <path
                  d="M60.1 4.9A58.55 58.55 0 0 0 45.65.42a.22.22 0 0 0-.23.1 40.78 40.78 0 0 0-1.8 3.7 54.05 54.05 0 0 0-16.23 0 37.4 37.4 0 0 0-1.83-3.7.23.23 0 0 0-.23-.1c-5.07.87-9.92 2.4-14.45 4.48a.2.2 0 0 0-.1.08C1.58 18.73-.94 32.14.3 45.39c0 .07.05.13.1.17a58.88 58.88 0 0 0 17.72 8.96c.1.03.2 0 .25-.08a42.08 42.08 0 0 0 3.63-5.9.22.22 0 0 0-.12-.31 38.77 38.77 0 0 1-5.54-2.64.23.23 0 0 1-.02-.38l1.1-.86a.22.22 0 0 1 .23-.03 41.99 41.99 0 0 0 35.68 0 .22.22 0 0 1 .23.02c.36.3.73.59 1.1.87.13.1.12.3-.02.38a36.38 36.38 0 0 1-5.54 2.63.23.23 0 0 0-.12.32 47.25 47.25 0 0 0 3.63 5.9c.05.07.15.1.24.08 5.8-1.8 11.69-4.5 17.76-8.96.06-.04.09-.1.1-.17C72.16 30.08 68.2 16.78 60.2 5a.18.18 0 0 0-.1-.1ZM23.73 37.33c-3.5 0-6.38-3.22-6.38-7.16 0-3.95 2.82-7.16 6.38-7.16 3.58 0 6.43 3.24 6.38 7.16 0 3.94-2.83 7.16-6.38 7.16Zm23.59 0c-3.5 0-6.38-3.22-6.38-7.16 0-3.95 2.82-7.16 6.38-7.16 3.58 0 6.43 3.24 6.38 7.16 0 3.94-2.8 7.16-6.38 7.16Z"
                  fill="#5865F2"
                ></path>
              </g>
              <defs>
                <clipPath id="a">
                  <path fill="#fff" d="M0 0h71v55H0z"></path>
                </clipPath>
              </defs>
            </svg>
          </a>

          <a
            className="pr-8 inline-flex flex-row-reverse"
            href="https://github.com/bangle-io/nalanda"
            target="_blank"
          >
            <span className="pl-2">Github</span>
            <img
              src="https://github.githubassets.com/images/modules/site/icons/footer/github-mark.svg"
              width="22"
              height="22"
              className="d-block"
              loading="lazy"
              decoding="async"
              alt="GitHub mark"
            />
          </a>

          <a
            className="pr-8 inline-flex flex-row-reverse"
            href="https://twitter.com/bangle_io"
            target="_blank"
          >
            <span className="pl-2 ">Twitter</span>
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="#1DA1F2"
              viewBox="0 0 24 24"
            >
              <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path>
            </svg>
          </a>
        </div>
      </div>
    ),
  },
};

export default config;
