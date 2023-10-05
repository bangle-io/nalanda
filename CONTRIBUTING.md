# Welcome to Nalanda's Contribution Guide! 🎉

We are thrilled that you're considering contributing to Nalanda! 🙌 Whether you're a first-time contributor or a seasoned open-source ninja, we appreciate every bit of effort you put in.

## 📜 Our Code of Conduct

Before you dive in, please take a moment to go through our [Code of Conduct](./CODE_OF_CONDUCT.md). It's essential to keep our community inclusive, supportive, and respectful.

## 🚀 Getting Started

Having trouble? We'd love to help you out!

- 🤝 Join our [Discord](https://discord.com/channels/832842880908263445/1143342344456917185) for a quick chat.

- 📚 For broader topics, head over to [Github discussions](https://github.com/bangle-io/nalanda/discussions).

### 🛠 Setting Up Your Local Environment

1. **Get the Code**: New to Github? Here's a [guide](https://docs.github.com/en/get-started/quickstart/fork-a-repo) to help you fork the repository.

2. **Go Local**: Clone your fork and jump into the the project:

```sh
git clone git@github.com:bangle-io/nalanda.git
cd nalanda
```

3. **Dependencies**: Make sure you've got `pnpm` set up. If not, check the instructions [here](https://pnpm.io/installation#using-corepack).

```sh
pnpm install
```

4. **Build**:

```sh
pnpm run build
```

## Project Structure

Nalanda project is broken into the following directory structure:

- **packages**: contains the Nalanda library packages. If you are **not** sure, more than likely, you'll be making changes here.
- **documentation**: contains the documentation website built with Next.js and MDX.
- **config**: Holds shared configurations for the entire project, including files like tsconfig.json, .eslintrc, and .prettierrc.

## 🔍 Testing Your Changes

Before submitting a PR, make sure to test your changes locally. Here's how:

- Ensure your changes don't break anything. Run the tests with:

  ```sh
  pnpm run test
  ```

- Check for lint errors with:

  ```sh
  pnpm run lint
  ```

- Add tests for new features or changes. We love tests! ❤️

## Submitting PR

1. Make sure you PR titles are prefixed with one of the following:

   - `breaking-change`: for breaking changes
   - `feat`: for new features
   - `docs`: for documentation changes
   - `fix`: for bug fixes
   - `refactor`: for code refactoring
   - `test`: for adding tests
   - `perf`: for performance improvements
   - `ci`: for CI/CD related changes
   - `build`: for build related changes

> The above convention helps us produce a changelog automatically.

1. Make sure your PRs are rebased on top of the `dev` branch.

1. When merging a PR to `dev`, make sure to squash all commits into one.

## Releasing a new version

1. ensure you are in `dev` branch and upto date with dev (`git pull origin dev`).

1. Run `pnpm -r --filter misc set-version x.y.z` to bump the version.

1. Go to github and create a new release with the tag that was created in the previous step.

1. Run `pnpm publish-alpha --otp=123456` or `publish-latest` to publish the packages to npm.

## Updating documentation site

1. After doing a release, you need to update the documentation site.

1. If you did an alpha release, you don't need to do anything else as the documentation site will automatically update.

1. If you did a latest release, you need to update the documentation site manually.

1. Ensure you are in `dev` branch and upto date with dev (`git pull origin dev`).

1. Make sure the documentation site builds locally with `pnpm run build-docs`.

1. Push changes to `main` branch.

1. This will trigger a build on netlify and the documentation site will be updated at https://nalanda.bangle.io .

## ❓ Questions or Need Help?

- **Report Issues**: [Open an issue](https://github.com/bangle-io/nalanda/issues/new) for bugs or feature requests.
- **Join Discussions**: For broader topics, head over to [Github discussions](https://github.com/bangle-io/nalanda/discussions).
- **Chat With Us**: Prefer real-time conversations? Here's our [Discord link](https://discord.com/channels/832842880908263445/1143342344456917185).

---

Thank you for contributing to Nalanda!. 🚀
