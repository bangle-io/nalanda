module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  clearMocks: true,
};
