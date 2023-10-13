import type { DocsThemeConfig } from "nextra-theme-docs";
import Image from "next/image";

const config: DocsThemeConfig = {
  logo: (
    <span className="animate-gradientAnimation font-black inline-block text-transparent bg-clip-text bg-gradient-to-r dark:from-red-100 dark:to-amber-500 from-red-600 to-amber-500">
      Nalanda
    </span>
  ),
  docsRepositoryBase:
    "https://github.com/bangle-io/nalanda/blob/dev/documentation/pages",
  project: {
    link: "https://github.com/bangle-io/nalanda",
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
