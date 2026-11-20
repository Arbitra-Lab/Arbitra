module.exports = class HostError extends Error {
  constructor(msg, fn = HostError, code = fn.name) {
    super(`${code}: ${msg}`)

    this.code = code

    if (Error.captureStackTrace) Error.captureStackTrace(this, fn)
  }

  get name() {
    return 'HostError'
  }

  static INVALID_HOST(msg) {
    return new HostError(msg, HostError.INVALID_HOST)
  }
}
