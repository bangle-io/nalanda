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

1. **Go Local**: Clone your fork and jump into the directory:

```sh
cd nalanda
```

1. **Dependencies**: Make sure you've got `pnpm` set up. If not, check the instructions [here](https://pnpm.io/installation#using-corepack).

```sh
pnpm install
```

1. **Build**:

```sh
pnpm run build
```

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

## 📚 Documentation

For everything about Nalanda's documentation, head over to the `documentation` directory.

## 📝 Submitting Changes

### Commit conventions

We use the [Angular Commit Message Conventions](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit). Make sure to prefix your PR title (e.g., `fix`, `feat`, `docs`, `ci`, `refactor`, `build`). It helps us (and you) in understanding the gist of changes at a glance and generating changelogs.

## 🚢 Releasing to the World

> Note: this is only for maintainers.

We use [Semantic release](https://semantic-release.gitbook.io). Releasing a new version is just two steps away:

1. Push dev to the main branch:

```sh
git push origin dev:main
```

1. GitHub Actions will take over from here and publish the new version to npm.

1. For an alpha release:

```sh
git push origin dev:alpha
```

## ❓ Questions or Need Help?

- **Report Issues**: [Open an issue](https://github.com/bangle-io/nalanda/issues/new) for bugs or feature requests.
- **Join Discussions**: For broader topics, head over to [Github discussions](https://github.com/bangle-io/nalanda/discussions).
- **Chat With Us**: Prefer real-time conversations? Here's our [Discord link](https://discord.com/channels/832842880908263445/1143342344456917185).

---

Thank you for contributing to Nalanda! Together, we roar. 🚀
