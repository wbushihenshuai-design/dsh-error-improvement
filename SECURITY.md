# Security policy

## Supported version

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not include real credentials, private lesson content, or user settings in a public issue.

## Security boundaries

This plugin stores data only through the DSH settings provider. It must not access the network, filesystem, child processes, Desktop browser-access settings, permission presets, or approval policy. Confirmed lesson text is still user-authored prompt content; confirmation, fencing, encoding, and size limits reduce accidental misuse but do not convert text into a hard security control.
