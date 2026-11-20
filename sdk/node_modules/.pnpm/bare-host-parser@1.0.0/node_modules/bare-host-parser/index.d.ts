type Platform = 'android' | 'darwin' | 'freertos' | 'ios' | 'linux' | 'wasi' | 'watchos' | 'win32'

type Architecture =
  | 'arm'
  | 'arm64'
  | 'arm64-32'
  | 'armv8m'
  | 'ia32'
  | 'mips'
  | 'mipsel'
  | 'riscv32'
  | 'riscv64'
  | 'universal'
  | 'wasm32'
  | 'x64'

type Environment = 'musl' | 'muslsf' | 'simulator'

/** The parts of a host, such as `ios-arm64-simulator`. */
interface Host {
  platform: Platform
  arch: Architecture
  environment: Environment | null
}

/** The platforms a host may name. */
export const platforms: Platform[]

/** The architectures a host may name. */
export const architectures: Architecture[]

/** The environments a host may name. */
export const environments: Environment[]

/**
 * Split a host into its platform, architecture, and environment.
 * @param host - The host to parse, such as `watchos-arm64-32`.
 * @throws {HostError} If `host` names an unknown platform, architecture, or environment.
 */
export function parse(host: string): Host

/**
 * Join the parts of a host into the host they name.
 * @param host - The parts to join. `environment` defaults to `null`.
 * @throws {HostError} If a part is unknown.
 */
export function format(
  host: Omit<Host, 'environment'> & { environment?: Environment | null }
): string

/**
 * Return the resolution conditions of a host, which are its parts in order. A
 * host that isn't known is split on hyphens instead.
 * @param host - The host to return the conditions of.
 */
export function conditions(host: string): string[]

export type { Platform, Architecture, Environment, Host }
