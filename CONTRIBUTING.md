# CONTRIBUTING to Nalanda

Thank you ❤️ for considering contributing to Nalanda. Below are some guidelines to help you along the way.

## Code of Conduct

We have adopted a code of conduct that we expect project participants to adhere to. Please read the [Code of Conduct](./CODE_OF_CONDUCT.md) before contributing.

## Getting Started

> 💡 If you are stuck, we are more than happy to help over discord. Please join [here](https://discord.com/channels/832842880908263445/1143342344456917185).

### Setting up local environment

1. **Fork/clone**: If you are new to Github, read [this](https://docs.github.com/en/get-started/quickstart/fork-a-repo) to learn how to fork a repository.

1. **Clone** your fork locally ad navigate to the directory.

```sh
cd nalanda
```

1. **Install** the dependencies using pnpm. Read instructions [here](https://pnpm.io/installation#using-corepack) to enable pnpm in your local machine.

```sh
pnpm install
```

1. After making changes, you can **build** the library using:

```sh
pnpm run build
```

## Documentation

Documentation lives in the `documentation` directory.

## Testing

Before submitting any changes, ensure that:

All existing tests pass.

```sh
pnpm run test
```

There are no lint errors.

```sh
pnpm run lint
```

New features or changes include corresponding tests.

## Questions?

If you have any questions, feel free to [open an issue](https://github.com/<repository-owner>/nalanda/issues/new) or reach out to the maintainers. Your feedback and contributions are valuable to us!

---

Thank you for helping us improve Nalanda! 🚀
