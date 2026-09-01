# Changelog

## [0.2.3](https://github.com/IDNCraft/qmon/compare/v0.2.2...v0.2.3) (2026-09-01)

### Bug Fixes

* **cli:** read version from cli package.json after root removal ([#29](https://github.com/IDNCraft/qmon/issues/29)) ([329a3ed](https://github.com/IDNCraft/qmon/commit/329a3ed3c40e1c8e23e176d185f3cae61e666430))

## [0.2.2](https://github.com/IDNCraft/qmon/compare/v0.2.1...v0.2.2) (2026-09-01)

### Bug Fixes

* **cli:** keep QuotaGrid hooks order stable when all providers hidden ([#26](https://github.com/IDNCraft/qmon/issues/26)) ([e1ea001](https://github.com/IDNCraft/qmon/commit/e1ea001be79d538ab1f4059b80fe8f259fdd6f9a))
* **cli:** repair dashboard layout overflow and hidden-provider counts ([#27](https://github.com/IDNCraft/qmon/issues/27)) ([c0f48e0](https://github.com/IDNCraft/qmon/commit/c0f48e04038c0254da0733e97903d27728ffbc5b))

### Build System

* **cli:** drop release-it automation, move release metadata into the CLI package ([#28](https://github.com/IDNCraft/qmon/issues/28)) ([4d7b9cd](https://github.com/IDNCraft/qmon/commit/4d7b9cd2fcf998ab666ffc2cdb95b780d0c93d00))

## [0.2.1](https://github.com/IDNCraft/qmon/compare/v0.2.0...v0.2.1) (2026-09-01)

### Bug Fixes

* **api:** probe OpenCode Go usage via official API endpoint ([#23](https://github.com/IDNCraft/qmon/issues/23)) ([5b67258](https://github.com/IDNCraft/qmon/commit/5b67258cae6bea73cedb940b1ee83743e0a2d829))

### Code Refactoring

* **api:** move Claude probe into dedicated file ([#24](https://github.com/IDNCraft/qmon/issues/24)) ([868776c](https://github.com/IDNCraft/qmon/commit/868776c0ee04328ae479f40f15f841060967fcd1))
* **cli:** move sidecar pid and log into qmon data dir ([#25](https://github.com/IDNCraft/qmon/issues/25)) ([bbccce5](https://github.com/IDNCraft/qmon/commit/bbccce55b785fba81512258abb6ca29439a7df88))

# [0.2.0](https://github.com/IDNCraft/qmon/compare/v0.1.0...v0.2.0) (2026-08-29)

### Bug Fixes

* **cli:** reap orphaned sidecar processes on startup ([#21](https://github.com/IDNCraft/qmon/issues/21)) ([3f5f113](https://github.com/IDNCraft/qmon/commit/3f5f1135e81974c710f91f942a64327bdc7f87cc))

### Features

* **cli:** add collapsible release notes modal with PR link stripping ([#20](https://github.com/IDNCraft/qmon/issues/20)) ([559b03b](https://github.com/IDNCraft/qmon/commit/559b03b337c2348f9ca783d82f6a692a3a4b6e51))
* **cli:** add collapsible settings sections with release notes ([#22](https://github.com/IDNCraft/qmon/issues/22)) ([d5f2341](https://github.com/IDNCraft/qmon/commit/d5f23418e3bad1d43194e442393f217a1eada646))
* **cli:** add live update flow with in-dashboard updater ([#19](https://github.com/IDNCraft/qmon/issues/19)) ([8f91d84](https://github.com/IDNCraft/qmon/commit/8f91d846b832764ff3b644a945626f98626b4c75))

# [0.1.0](https://github.com/IDNCraft/qmon/compare/v0.0.6...v0.1.0) (2026-08-28)

### Features

* **cli:** add version and update commands ([#18](https://github.com/IDNCraft/qmon/issues/18)) ([14e25d7](https://github.com/IDNCraft/qmon/commit/14e25d7e06367cbb5872cf262de788f33485521e))

### Code Refactoring

* **tui:** make TUI layout responsive and stack login security card ([#16](https://github.com/IDNCraft/qmon/issues/16)) ([d779457](https://github.com/IDNCraft/qmon/commit/d77945712d175c34165fb21d81220318e837e4bd))

## [0.0.6](https://github.com/IDNCraft/qmon/compare/v0.0.5...v0.0.6) (2026-08-28)

### Features

* **install:** add spinners and update Android build plugins ([#15](https://github.com/IDNCraft/qmon/issues/15)) ([6c9f86a](https://github.com/IDNCraft/qmon/commit/6c9f86a0aebd45b7dc4e04ad68748ef8f92897f7))

## [0.0.5](https://github.com/IDNCraft/qmon/compare/v0.0.4...v0.0.5) (2026-08-28)

### Build System

* **android:** bump gradle wrapper to 8.14 ([#14](https://github.com/IDNCraft/qmon/issues/14)) ([17ae55b](https://github.com/IDNCraft/qmon/commit/17ae55b0a1ae64db3f6b8438f9346b0a7f46765b))

## [0.0.4](https://github.com/IDNCraft/qmon/compare/v0.0.3...v0.0.4) (2026-08-28)

### Build System

* **android:** configure release signing for production builds ([#13](https://github.com/IDNCraft/qmon/issues/13)) ([51afaaf](https://github.com/IDNCraft/qmon/commit/51afaafcbf26dfa72e99bad8c39089b4d4f234c9))

## [0.0.3](https://github.com/IDNCraft/qmon/compare/v0.0.2...v0.0.3) (2026-08-28)

### Bug Fixes

* **mobile:** modernize Flutter color and lifecycle APIs ([#11](https://github.com/IDNCraft/qmon/issues/11)) ([f7102f5](https://github.com/IDNCraft/qmon/commit/f7102f581730ee6af312f5236f2247269d6cd12b))

### Code Refactoring

* standardize application name to "Qmon" across mobile and backend components ([#12](https://github.com/IDNCraft/qmon/issues/12)) ([91d70e2](https://github.com/IDNCraft/qmon/commit/91d70e2e0c988e3f0b19d28ea56f67b224b623c4))

## [0.0.2](https://github.com/IDNCraft/qmon/compare/v0.0.1...v0.0.2) (2026-08-27)

### Bug Fixes

* **mobile:** handle login background load failures ([#10](https://github.com/IDNCraft/qmon/issues/10)) ([d73b02b](https://github.com/IDNCraft/qmon/commit/d73b02bdcc86502921377e3c62c66e6afa38356c))

## 0.0.1 (2026-08-27)

### Bug Fixes

* **cli:** cap dashboard width on wide terminals ([#1](https://github.com/IDNCraft/qmon/issues/1)) ([1e2b83c](https://github.com/IDNCraft/qmon/commit/1e2b83c4bcf5062644395445835dfd0ff90d5669))

### Features

* add mobile development support and enhance API service ([#5](https://github.com/IDNCraft/qmon/issues/5)) ([57c83df](https://github.com/IDNCraft/qmon/commit/57c83df9757767f24b1e66b92656b06b9cad370c))
* initial commit ([508147c](https://github.com/IDNCraft/qmon/commit/508147c13ef0e81b2488c65a07460ac84aa96a35))

### Code Refactoring

* improve provider sorting logic and update images in README ([#8](https://github.com/IDNCraft/qmon/issues/8)) ([4cddb9b](https://github.com/IDNCraft/qmon/commit/4cddb9bdcad164e2ec90f7499bc0a787796065ef))
* **quota:** update quota type to '5h' and adjust related logic ([#4](https://github.com/IDNCraft/qmon/issues/4)) ([200a29d](https://github.com/IDNCraft/qmon/commit/200a29d1a9c7db94a51a42fa8587729270a2564a))

### Continuous Integration

* **mobile:** publish release APKs ([#6](https://github.com/IDNCraft/qmon/issues/6)) ([67ee41f](https://github.com/IDNCraft/qmon/commit/67ee41f537e8c9511f489685ad43764256017cb8))
