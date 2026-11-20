const errors = require('./lib/errors')

const platforms = (exports.platforms = [
  'android',
  'darwin',
  'freertos',
  'ios',
  'linux',
  'wasi',
  'watchos',
  'win32'
])

const architectures = (exports.architectures = [
  'arm',
  'arm64',
  'arm64-32',
  'armv8m',
  'ia32',
  'mips',
  'mipsel',
  'riscv32',
  'riscv64',
  'universal',
  'wasm32',
  'x64'
])

const environments = (exports.environments = ['musl', 'muslsf', 'simulator'])

function match(host) {
  if (typeof host !== 'string') return null

  const i = host.indexOf('-')

  if (i === -1) return null

  const platform = host.slice(0, i)
  const rest = host.slice(i + 1)

  if (!platforms.includes(platform)) return null

  for (const arch of architectures) {
    if (rest === arch) return { platform, arch, environment: null }

    if (rest.startsWith(arch + '-')) {
      const environment = rest.slice(arch.length + 1)

      if (environments.includes(environment)) return { platform, arch, environment }
    }
  }

  return null
}

exports.parse = function parse(host) {
  const parts = match(host)

  if (parts === null) throw errors.INVALID_HOST(`Host '${host}' is not valid`)

  return parts
}

exports.format = function format({ platform, arch, environment = null }) {
  if (
    !platforms.includes(platform) ||
    !architectures.includes(arch) ||
    (environment !== null && !environments.includes(environment))
  ) {
    throw errors.INVALID_HOST(
      `Host with platform '${platform}', architecture '${arch}', and environment '${environment}' is not valid`
    )
  }

  let host = platform + '-' + arch

  if (environment !== null) host += '-' + environment

  return host
}

// Hosts that aren't known are split on hyphens, so that custom hosts resolve.
exports.conditions = function conditions(host) {
  const parts = match(host)

  if (parts === null) return host.split('-')

  const { platform, arch, environment } = parts

  return environment === null ? [platform, arch] : [platform, arch, environment]
}
