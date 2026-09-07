# Contributing

## Prepare a change

1. Use Node.js 22.19 or 24.
2. Run `npm ci --ignore-scripts`.
3. Make focused changes without depending on Desktop internals, external services, or user-global settings.
4. Add tests for every behavior change.
5. Run `npm run ci` and `npm run pack:check`.

## Pull requests

Explain the user-visible behavior, DSH API assumptions, safety impact, and test evidence. Do not include user settings, logs, credentials, or machine-specific paths.

The plugin targets public DSH `0.1.2-rc.1` APIs. Changes relying on unpublished Desktop `lib/*` internals will not be accepted.
