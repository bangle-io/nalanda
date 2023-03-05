import type { DocsThemeConfig } from 'nextra-theme-docs';

const config: DocsThemeConfig = {
  logo: <span>Nalanda State</span>,
  docsRepositoryBase:
    'https://github.com/bangle-io/nalanda/blob/dev/documentation/pages',
  project: {
    link: 'https://github.com/bangle-io/nalanda',
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
