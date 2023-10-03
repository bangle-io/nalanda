// eslint-disable-next-line no-undef
globalThis.requestIdleCallback = function (cb) {
  const start = Date.now();
  // eslint-disable-next-line no-undef
  return setTimeout(function () {
    cb({
      didTimeout: false,
      timeRemaining: function () {
        return Math.max(0, 50 - (Date.now() - start));
      },
    });
  }, 1);
};
