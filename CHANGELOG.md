# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [2.0.2] - 2026-10-26

### Fixed

- The operating system of a computer can now be chosen in the "Add a
  computer" and "Edit a computer" forms: the Windows / Linux radio buttons of
  both forms shared one group in Gladys and could not be checked. It is now a
  drop-down list.

## [2.0.1] - 2026-10-19

### Fixed

- A user name containing a space (a Windows local account such as
  "Jean Dupont") or a domain ("OFFICE\jean") is now accepted.

### Security

- The Docker image installs exactly the locked dependencies, with no fallback
  to an unlocked install.

## [2.0.0] - 2026-10-19

### Added

- Shut down Windows and Linux computers over SSH: one Gladys device with a
  "Shut down" push button per computer.
- Manage several computers from the Configuration screen: add, edit and test
  a computer, show the integration's public key.
- Authentication with the integration's own ed25519 key, or a password.
- Host key pinning on the first successful connection.
- "Shut down a computer" scene action, with a `success` output.
- "Shutdown PC" dashboard widget: reachability status and a shutdown button
  that asks for confirmation.
- User documentation in French and English.

[Unreleased]: https://github.com/LuckyS7evin/gladys-shutdown-pc/compare/v2.0.2...HEAD
[2.0.2]: https://github.com/LuckyS7evin/gladys-shutdown-pc/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/LuckyS7evin/gladys-shutdown-pc/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/LuckyS7evin/gladys-shutdown-pc/releases/tag/v2.0.0
