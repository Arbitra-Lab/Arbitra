# bare-host-parser

Parse and format Bare host identifiers, such as `linux-arm64-musl` or `watchos-arm64-32`.

```
npm i bare-host-parser
```

A host names a platform, an architecture, and an optional environment, joined by hyphens. An architecture may itself contain a hyphen, so a host cannot be split on hyphens to find its parts.

## Usage

```js
const { parse, format, conditions } = require('bare-host-parser')

parse('watchos-arm64-32')
// { platform: 'watchos', arch: 'arm64-32', environment: null }

format({ platform: 'ios', arch: 'universal', environment: 'simulator' })
// 'ios-universal-simulator'

conditions('linux-arm64-musl')
// ['linux', 'arm64', 'musl']
```

## License

Apache-2.0
