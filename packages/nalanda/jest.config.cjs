module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  clearMocks: true,
  setupFiles: ['<rootDir>/jest.setup.js'],
};
