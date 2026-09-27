# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [Unreleased]

### Bug Fixes

- **extension**: Support firefox background scripts and clarify youtube detection ([8addeb1](https://github.com/ilanzgx/multistream/commit/8addeb1f18650b605c69acbc7b99334bffd5bf87))
- **sidebar**: Prevent twitch auth race and unblock skeleton for fast platforms ([bf03b87](https://github.com/ilanzgx/multistream/commit/bf03b87c757cfd33655b25b67a63f9b8ced6025b))
- **live-status**: Implement single flight checkAll with progressive youtube updates ([9adb729](https://github.com/ilanzgx/multistream/commit/9adb7292670903c1ca228cffd958f76def26e5e6))


### Documentation

- Add system architecture map and update operational guides ([ba70318](https://github.com/ilanzgx/multistream/commit/ba70318b93e4fca928b04354bb72c539f8256e86))


### Features

- **deeplink**: Support accumulating streams via multistream://add ([044efbc](https://github.com/ilanzgx/multistream/commit/044efbca1a9e7c73d1cdf46c813c255de7229179))
- **extension**: Add browser extension for stream capture ([3d3e8c0](https://github.com/ilanzgx/multistream/commit/3d3e8c06c20bfd741e1b5fb0c3fa65607fff762b))
- **website**: Add app preview hero layout and update copy with youtube ([00c1b84](https://github.com/ilanzgx/multistream/commit/00c1b848fa8ba3acedfd85bf9c8033e099636c26))


### Performance

- **youtube**: Increase scrape semaphore and cache offline fallbacks ([6e259df](https://github.com/ilanzgx/multistream/commit/6e259df4082b3f7006a374403d04eef22976a765))


### Refactoring

- **streams**: Unify custom stream naming with createCustomStreamName ([eb0be0b](https://github.com/ilanzgx/multistream/commit/eb0be0b0eea02a2c1f97c8f8f4264309922a9f01))


### Style

- **website**: Align header and hero containers with main page grid ([6a7bd6a](https://github.com/ilanzgx/multistream/commit/6a7bd6a4e939fc05c84d6e15101bda4897f57af3))

## [0.19.0] - 2026-09-19

### Bug Fixes

- **recording**: Filter active recordings from orphan scan and cut audio on close ([f8cd3c2](https://github.com/ilanzgx/multistream/commit/f8cd3c2a33a686c3d124ed7f5fd77df6581f582c))
- **recording**: Prevent duplicate shutdown and ensure remuxing entries finalize ([1f42832](https://github.com/ilanzgx/multistream/commit/1f42832e32698ac5668d4d7db6980f57c5fb1374))
- **youtube**: Prevent spurious live notifications on transient network errors ([dff279c](https://github.com/ilanzgx/multistream/commit/dff279c09f0e2a9574044747bc5872989a76603c))
- **ui**: Prevent sidebar skeleton flicker when favoriting channels ([d152401](https://github.com/ilanzgx/multistream/commit/d15240170d89db72ebdb36fa35aa2cb734df956e))
- **recents**: Preserve handle and display name in recent streams ([7be093c](https://github.com/ilanzgx/multistream/commit/7be093cea155b4e16e0b4ced20821d364f3c14f4))
- **desktop**: Preserve canonical handles in notifications and sharing ([0f6fd2f](https://github.com/ilanzgx/multistream/commit/0f6fd2f2d121cd485551e0bbd4b84a6d2a270b33))
- **ui**: Use display name in close stream toast and notification titles ([b90a6db](https://github.com/ilanzgx/multistream/commit/b90a6dbaf32be1ff411380870da8e42cd2feb3c9))
- **favorites**: Support custom stream favorites and dual backup compatibility (#39) ([6311058](https://github.com/ilanzgx/multistream/commit/63110588e469810852b44ba8300f2cd6ecc17db5))
- **notifications**: Prevent false online youtube alerts and resolve channel names in ui ([1fe71f0](https://github.com/ilanzgx/multistream/commit/1fe71f04262d4f0f604b99993c12c0a89244ff40))
- **youtube**: Stabilize live stream detection and drop flaky push alerts ([8c0d92e](https://github.com/ilanzgx/multistream/commit/8c0d92ea5bfd1d92d690395583930488ad1b0b13))
- **youtube**: Fix live detection, concurrent viewers and channel avatar ([3071341](https://github.com/ilanzgx/multistream/commit/3071341877f7958b297116a0b366dec43c6f7b2b))
- **youtube**: Harden live detection against vods and stabilize status ([b873e4d](https://github.com/ilanzgx/multistream/commit/b873e4df42281c519611b7400e841c80f6c8b3dc))
- **youtube**: Improve live detection resilience and multi-stream scraping ([4a07736](https://github.com/ilanzgx/multistream/commit/4a077364722647a41fed95089696122542b17274))
- **youtube**: Address clippy warnings in api ([9c5513f](https://github.com/ilanzgx/multistream/commit/9c5513f87e59386bd674ab9effac4a9a58a1ba0f))
- **youtube**: Optimize concurrent multi-stream scraping and add global rate limiting ([150d334](https://github.com/ilanzgx/multistream/commit/150d3348010600479cc6afc0e05c97142a3c1bc0))
- **import**: Preserve distinct video ids and resolve metadata during stream import ([8c7253f](https://github.com/ilanzgx/multistream/commit/8c7253fb5a280a8b4eac4118cca5dfd254ab80ff))
- **stream**: Improve live stream resolution, favorite matching, and sidebar listing ([3be7085](https://github.com/ilanzgx/multistream/commit/3be7085a7b3dfa20bb9ecbb2c0a0037bd51e96fe))
- **website**: Allow handles and dots in share url sanitization ([287ff98](https://github.com/ilanzgx/multistream/commit/287ff9841143e8800ca888fed7cdf0ebfc81a1f7))


### Documentation

- **youtube**: Update src-tauri backend readme with channel discovery architecture ([66737fc](https://github.com/ilanzgx/multistream/commit/66737fc1c70eb1ef1cdab97384a4ff8701a61e77))
- Update architecture documentation and project guidelines ([8e5374e](https://github.com/ilanzgx/multistream/commit/8e5374ebd2a8fcb48ff728e0b89a1d9b69501ab2))
- **youtube**: Update scraping pipeline, rate limiting, and caching architecture ([03ca45d](https://github.com/ilanzgx/multistream/commit/03ca45dfc250c54f0721b073640d623508a074ef))


### Features

- **youtube**: Extract canonical handles and live viewer counts ([6c76675](https://github.com/ilanzgx/multistream/commit/6c7667530aaabeb64aa8337e24c9edc5f1f23e85))
- **youtube**: Implement native channel search engine ([de86646](https://github.com/ilanzgx/multistream/commit/de8664676a88687dd3cdfa32e67d9f0af4d49cf1))
- **youtube**: Resolve and sanitize channel handles across ui ([38337b9](https://github.com/ilanzgx/multistream/commit/38337b9414f4b1ce5ba8db0f8ed798966631ae91))
- **search**: Add channel autocomplete and quick suggestions ([618a44a](https://github.com/ilanzgx/multistream/commit/618a44a8c4e2cb0e9df3a49b12a47da0859118d1))
- **i18n**: Add translations for channel resolution and offline states ([4b79142](https://github.com/ilanzgx/multistream/commit/4b791421ad6efcccdc154000391088a2b1694947))
- **youtube**: Preserve channel handles in sharing and stream resolution ([c2e6172](https://github.com/ilanzgx/multistream/commit/c2e6172ca56ac707779ab5380bbdeff327479aa0))
- **youtube**: Support multiple concurrent live streams per channel ([72d5c61](https://github.com/ilanzgx/multistream/commit/72d5c610126f4285e3893160dcc8d7f7aa4dbcb2))
- **share**: Preserve exact live broadcast video ids in shared urls ([776cafe](https://github.com/ilanzgx/multistream/commit/776cafe14edf9b7304e301d5eff7ca3f97355ec6))


### Performance

- **live**: Reduce refresh cpu overhead via youtube fast-path and polling deduplication ([7c994f4](https://github.com/ilanzgx/multistream/commit/7c994f40e3705cdb7593fd0cf4d351e95529c0cb))


### Style

- **stream**: Display channel avatar in skeleton for twitch, kick, and youtube ([c7486fe](https://github.com/ilanzgx/multistream/commit/c7486fe3f9aca28282dd5c9088d305dcdcfc55b4))

## [0.18.19] - 2026-09-11

### Bug Fixes

- **chat**: Correct emote insertion position and prevent text erasure ([5ae7c8a](https://github.com/ilanzgx/multistream/commit/5ae7c8a751f9052e647863dccb8098a13904ac76))
- **chat**: Refine plain text extraction, selection containment, and emote fallback ([ea16e4a](https://github.com/ilanzgx/multistream/commit/ea16e4aea30a825202415c86523df4c4d73d3298))
- **backend**: Register global panic hook to capture unhandled panics in logs ([10e7416](https://github.com/ilanzgx/multistream/commit/10e74169870a9c0349269874656c14726aaa19e1))
- **transcriber**: Use atomic download to prevent corrupted whisper models ([703a048](https://github.com/ilanzgx/multistream/commit/703a04879448683ebee9d4bf2161772f1e368a75))
- **recording**: Add 30-min timeout and explicit kill to ffmpeg remux ([f8cca8e](https://github.com/ilanzgx/multistream/commit/f8cca8e8e922bd932dec067287b86eaa6c6fbb38))
- **backend**: Use RAII guard for whisper download and chain default panic hook ([71cdafc](https://github.com/ilanzgx/multistream/commit/71cdafc17064e704e1d36b2a19a1a5fd249a9c2b))


### Documentation

- Add status badges and authentication section ([254bc97](https://github.com/ilanzgx/multistream/commit/254bc9787c736891f5cfd70e28bcf66ec4ea6c50))


### Style

- **ui**: Improve settings dialog tabs alignment and distribution ([421f35d](https://github.com/ilanzgx/multistream/commit/421f35d6b7eadc9ebb93efab512f55b510add3f3))

## [0.18.18] - 2026-09-05

### Bug Fixes

- **twitch**: Eliminate refresh token race condition causing daily session loss ([294ca9f](https://github.com/ilanzgx/multistream/commit/294ca9f7fbc983b95d7d8b82a86a6343ae0287ff))
- **twitch**: Decouple oauth client id from gql playback token endpoint ([9b2106e](https://github.com/ilanzgx/multistream/commit/9b2106e0d64710356d749c81feaca8e2f8683e6a))
- **stream**: Trigger skeleton transition on adblock toggle ([215c2fc](https://github.com/ilanzgx/multistream/commit/215c2fc244d072e0c380256cc0734ba40b070dc7))
- **live-status**: Prevent spurious notifications via debounced offline tracking ([a4e1c16](https://github.com/ilanzgx/multistream/commit/a4e1c164d9c323c4096f7c3b2f3edc6f87d422e2))


### Features

- Consolidate transparent twitch and youtube stream filter ([c55df5a](https://github.com/ilanzgx/multistream/commit/c55df5a2283c6ab9ef147859eb34a87c1e88f522))
- **ui**: Add minimalist about tab in settings dialog ([7f14fe6](https://github.com/ilanzgx/multistream/commit/7f14fe62fee88836ffa2cd28539c56e33300c1af))
- **suggestions**: Add 5-minute auto-refresh and manual refresh button ([3750213](https://github.com/ilanzgx/multistream/commit/375021312dd77b9f3d8f4830ba1ec2a7864df141))
- **i18n**: Harden cli, use native bun apis, add vitest tests and documentation ([568c89a](https://github.com/ilanzgx/multistream/commit/568c89a873f234d59ba944146825b61bb6935e0e))


### Refactoring

- **ui**: Redesign onboarding tour dialog ([b83ce55](https://github.com/ilanzgx/multistream/commit/b83ce55ce28245fb4e4f6715a7f30e7812a4575a))

## [0.18.17] - 2026-09-01

### Bug Fixes

- **website**: Configure sitemap i18n and optimize pre-push hook ([1f81320](https://github.com/ilanzgx/multistream/commit/1f8132070d259a24f62fb081a9bbcf2a25161c00))
- **core**: Harden twitch polling, sync sidebar skeleton, bulletproof notifications ([a607546](https://github.com/ilanzgx/multistream/commit/a607546ff736ac628dc989ec930bdcdd1f95cc68))
- **i18n**: Localize hardcoded strings across chat, streams, and dialogs ([a97d213](https://github.com/ilanzgx/multistream/commit/a97d21390b60fa85149462c528cf91f2f8088302))
- Resolve critical logic, reactivity, and encoding bugs across components ([24d7801](https://github.com/ilanzgx/multistream/commit/24d7801b6e7585a0ae2dc5552d3ac24270c22a3f))
- **a11y**: Improve wcag compliance with aria-labels, titles, and keyboard navigation ([3cf65b7](https://github.com/ilanzgx/multistream/commit/3cf65b7db2f9774f08c3eb8582ea707377aa5a5f))
- **ui**: Localize and center stream diagnostics title ([e4ae71f](https://github.com/ilanzgx/multistream/commit/e4ae71f5c046360f940c4257aa186e0f7f0a64ed))
- **twitch**: Renew token proactively and on irc auth failure ([6f13242](https://github.com/ilanzgx/multistream/commit/6f132420dc470c751e07f0c239992055b009ad01))
- **twitch**: Resolve critical edge cases in network and auth state ([95e01ee](https://github.com/ilanzgx/multistream/commit/95e01ee09dbac9eb0683403ed2517458f51af650))
- **twitch**: Robust oauth persistence and device polling ([9999213](https://github.com/ilanzgx/multistream/commit/999921384492d1e21975a38c64a0680ed13b3689))
- **suggestions**: Defer dialog open watcher and support chinese viewer count ([df0c8ad](https://github.com/ilanzgx/multistream/commit/df0c8ad7f6c479838431a32867ff009ff11eeb99))


### Documentation

- **skills**: Update adding-language guide with youtube locale and parser steps ([96c66aa](https://github.com/ilanzgx/multistream/commit/96c66aaab54b2a17c6d703b8dc41afe338ad5e48))


### Features

- **chat**: Search all sections in emote picker ([80b6de2](https://github.com/ilanzgx/multistream/commit/80b6de23e838fa9edb17c52fb11fd492f43c7ff6))
- **youtube**: Add trending live stream suggestions pipeline ([13671eb](https://github.com/ilanzgx/multistream/commit/13671ebb4ee21522ae20b15f45ba1a1db2c6db2f))
- **i18n**: Add translations for add dialog suggested streams and empty states ([868fec8](https://github.com/ilanzgx/multistream/commit/868fec836115baa959e407adca4c5e757c350284))
- **ui**: Integrate responsive suggested streams into add dialog ([3cabd37](https://github.com/ilanzgx/multistream/commit/3cabd37d42b243898068ba8de21965bc5a8eef0b))


### Performance

- **chat**: Batch kick messages and fix native chat listener leaks ([6076df2](https://github.com/ilanzgx/multistream/commit/6076df2a032ef10b3dbcf28c5f68c55575ef0299))
- **emote**: Remove emote drop shadow and cache message tokenization ([9bd2a50](https://github.com/ilanzgx/multistream/commit/9bd2a5040ef97236ab3faf27d5a0588bfd57da06))
- **screenshot**: Use binary bytes instead of base64 over ipc ([b4c77a1](https://github.com/ilanzgx/multistream/commit/b4c77a13266c3b74039dbdb7de855f5f47cc0275))


### Refactoring

- **ui**: Redesign add dialog and stream chips ([39bf87d](https://github.com/ilanzgx/multistream/commit/39bf87dd67e38ae2c4f018661f2d6bdd16c7c14d))

## [0.18.16] - 2026-08-24

### Bug Fixes

- **player**: Implement auto-recovery watchdog and fix async race conditions ([36b75ef](https://github.com/ilanzgx/multistream/commit/36b75ef4127821fab65592be5b9ac9a22bce372c))
- **ui**: Prevent sidebar state wipe on network failure and fix stale thumbnails ([de5342d](https://github.com/ilanzgx/multistream/commit/de5342dc69774876580f7c056f464cf673e0cd6f))


### Documentation

- Update readme, add contributing and security guidelines ([69f9526](https://github.com/ilanzgx/multistream/commit/69f9526e595889b02a0625a8c2b0c02f6f472f4f))


### Features

- **backup**: Implement additive restore and refactor I/O strategies ([4d59168](https://github.com/ilanzgx/multistream/commit/4d591683739596aa534e1b7c2985ed9e4c3947f5))
- **ui**: Implement custom native toast notification system ([0aea7b8](https://github.com/ilanzgx/multistream/commit/0aea7b8d0b3c7b0f544acee4e5a981d5d73c0700))
- **notifications**: Refine welcome toast positioning and restore os alerts ([1fa0519](https://github.com/ilanzgx/multistream/commit/1fa0519c419afa16944b4b973549ac0715efb322))
- **screenshot**: Add thumbnail preview and open folder action ([3b3cecb](https://github.com/ilanzgx/multistream/commit/3b3cecbe3511af56787f11e8e39ef1d0554a9d93))


### Performance

- **ui**: Eliminate skeleton loader cpu spikes and visual artifacts ([c9031d8](https://github.com/ilanzgx/multistream/commit/c9031d8e69859a951c8919ec81ed6bd0aada9e96))


### Refactoring

- **ui**: Purge vue-sonner from components and package.json ([51bf710](https://github.com/ilanzgx/multistream/commit/51bf7101ecbbc7d5ca005bb69a5673db8dc3115f))

## [0.18.15] - 2026-08-19

### Bug Fixes

- **recording**: Guard zip imports on linux to fix CI unused warnings ([7a7b60a](https://github.com/ilanzgx/multistream/commit/7a7b60ae857b7da68ad551601c1890e74266b282))
- **recording**: Remove obsolete recordingEnabled state and optimize CI pipelines ([742a3f0](https://github.com/ilanzgx/multistream/commit/742a3f00dd6757d7bd500f3b5e06b241bc020fd8))
- **recording**: Prevent Streamlink orphans and fix remuxing on Linux ([fe950b3](https://github.com/ilanzgx/multistream/commit/fe950b3f6d98ce88593a1b57b72eed7f0a3d63c8))
- **recording**: Add tokio::time::sleep to prevent remux race condition on Linux ([74c54f7](https://github.com/ilanzgx/multistream/commit/74c54f7a900275995693d43874172b03741b7d80))
- **chat**: Make unified chat skeleton icons match active platforms ([84b3364](https://github.com/ilanzgx/multistream/commit/84b3364d978a210d82fc89668194393802bebd47))
- **sidebar**: Prevent polling flicker and synchronize sidebar state with preferences ([ca87fb7](https://github.com/ilanzgx/multistream/commit/ca87fb7b9355b82e4e928fb07cd15410a144bfb1))
- **sidebar**: Add centered empty state with i18n and radio icon ([ed96634](https://github.com/ilanzgx/multistream/commit/ed96634d277004af66c4c0212be148afa298f3cc))
- **transcription**: Resolve closure traps and state loss on unmount ([b0c8ae5](https://github.com/ilanzgx/multistream/commit/b0c8ae5ba2577d06054ae2567ed6ed89f7517b1d))
- **chat**: Resolve connection drops and zombie listeners ([7e574c6](https://github.com/ilanzgx/multistream/commit/7e574c679734f7a769abfec28bef8cf798c6b117))
- **streams**: Prevent orphaned background recordings on clear ([9c6c5da](https://github.com/ilanzgx/multistream/commit/9c6c5da7194560ea9e65819d3982a5d4e504252b))
- **auth**: Resolve ipc cancellation leaks and race conditions in dialogs ([a9f7434](https://github.com/ilanzgx/multistream/commit/a9f7434d396ad9356064a548e16c75e7e72eb51d))
- **core**: Resolve async race conditions and gateway edge cases ([d91d70a](https://github.com/ilanzgx/multistream/commit/d91d70a2a3f9e8a0a1f4437e8a55c2fd6b476a37))


### Documentation

- **agents**: Add critical edge case analysis skill and update agents guide ([a617b8c](https://github.com/ilanzgx/multistream/commit/a617b8c86411a33e7b354abdb4552d3be472c3df))


### Features

- **website**: Update brand logo, coffee svg, and favicon assets ([a152cd5](https://github.com/ilanzgx/multistream/commit/a152cd527afd71d90bd4ad3884b94d53397b32a1))
- **website**: Enhance seo json-ld, i18n titles, and dialog a11y ([db382ab](https://github.com/ilanzgx/multistream/commit/db382ab7af5e7e2ce39d80e81610c2b69d6c02ed))
- **website**: Centralize github api fetching and add dev cache ([cde4e2f](https://github.com/ilanzgx/multistream/commit/cde4e2f0e81878cb853ddda5a372f2428963d053))
- **recording**: Expand platform support and make streamlink args platform-aware ([bd7b33a](https://github.com/ilanzgx/multistream/commit/bd7b33a403e98350a85b2ff1fd532857beb41971))
- **recording**: Add linux and macos install pipelines ([effac25](https://github.com/ilanzgx/multistream/commit/effac25525c603d02cad0964372faaf1a5a9a1b9))
- **recording**: Add unix process group management for clean shutdown ([601d997](https://github.com/ilanzgx/multistream/commit/601d99733cb6c8d41f5b87c74f52028e28a440a0))
- **auth**: Add personalized success toasts and update i18n keys ([6f2353b](https://github.com/ilanzgx/multistream/commit/6f2353b44b54edaa17459f9c3783ce42748b1778))


### Refactoring

- **config**: Centralize platform urls, cdn templates and external links ([02e6df6](https://github.com/ilanzgx/multistream/commit/02e6df66cf65f204abe832f102c15e8a4291612f))
- **ui**: Consume centralized config across components and composables ([148fa3e](https://github.com/ilanzgx/multistream/commit/148fa3e13cbdf272836b3765ee50f0f1f9809984))
- **recording**: Use non-blocking sleep for unix shutdown and gate linux installer to x86_64 ([7c7ec31](https://github.com/ilanzgx/multistream/commit/7c7ec313179f8c0c558a59f072a4d48cd238385d))
- **recording**: Remove legacy os restrictions from UI and update docs ([b028372](https://github.com/ilanzgx/multistream/commit/b02837202f94549297b70105109d3155bd69aa0d))


### Build

- **linux**: Add gstreamer media dependencies for debian deb builds ([d7b481e](https://github.com/ilanzgx/multistream/commit/d7b481ee8ff6c7ad92d80af5991d0657a24a2bbe))

## [0.18.14] - 2026-08-13

### Features

- **ui**: Update app icons and logo graphics ([b006e27](https://github.com/ilanzgx/multistream/commit/b006e27c6e2f2b98792205558310d39ce7e2f1f4))
- **ui**: Implement native tauri 2 splashscreen architecture ([a443835](https://github.com/ilanzgx/multistream/commit/a443835a888918642ac7298e554cb328d76424ba))

## [0.18.13] - 2026-08-10

### Bug Fixes

- Resolve i18n translations, test isolation, vite plugin and git hooks ([543cb6a](https://github.com/ilanzgx/multistream/commit/543cb6a50d01afcabbc90b5cefc39757049b8fa2))


### Documentation

- Update README.md (#25) ([8d4e9cb](https://github.com/ilanzgx/multistream/commit/8d4e9cbd616662d961bbf6402e118dedcca9176c))


### Features

- **ui**: Add new flag icons for fr, tr, hi, and id ([aa417ef](https://github.com/ilanzgx/multistream/commit/aa417efe7d9206311b3b8d2ad6aa6465ebb1b5d3))
- **i18n**: Add french, turkish, hindi, and indonesian translations ([718a0bb](https://github.com/ilanzgx/multistream/commit/718a0bbc358916c9d58ddd64930c4954ca813ce3))
- **ui**: Refine settings dialog layout, spacing, and gestalt grouping ([43b2949](https://github.com/ilanzgx/multistream/commit/43b294950f6930fda1d40d7e13620c08b27f21ad))
- **recording**: Improve remux logic and ipc progress events ([a55970f](https://github.com/ilanzgx/multistream/commit/a55970f09f41ad733c7cf54a2f26f70fc6c8563f))


### Refactoring

- **recording**: Integrate custom toasts and fix stacking bugs ([59c1cbe](https://github.com/ilanzgx/multistream/commit/59c1cbe606b6994dbeec81bf813c0e6ae3e6c08a))


### Style

- **recording**: Add custom toast components for remux progress ([c46c8b0](https://github.com/ilanzgx/multistream/commit/c46c8b0003cfc9eba98ae4fbf9c389ae6a9beb03))

## [0.18.12] - 2026-08-08

### Bug Fixes

- Resolve eslint no-var error and playwright CI execution ([1f37e42](https://github.com/ilanzgx/multistream/commit/1f37e4268164beaf01848adbc365ff1efc0d5b5e))
- Update lighthouserc staticDistDir for monorepo structure ([25e18fb](https://github.com/ilanzgx/multistream/commit/25e18fb5306d801cc1b310f6d4f98014d3631a23))
- Bundle GStreamer plugins in AppImage so media playback works on non-Debian distros ([2e6c0c8](https://github.com/ilanzgx/multistream/commit/2e6c0c8b392c40c825c6674d95ef1d520ee8698c))
- **recording**: Remove unused assignment of total_size in installer ([372cfcc](https://github.com/ilanzgx/multistream/commit/372cfcc8a0ea814d028e2745b393152ae2c4d2d4))


### Documentation

- Introduce local AI agent skills and comprehensive AGENTS.md documentation ([ac9f8ba](https://github.com/ilanzgx/multistream/commit/ac9f8ba291436ae672c8dcc1bf7e593319344f96))


### Features

- **ui**: Add confirmation dialog for recorder uninstallation and sync translations ([2b993fa](https://github.com/ilanzgx/multistream/commit/2b993fa9c0dfe7fa50b08a38865c7f5c0fbdc19a))
- **recording**: Add uninstall feature and fix python version to prevent hash mismatch ([818230a](https://github.com/ilanzgx/multistream/commit/818230afce01f5ab344ba9e4a878e5490c528292))


### Refactoring

- Migrate project to bun workspaces monorepo architecture ([0dd9687](https://github.com/ilanzgx/multistream/commit/0dd9687e2d26e95ff3dedb5391f5fd03a2340492))

## [0.18.11] - 2026-08-01

### Bug Fixes

- **ui**: Resolve reka-ui v-model binding issues for Switch component persistence ([1e38494](https://github.com/ilanzgx/multistream/commit/1e384943967d66c0168e5cb601d79d97ccb8c05a))
- **stream**: Address CodeRabbit review feedback ([9d3f0d0](https://github.com/ilanzgx/multistream/commit/9d3f0d086c04155bf6a3e803545f3f93d38faa12))
- **stream**: Resolve native player loading in production via CSP & error handling ([1c58f0f](https://github.com/ilanzgx/multistream/commit/1c58f0fc389eafc99b8a73cd800d53a8bcc8a13c))
- **ui**: Improve stream load reliability and ignore custom streams in chat ([57b7dc1](https://github.com/ilanzgx/multistream/commit/57b7dc104cf9c3be5f7325218d0897626a88cd65))


### Features

- **twitch**: Add twitch_get_hls_url backend command ([1a0a072](https://github.com/ilanzgx/multistream/commit/1a0a0725ba01113bc5820a4e1ba11b1eb35cba9d))
- **preferences**: Add native player preference and hls.js dependency ([cb4f08c](https://github.com/ilanzgx/multistream/commit/cb4f08cec238b76db64575300e6a02ddb18135bd))
- **stream**: Implement native hls twitch player component ([358c564](https://github.com/ilanzgx/multistream/commit/358c56416b0b2980a4c6a97c92b609ce1eb8cf16))
- **settings**: Add native player toggle and locale translations ([1889e4f](https://github.com/ilanzgx/multistream/commit/1889e4ff6444800dd21e8306200bf7af3ea84ff0))
- **ui**: Reset Twitch graveyard when native player preference changes ([d214105](https://github.com/ilanzgx/multistream/commit/d21410582d063d376a33b47ba3e2680bf9909bab))
- **ui**: Add visual skeleton loader for stream initialization ([e1acfb4](https://github.com/ilanzgx/multistream/commit/e1acfb4986630b7ec9c791837d9438c39fe84090))
- **i18n**: Add translations for native player volume and auto quality ([af65175](https://github.com/ilanzgx/multistream/commit/af651755b80950669a9d30834756113967ed6a2e))
- **ui**: Refine native player compact layout and fix playback bugs ([9fd42d9](https://github.com/ilanzgx/multistream/commit/9fd42d904ade1dc04f47952da537e5a2f7c5614b))
- **ui**: Add native screenshot support and refine viewer count ([cf874b2](https://github.com/ilanzgx/multistream/commit/cf874b2e8bbe59ce8b0951b298221a8f3d40ebbc))
- **ui**: Refine offline stream overlay design and fix controls overlap ([8bac8d1](https://github.com/ilanzgx/multistream/commit/8bac8d1decb7279e06b5deda2e85413515c92116))
- **website**: Optimize seo, i18n and changelog parsing ([ab27313](https://github.com/ilanzgx/multistream/commit/ab27313f8cdbda163b71a6323013f09cb7604717))
- **website**: Integrate astro-seo and astro-robots-txt for advanced seo ([14214fe](https://github.com/ilanzgx/multistream/commit/14214fececf75d207b192fcd3f1046d6e6e5d2c1))

## [0.18.10] - 2026-07-28

### Performance

- **ui**: Remove infinite css animations from idle components ([c44ee94](https://github.com/ilanzgx/multistream/commit/c44ee94461e847f286f5b2ba94213a800da5b25f))

## [0.18.9] - 2026-07-28

### Bug Fixes

- **ui**: Sort suggested streams by viewer count ([6e9929d](https://github.com/ilanzgx/multistream/commit/6e9929d645bde5d246cba9a65298fa8811c3864b))
- **twitch**: Prevent auth session drops on concurrent refresh and transient errors ([0efb9ce](https://github.com/ilanzgx/multistream/commit/0efb9cecef2e376a3852f8427f10a3dd2a2def81))
- **kick**: Prevent auth session drops on concurrent refresh and transient errors ([67a447f](https://github.com/ilanzgx/multistream/commit/67a447fe680588017196214053b1fcedd4c1005e))
- **ui**: Resolve skeleton loader race condition on startup ([abac40b](https://github.com/ilanzgx/multistream/commit/abac40b98183a25a65a0021a44a89f937cb35512))


### Performance

- **chat**: Optimize message storage layout and DOM rendering ([26717cf](https://github.com/ilanzgx/multistream/commit/26717cf2b2de9b2b4b4072c295fdd8104c5a1c93))

## [0.18.8] - 2026-07-24

### Bug Fixes

- **twitch-irc**: Add heartbeat, single-pass parsing, and outbound close handling ([f259887](https://github.com/ilanzgx/multistream/commit/f259887b9f43230a7599aaddd564da96a44e10c2))
- **recording**: Delete orphan on dismiss, fix channel parsing, enforce remux disk check ([9b043c7](https://github.com/ilanzgx/multistream/commit/9b043c7163f1248de934cfb593ebacb9197fe629))
- **recording**: Include detailed disk space metrics in remux error toast ([8ef1446](https://github.com/ilanzgx/multistream/commit/8ef14466704fb36f17269c17b211a734ac01c016))


### Features

- **ui**: Add reusable confirm dialog and confirmation step for orphan deletion ([70e13fa](https://github.com/ilanzgx/multistream/commit/70e13fa4aa660c5e503c62a5d7a3728be6420e72))
- **i18n**: Add orphan deletion confirmation translations for all locales ([bb7412d](https://github.com/ilanzgx/multistream/commit/bb7412d7f04ec2999292f5f91355381ec7228402))
- **ui**: Refine onboarding tour, settings tabs layout, and recording options ([a4ac6a1](https://github.com/ilanzgx/multistream/commit/a4ac6a1f756d00e2a94781eb177b6ca7948c9646))

## [0.18.7] - 2026-07-19

### Bug Fixes

- **rust**: Allow clippy::too_many_arguments on send_notification ([ede0f27](https://github.com/ilanzgx/multistream/commit/ede0f276c1c638de21003d155a4a15ad7915686b))
- **ui**: Bypass graveyard for custom streams to instantly destroy iframe and halt audio ([c3e3063](https://github.com/ilanzgx/multistream/commit/c3e306307a2c20765dd7486ec9a662515eb0aa7f))
- **windows**: Resolve powershell notification title in production ([72faae9](https://github.com/ilanzgx/multistream/commit/72faae9961e13242a8cbb2bd9a92e6d21af1b8dc))


### Features

- **rust**: Add tauri-winrt-notification dependency ([3063690](https://github.com/ilanzgx/multistream/commit/30636902b5256b540249271964a628ccb3293ebd))
- **ui**: Refine live status notifications logic ([46cb54e](https://github.com/ilanzgx/multistream/commit/46cb54e1bf8d06ab3f6277504a10a0ee4340097b))
- **i18n**: Refine notification templates across all locales ([4f8fb78](https://github.com/ilanzgx/multistream/commit/4f8fb78152cd0f58e544d11cce4df353399aff7d))
- **ui**: Redesign update progress toast for native sonner integration ([dbcdf24](https://github.com/ilanzgx/multistream/commit/dbcdf245ece738245036393aa337d8a3f746a618))


### Refactoring

- **rust**: Extract notification and screenshot commands to modules ([d333954](https://github.com/ilanzgx/multistream/commit/d333954753f1ab45b3bd442c359f524ff4d28af8))


### Build

- **macOS**: Remove unsupported hint method from notify_rust ([0c93f96](https://github.com/ilanzgx/multistream/commit/0c93f966896d743d7ab0f3b6aab86e1b40a8f84a))

## [0.18.5] - 2026-07-17

### Bug Fixes

- **deps**: Bump tauri to 2.11.5 and tauri-plugin-updater to 2.10.1 ([fe54fd7](https://github.com/ilanzgx/multistream/commit/fe54fd72df0e652eddb458543c25d0d551758fb0))
- **backup**: Resolve native backup export issues and increase test coverage ([f933e44](https://github.com/ilanzgx/multistream/commit/f933e44cad30c1fd7a467a428a241a7b1a824e57))
- **tauri**: Fix v2 ACL permissions and secure twitch credentials ([7938220](https://github.com/ilanzgx/multistream/commit/793822084aefade1ed51bfff8a8a2a3ee63fef9b))

## [0.18.3] - 2026-07-13

### Bug Fixes

- **rust**: Simplify complex type in KickState to resolve clippy warning ([e4bb47d](https://github.com/ilanzgx/multistream/commit/e4bb47dd9ff27ef8e7581c8d3fde0fea6841bd85))


### Features

- **auth**: Migrate kick oauth to deeplink flow on backend ([409e802](https://github.com/ilanzgx/multistream/commit/409e802a424cf54a5f6761ad9c1a2e04c0a48713))
- **ui**: Add kick oauth deeplink handling and callback screen ([eed7963](https://github.com/ilanzgx/multistream/commit/eed79639aa3bbce646b562ea396592ac0a5a187e))
- **website**: Implement dark mode toggle and mobile responsive header ([66c3d29](https://github.com/ilanzgx/multistream/commit/66c3d29dd3d5f6dc9648c7297fda707b13fd6d45))

## [0.18.2] - 2026-07-12

### Bug Fixes

- **chat**: Auto-select first stream chat when current selection is invalid ([671affe](https://github.com/ilanzgx/multistream/commit/671affeea53844d420cb8faec88e171e2a004771))
- **ui**: Append website locale to generated share url ([725edde](https://github.com/ilanzgx/multistream/commit/725eddec715f6f627255a8f41f765d385edcbe92))


### Documentation

- Update readme features and add website links ([bb8305b](https://github.com/ilanzgx/multistream/commit/bb8305b935c60d23f4ddda1c099746d364ed1615))


### Features

- **core**: Implement deep linking to share and import streams ([5727d01](https://github.com/ilanzgx/multistream/commit/5727d01b478904b996478b15fd3870a49ff9344e))
- **ui**: Migrate deep linking scheme to web domain ([b3c80f1](https://github.com/ilanzgx/multistream/commit/b3c80f148893e66a2d71458279c514cff5901c8c))
- **website**: Create static landing page with i18n support ([5c9e9d1](https://github.com/ilanzgx/multistream/commit/5c9e9d1d74bbd47b5bfe9d1011895f83f109a361))
- **website**: Add vercel analytics and speed insights ([f2a4c75](https://github.com/ilanzgx/multistream/commit/f2a4c75c00979b8a143e29da4fdd997dc665c590))
- **ui**: Improve deeplink ux with cancel button and subtle pulse ([61b4ff5](https://github.com/ilanzgx/multistream/commit/61b4ff5b7c7143a88fd56e2dc008e5b9bfe4093a))
- **ui**: Add permissions list to platform connections in settings ([f68a9af](https://github.com/ilanzgx/multistream/commit/f68a9af55162be9e77c0a914d4f5d217a39ae776))


### Build

- **vite**: Ignore website directory to prevent hmr triggers ([e86a995](https://github.com/ilanzgx/multistream/commit/e86a99593cf2c3715393d13977909495d0fb81fe))

## [0.18.1] - 2026-07-11

### Bug Fixes

- **ui**: Use localized string for all channels filter button ([15fb434](https://github.com/ilanzgx/multistream/commit/15fb434b94dd37731aff3d0f167d02382b5989c7))
- **twitch**: Respond to twitch IRC ping messages with pong to prevent connection reset ([b92d648](https://github.com/ilanzgx/multistream/commit/b92d6489fb658c3a7525154ece4a6f865b608b0c))
- **ui**: Use composite key for chat selection to prevent identical channel name collisions ([0cb3db8](https://github.com/ilanzgx/multistream/commit/0cb3db80c07be7d7d6f0442e3595dbe65b334627))


### Features

- **chat**: Add live chat button when scrolled up ([6a2d6e7](https://github.com/ilanzgx/multistream/commit/6a2d6e7bad30149b6b2a505a0c338e1b32b1e327))
- **stream**: Implement robust iframe graveyard architecture to bypass chromium ipc crashes ([75f1449](https://github.com/ilanzgx/multistream/commit/75f14494fa4cf24217b8195c7c1299c9b16d9735))
- **recording**: Add open folder button and remuxing toast description ([3f70107](https://github.com/ilanzgx/multistream/commit/3f70107b078b759d36b1396287c3243bb6ce60d3))


### Performance

- **stream**: Implement garbage collector for dead iframes to free memory ([93f6e28](https://github.com/ilanzgx/multistream/commit/93f6e28c557213353d4296df5074704e4db82b96))

## [0.18.0] - 2026-07-08

### Bug Fixes

- **sidebar**: Populate avatar for twitch favorite channels not followed ([5386e40](https://github.com/ilanzgx/multistream/commit/5386e40a040fa74556daae13dab06bf16c9316f2))
- **sidebar**: Show kick favorites when not authenticated ([bdb3fac](https://github.com/ilanzgx/multistream/commit/bdb3fac875683d2d96904be50606486cb81124e1))
- **recording**: Improve shutdown lifecycle and resolve remuxing race conditions ([376354a](https://github.com/ilanzgx/multistream/commit/376354aafcae4943c6c7c7fac440276c1bce58c5))
- **recording**: Resolve clippy needless borrow warning in installer ([efbfde6](https://github.com/ilanzgx/multistream/commit/efbfde669d551c25b24ea717f896a73a4a092afb))
- **recording**: Apply CodeRabbit stability, data integrity, and UI layout fixes ([30b856e](https://github.com/ilanzgx/multistream/commit/30b856e5a2c499bc88bcc716673b8bd8cf4e95df))
- **recording**: Enforce Windows-only platform guard and strict SHA256 integrity checks ([4793d29](https://github.com/ilanzgx/multistream/commit/4793d29ec396f14860ad46c77d2440e6052f47d0))


### Documentation

- **recording**: Document local stream recording architecture and feature list ([da8cc93](https://github.com/ilanzgx/multistream/commit/da8cc93d2c7e5866a9e399b1d65116bb39ba8b2b))


### Features

- **sidebar**: Add twitch favorites and visual channel distinction ([e337ed8](https://github.com/ilanzgx/multistream/commit/e337ed89fd4ee789eff0eb754ed969b3dc031ebb))
- **recording**: Add recording manager and rust states ([efac755](https://github.com/ilanzgx/multistream/commit/efac7559a20aced4ad85de018bd3b7d4ec4175fd))
- **recording**: Add IPC commands and remuxing logic ([a59c685](https://github.com/ilanzgx/multistream/commit/a59c68508a8b1a75a036bb4e6def052cb03f0d31))
- **recording**: Register recording plugin in tauri builder ([3976177](https://github.com/ilanzgx/multistream/commit/39761774b7da0ca90f9420cc4a66e8c00fd56dde))
- **rust**: Add recording IPC capabilities ([1981bbf](https://github.com/ilanzgx/multistream/commit/1981bbf4d766ea4f136f8faa8d999cc1ac1dad97))
- **recording**: Implement core logic and state management for stream recording ([3c8cf0b](https://github.com/ilanzgx/multistream/commit/3c8cf0b3f528bebd158269fed64ce1ccd8e74543))
- **ui**: Integrate local recording controls into settings and stream overlay ([a7051ae](https://github.com/ilanzgx/multistream/commit/a7051aef161f3d48d6aac60ca34a65e85ec5570c))
- **i18n**: Add local recording translations across 6 languages ([7ff5777](https://github.com/ilanzgx/multistream/commit/7ff57779b1ecfa0d9b25dec603bcc8b5b4ddc66e))
- **recording**: Support custom save paths and fix orphan checking ([449f907](https://github.com/ilanzgx/multistream/commit/449f9072ac3ef80268c4b3097fdc8394af9d9383))
- **i18n**: Update translations for recording settings and save paths ([6ffec8b](https://github.com/ilanzgx/multistream/commit/6ffec8b3607ccb890b1ce9df354588b6f8bae31e))
- **ui**: Implement recording settings UI and custom path selection ([bf50faa](https://github.com/ilanzgx/multistream/commit/bf50faa84d8ca661774c0ed5f26f6b90e587eae3))
- **ui**: Standardize auth dialogs and add copy link feature ([59432c9](https://github.com/ilanzgx/multistream/commit/59432c988fc5ce8f47c8ff165628cee5558cb46c))


### Performance

- **sidebar**: Remove animated border to fix high cpu usage ([b75d712](https://github.com/ilanzgx/multistream/commit/b75d712eab6db94b687e9b132dc899ac4bc00c3d))


### Refactoring

- **ui**: Optimize sidebar channel list rendering and ux ([cb97ade](https://github.com/ilanzgx/multistream/commit/cb97aded7ac27951e8e4d9e6e557527cb4cff904))
- **rust**: Migrate recording sidecars to dynamic installer ([12f9b9b](https://github.com/ilanzgx/multistream/commit/12f9b9bacb86ac85db392c074318a368bc640c8e))


### Build

- **rust**: Configure ffmpeg and streamlink sidecars ([750e428](https://github.com/ilanzgx/multistream/commit/750e4288cb8bf68f9f0603b5f436056281ed0152))

## [0.17.2] - 2026-07-03

### Bug Fixes

- **oauth**: Resolve token refresh edge cases and network errors ([48c6bf0](https://github.com/ilanzgx/multistream/commit/48c6bf0b638eb234524ce1afdecfcc0f52bccf28))
- **release**: Use tar.gz archives for linux updater artifacts ([b7a7fab](https://github.com/ilanzgx/multistream/commit/b7a7faba329487744c251546241323bf07cba4ba))


### Features

- **ux**: Implement os-level h.264 codec presence detection for linux webkitgtk ([1994a96](https://github.com/ilanzgx/multistream/commit/1994a96545edccd67152a944c51e6a692f5b8c53))
- **ui**: Migrate to native tauri os file dialogs for export and import ([08bed67](https://github.com/ilanzgx/multistream/commit/08bed67d5c44662bae93e8ca1d876cdf04fd5318))
- **ui**: Add visual progress bar for app updates ([65ac9ea](https://github.com/ilanzgx/multistream/commit/65ac9eae262454fcc6b3935679918e2c83759e60))


### Style

- **ui**: Fix dialog rendering and platform-specific tabs for linux ([1926df0](https://github.com/ilanzgx/multistream/commit/1926df01c5975bb0b31a2edbed74712096c02917))

## [0.17.1] - 2026-07-03

### Features

- **ui**: Add skeleton loaders to native chats and remove sidebar tooltip physics ([7336596](https://github.com/ilanzgx/multistream/commit/73365968bbc12fa811704aee5977e52844ec9462))


### Performance

- **chat**: Optimize reactivity for messages and emotes using shallowRef ([e569904](https://github.com/ilanzgx/multistream/commit/e569904bfed32bcde42b42969788d4117b62cb4c))


### Refactoring

- **chat**: Isolate message limits per channel to prevent state interference ([311f29b](https://github.com/ilanzgx/multistream/commit/311f29b9bacc938683672333ecdb7c2cb36e8676))


### Build

- **tauri**: Optimize release profile for binary size and version bumping ([011c82f](https://github.com/ilanzgx/multistream/commit/011c82f7d75b2276f3a23f8becd265e20e2bb116))

## [0.17.0] - 2026-07-01

### Bug Fixes

- **emotes**: Refine UI and resolve PR review feedback ([d5f5087](https://github.com/ilanzgx/multistream/commit/d5f5087729d9c302e71182696771b6a96a3f2792))
- Resolve sidebar review feedback ([adadfb4](https://github.com/ilanzgx/multistream/commit/adadfb4ca795e15000bb77283f09ba6cc6c43f96))


### Features

- **chat**: Implement recent emotes store and fix cross-platform emote parsing ([8ae9c08](https://github.com/ilanzgx/multistream/commit/8ae9c08dd8c95ce147f2d4bb2d5a088a03119f49))
- **ui**: Add emote picker and refine tooltip interactive behavior ([bd29d87](https://github.com/ilanzgx/multistream/commit/bd29d87c6c93867dfb690bc01ca808539a0405bd))
- **rust**: Add backend commands for twitch followed streams ([d1b2019](https://github.com/ilanzgx/multistream/commit/d1b2019536ee44b1af4bc4503c857e6c22d72d3e))
- **composable**: Create useFollowedChannels and tests ([05a0048](https://github.com/ilanzgx/multistream/commit/05a0048ff3dc438a94478d65f5be9c1f67567797))
- **i18n**: Add translations for followed channels sidebar ([5e0369f](https://github.com/ilanzgx/multistream/commit/5e0369feacf0ec12303b1ad55c87d23fde5e2320))
- **ui**: Add FollowedChannelsSidebar component ([9ac8fce](https://github.com/ilanzgx/multistream/commit/9ac8fced46130a76545f8499fba470a9091c9f62))
- **ui**: Integrate FollowedChannelsSidebar into App and SidebarPanel ([c8559af](https://github.com/ilanzgx/multistream/commit/c8559afed1a5142dae17303846ef4da0e15ed795))
- **chat**: Make links clickable and parse URLs dynamically ([5fb04ba](https://github.com/ilanzgx/multistream/commit/5fb04bacb16535b36222527ed5b0f967e5143d6a))


### Refactoring

- **ui**: Make LoginPrompt reusable for sidebar ([8873b11](https://github.com/ilanzgx/multistream/commit/8873b11da1c2ae41e66aaa7562d2be7ad7f94c5e))

## [0.16.4] - 2026-06-30

### Bug Fixes

- **streams**: Resolve sticky drag state and zero-span grid layout ([f40301c](https://github.com/ilanzgx/multistream/commit/f40301c57dd8fb01aa4548c91d5d67729c58cd52))


### Features

- **streams**: Implement drag-and-drop stream reordering ([cbc97e6](https://github.com/ilanzgx/multistream/commit/cbc97e64dd805ed11077411293fc6b287ace9026))


### Refactoring

- **composables**: Standardize useProfilePicture and useChannelSearch to shared pattern ([bba3c4a](https://github.com/ilanzgx/multistream/commit/bba3c4a11e743a345c06423332ee299a4fb747c4))


### Style

- Refine web banner, sidebar empty states, and toast ui ([a9a8dff](https://github.com/ilanzgx/multistream/commit/a9a8dffe2ceebe00073b47e38631d13e08b576c1))
- **ui**: Refine stream skeleton layout and diagnostics panel ([1363c33](https://github.com/ilanzgx/multistream/commit/1363c338f2ef9ea21086b2476a2b95a22caa92dd))

## [0.16.3] - 2026-06-27

### Bug Fixes

- **emotes**: Load channel emotes on mount for twitch and kick native chats ([e9a6019](https://github.com/ilanzgx/multistream/commit/e9a6019820b957d7a9c1bb8681b135a77da5e59d))


### Documentation

- Update README ([04cc9d0](https://github.com/ilanzgx/multistream/commit/04cc9d0254e50f2d8cd13568464715696e9b21cf))

## [0.16.1] - 2026-06-26

### Bug Fixes

- **chat**: Resolve color collisions and update palette ([d68735e](https://github.com/ilanzgx/multistream/commit/d68735e0b8a90a532dbfa6d2dfce13c2e8a1c36f))
- **chat**: Encode native kick emotes properly before sending message ([76c6024](https://github.com/ilanzgx/multistream/commit/76c6024174a439420a54c81acfafbfe04533bc8c))


### Features

- **chat**: Implement WYSIWYG rich text input for live emotes ([b85ba9e](https://github.com/ilanzgx/multistream/commit/b85ba9e0fceff6ce3a70504b2466c384b5ed274c))

## [0.16.0] - 2026-06-25

### Bug Fixes

- Resolve clippy warnings and unused code in oauth ([35c2890](https://github.com/ilanzgx/multistream/commit/35c28904f4d7b16e1e50dccb70c681d705129658))
- Resolve flaky e2e test and emote regex undefined error ([eae5a78](https://github.com/ilanzgx/multistream/commit/eae5a787c884f33bfc7b0a86e7c9e7b3ed8d952d))
- **rust**: Resolve Kick OAuth callback parsing and state validation ([d6f8d83](https://github.com/ilanzgx/multistream/commit/d6f8d83e257a2552e03c747cc2563ba8155e9713))
- **rust**: Track .env in build script ([37f0604](https://github.com/ilanzgx/multistream/commit/37f060478e66f09095d292f6e41edbcfee20c96b))
- **rust**: Address CodeRabbit feedback for kick integration ([5a2a659](https://github.com/ilanzgx/multistream/commit/5a2a659acbdb2269c2f882e649078488ef6bfc62))
- **ui**: Address CodeRabbit feedback for ui and state ([9609e8d](https://github.com/ilanzgx/multistream/commit/9609e8d65868ec5744de88cc0258de79d2dbe2e5))


### Features

- **kick-oauth**: Implement kick oauth pkce flow and state management ([de54a96](https://github.com/ilanzgx/multistream/commit/de54a969252c8205642008a3c76acb792ec23975))
- **kick-oauth**: Expose tauri commands for kick authentication ([a1e839d](https://github.com/ilanzgx/multistream/commit/a1e839d2d1912c9ba9c0d373017d247da6b23347))
- **ui**: Add kick authentication dialog and settings integration ([209fee9](https://github.com/ilanzgx/multistream/commit/209fee9a01072fc7c41de63a03d281df0ce45da5))
- **i18n**: Localize kick authentication dialog texts ([2477cf9](https://github.com/ilanzgx/multistream/commit/2477cf93cccc1470c47c6ae213a613c24288e707))
- **rust**: Implement Kick chat API and WebSocket pusher client ([f8a78eb](https://github.com/ilanzgx/multistream/commit/f8a78ebba814118e2fd346a14f1662ae0cf81700))
- **ui**: Add Kick native chat interface with login prompt and i18n ([012aa4b](https://github.com/ilanzgx/multistream/commit/012aa4b44b0a22dedb9567f2e2a26a383a49a949))
- **ui**: Integrate multi-platform unified chat and kick chat into sidebar ([73f7bdf](https://github.com/ilanzgx/multistream/commit/73f7bdff7321aaf7d1cac9152162f4ed980a08f4))
- **rust**: Address PR feedback for Kick OAuth stability ([8e32b51](https://github.com/ilanzgx/multistream/commit/8e32b513e97c6818e52b825b7207a6fbe8584763))
- **i18n**: Localize logout tooltip in settings ([1b95d3b](https://github.com/ilanzgx/multistream/commit/1b95d3b1ae6294ee48e574b26fe4d31495407203))


### Refactoring

- **chat**: Replace unified twitch chat with multi-platform unified chat ([02883b2](https://github.com/ilanzgx/multistream/commit/02883b2b480534012329d9b28d29e5ef55be4ff6))
- **ui**: Improve Kick Auth Dialog stability ([3831cf1](https://github.com/ilanzgx/multistream/commit/3831cf15a5f53d79117ad2bb745c880b3d702db6))

## [0.15.1] - 2026-06-23

### Bug Fixes

- **chat**: Prevent random toasts from non-error twitch notices ([7659a78](https://github.com/ilanzgx/multistream/commit/7659a780061e5d32867a18eb7c5883c445838d84))

## [0.15.0] - 2026-06-23

### Bug Fixes

- Prevent unified chat from deselecting when streams change ([acc4eb5](https://github.com/ilanzgx/multistream/commit/acc4eb54438493d456af1e35e7845aeacd6d62ef))
- Address CodeRabbit performance and memory leak reviews ([1f808b9](https://github.com/ilanzgx/multistream/commit/1f808b997bbfbc7b976117a27a3242fd2ae6b93a))
- **rust**: Improve twitch auth reliability and sync ([d856a0e](https://github.com/ilanzgx/multistream/commit/d856a0e5c5437f149e5f024833282386a4e9954f))
- **a11y**: Resolve color contrast and touch target violations ([5186956](https://github.com/ilanzgx/multistream/commit/518695612344cf586d35b250d77ae4f918897825))


### Features

- **rust**: Implement Twitch Device Code flow auth ([135d690](https://github.com/ilanzgx/multistream/commit/135d690a7c01cfb05db95be6635ec8c18d0d196b))
- **twitch-auth**: Implement useTwitchAuth and useUnifiedChat composables ([9e46fa2](https://github.com/ilanzgx/multistream/commit/9e46fa26ad29dd4623e3ad487ae8b8963df97228))
- **twitch-auth**: Add TwitchAuthDialog and Unified chat components ([d11fd05](https://github.com/ilanzgx/multistream/commit/d11fd0596edb04bbaec03ade0164ba0ce4eb7bc1))
- **twitch-auth**: Integrate unified chat in sidebar ([3095b91](https://github.com/ilanzgx/multistream/commit/3095b916441a29114199057a804dab2ca08d4b8a))
- **i18n**: Update twitch authentication translations ([76fa730](https://github.com/ilanzgx/multistream/commit/76fa73017917047ffbfb417ffbc99c416cde16df))
- Add useEmotes composable for support BTTV and 7TV Twitch emotes ([b5a6c36](https://github.com/ilanzgx/multistream/commit/b5a6c3622df298cb8574fe58c68f1533d7c8348d))
- **rust**: Implement native twitch chat message sending ([6c86944](https://github.com/ilanzgx/multistream/commit/6c8694438a7e0f86c653b980733b0d0d800bc0b0))
- **i18n**: Add translations for native chat ([268c0c4](https://github.com/ilanzgx/multistream/commit/268c0c49526300b418529efc10db04c6b0e6a4d0))
- **chat**: Create native twitch chat interface and sending logic ([f6da0b3](https://github.com/ilanzgx/multistream/commit/f6da0b33ae2d8209c996a43aab36da381a655335))
- **ui**: Update onboarding tour to include twitch chat integration ([25a751e](https://github.com/ilanzgx/multistream/commit/25a751e4859322e8655de696a40455d72a9ca2b6))


### Performance

- **ui**: Optimize bundle size with async components and improve a11y ([c9581d1](https://github.com/ilanzgx/multistream/commit/c9581d151dc39b0e9e815af33b863d491bb65df4))


### Style

- Add channel avatars and fix horizontal overflow ([6c97823](https://github.com/ilanzgx/multistream/commit/6c97823892448266eef64900bea61148714327fa))

## [0.14.2] - 2026-06-19

### Features

- **transcription**: Make chunk_duration configurable via AtomicU32 ([f3ae894](https://github.com/ilanzgx/multistream/commit/f3ae894cf8d6c96e3c00f05e282e7a0ba26bdf21))
- **transcription**: Register set_chunk_duration tauri command ([88415a0](https://github.com/ilanzgx/multistream/commit/88415a09da0cc86ebf5e0a879fce5401f76a6eba))
- **i18n**: Add chunk duration keys to all 6 locales ([a17a4a0](https://github.com/ilanzgx/multistream/commit/a17a4a024b117edc75f8e83446e988f615f68f02))
- **ui**: Add chunk duration settings ui and state ([6441ac7](https://github.com/ilanzgx/multistream/commit/6441ac7a8b66fdfca839c54fe18a0aeb9046256e))
- **transcription**: Add show overlay toggle to transcription chat and update version to v0.14.2 ([5421d8d](https://github.com/ilanzgx/multistream/commit/5421d8dc4c659962aaedecf99346b9d030be62f6))


### Refactoring

- **transcription**: Remove hardcoded fallback in chunk step validation ([82cc28f](https://github.com/ilanzgx/multistream/commit/82cc28f0e716dd0b3e69fcec99a1cd69c067b9b1))

## [0.14.1] - 2026-06-18

### Bug Fixes

- **rust**: Optimize whisper download memory usage, timeout, and cancellation ([aeec35c](https://github.com/ilanzgx/multistream/commit/aeec35c80cefdfb0b09dc9a243fa4f9c86682da9))


### Features

- **ui**: Implement dynamic live transcription status and UI refinements ([794a6a6](https://github.com/ilanzgx/multistream/commit/794a6a6619c9580ea1b63670dce4be9dd46e8010))
- **ui**: Refine onboarding live transcription step with visual demo and benefits ([c89c663](https://github.com/ilanzgx/multistream/commit/c89c6634f0316fcf24975c38275f162e220fcdc9))


### Style

- Stabilize transcription status indicator by removing text swapping ([73eb4a5](https://github.com/ilanzgx/multistream/commit/73eb4a596cb91f0e234fded50755b19eb1eeb20f))

## [0.14.0] - 2026-06-18

### Bug Fixes

- **rust**: Handle graceful shutdown of transcription stream sidecar ([8aae735](https://github.com/ilanzgx/multistream/commit/8aae7355b63bd6956914177a4364c91265762922))
- **rust**: Use rustls-tls to bypass cloudflare fingerprinting ([688eb94](https://github.com/ilanzgx/multistream/commit/688eb9407ab20ae7cf97faf87e437dc0b20ecf9d))
- **audio**: Convert 32-bit float wav to 16-bit pcm for whisper.cpp compatibility ([c5751d9](https://github.com/ilanzgx/multistream/commit/c5751d9c9ad5f36e3146dee631d12a22b5af46cc))
- **transcription**: Adjust whisper flags to prevent prompt hallucination, correct language fallback, and wrap long text in UI ([9cec5d4](https://github.com/ilanzgx/multistream/commit/9cec5d42b536c24eb974089786fbe9b0caa7aa36))
- **audio**: Implement RAII guard to prevent WAV file leaks on transcription errors ([a2b256a](https://github.com/ilanzgx/multistream/commit/a2b256a6b60eb8f1c8268239cc27338d4cb37246))
- **transcription**: Prevent unwanted model auto-selection and false start toasts ([94aba53](https://github.com/ilanzgx/multistream/commit/94aba5371cf68084a45ad1cc640b31d3e34bcda4))
- **audio**: Handle transcriber errors safely and add path traversal checks ([246e0b3](https://github.com/ilanzgx/multistream/commit/246e0b33bfe3f8edd6ab7da883f3003872ddfe96))
- **ui**: Auto-select newly downloaded model if current selection is invalid ([bd1454b](https://github.com/ilanzgx/multistream/commit/bd1454bac56b89535f675a7dbcada28ba5cfb9ca))
- **ui**: Disable transcription settings while downloading a model to prevent race conditions ([e848c3f](https://github.com/ilanzgx/multistream/commit/e848c3f525faae05662549fcb0d00b3335b70263))


### Documentation

- Update README ([1519bd1](https://github.com/ilanzgx/multistream/commit/1519bd1258a8fa3479f580ad81d4ee68f10145a6))


### Features

- **rust**: Add live transcription backend commands and audio module ([729e490](https://github.com/ilanzgx/multistream/commit/729e490a283942aee0530c1a62da0281cd614767))
- Add useTranscription with model management and caption mode ([b867d66](https://github.com/ilanzgx/multistream/commit/b867d665e701ebe76528f1573688be45c16c02f8))
- **ui**: Add live transcription section to settings dialog ([b9fb3bb](https://github.com/ilanzgx/multistream/commit/b9fb3bb3d9e1fc8aa56d3ea79f403bef666a5c8b))
- **ui**: Add transcription overlay to focused stream ([fdd4e05](https://github.com/ilanzgx/multistream/commit/fdd4e054fdf5ddbcd1fcdc2599b22b17be6ed272))
- **i18n**: Add live transcription strings to all locales ([b5738c5](https://github.com/ilanzgx/multistream/commit/b5738c533da99e89d108f7a858ef648a45809e40))
- **rust**: Implement wasapi loopback and wav generation ([3bb338b](https://github.com/ilanzgx/multistream/commit/3bb338b1f8544a301199a97c2c89c722d3712ab0))
- **rust**: Integrate whisper-cli, add dlls to resources, automate sidecar download ([9856404](https://github.com/ilanzgx/multistream/commit/98564044047b2bf98670231fdac566e40b6c7175))
- **audio**: Add transcription diagnostics and increase chunk size to 10s ([812a86b](https://github.com/ilanzgx/multistream/commit/812a86bb2390e71df9c62170550a9f4c3e2bac96))
- **audio**: Add phase 3 audio diagnostics, implement linear resampling, and handle debug audio files ([27e2631](https://github.com/ilanzgx/multistream/commit/27e2631ea30b5a2ab6ca616fe820c4daf486cda3))
- **ui**: Implement multi-model whisper manager with download, select and uninstall capabilities ([6a55d1a](https://github.com/ilanzgx/multistream/commit/6a55d1a56ad5ecf4347d884c5bbf38cad88fc00c))
- **ui**: Display transcription on single streams and fix hallucination bugs ([63d97da](https://github.com/ilanzgx/multistream/commit/63d97daae0fdb578e4d6db3a736ac446a66cb16b))
- **i18n**: Add missing translations for tabs and transcription states ([14a594d](https://github.com/ilanzgx/multistream/commit/14a594d26ac76fd9d60921ce288c93082814ccac))
- **i18n**: Add translation keys for transcription toasts and active indicator ([e0e0151](https://github.com/ilanzgx/multistream/commit/e0e01514e21de88a9c6fd9a61e66e5453b8f9b40))
- **transcription**: Make transcription state opt-in per session and add feedback toasts ([51957d0](https://github.com/ilanzgx/multistream/commit/51957d024f8ad613390330743137de914cf6a06f))
- **ui**: Add persistent live transcription indicator to sidebar ([de48875](https://github.com/ilanzgx/multistream/commit/de488754825a056563b0139eb837f596ea8de62a))
- **ui**: Refine live transcription model selection ui ([a2aa586](https://github.com/ilanzgx/multistream/commit/a2aa58674094a5bf774d1d3102a7578239a61ad9))
- **onboarding**: Add live transcription step to onboarding tour with fixed height and translations ([13057f1](https://github.com/ilanzgx/multistream/commit/13057f1712321bc80e4f38c04995f12759c8b6b1))
- **transcription**: Add global transcript history support ([49961a5](https://github.com/ilanzgx/multistream/commit/49961a58401e14dd807b34a42d3b21c465ef9938))
- **i18n**: Add translations for transcript chat tab ([8244e59](https://github.com/ilanzgx/multistream/commit/8244e593cf9b6e3c06a4570121cf8cf222dcab73))
- **transcription**: Implement global transcript view inside chat sidebar ([6db89b0](https://github.com/ilanzgx/multistream/commit/6db89b0c683b273d393e10fbdf26ca6299c65546))
- **transcription**: Update transcript panel header layout to align horizontally, decrease button sizes, and shorten mode label ([c8fe237](https://github.com/ilanzgx/multistream/commit/c8fe2378a6b7eac93f241c0c89217b5058cc60c4))
- **rust**: Restrict live transcription to Windows only ([e1cb714](https://github.com/ilanzgx/multistream/commit/e1cb7147316dc0996d817c460033eb96f4adbd55))
- **ui**: Hide transcription features on unsupported platforms ([d1e4e74](https://github.com/ilanzgx/multistream/commit/d1e4e7411696fd7983f585183f529f6f5d731c57))


### Refactoring

- **audio**: Improve transcription stability and fix language detection ([8b47f7a](https://github.com/ilanzgx/multistream/commit/8b47f7aa366a37470be4fc81b1b1931a5eda2634))


### Style

- **ui**: Refactor settings dialog layout and tabs ([f09386c](https://github.com/ilanzgx/multistream/commit/f09386ce0d8c9b69b54637a9d356fb0edd503e10))
- **transcription**: Adjust overlay limit and bottom spacing to prevent overlapping watch timer ([1541050](https://github.com/ilanzgx/multistream/commit/15410506f01189e83a6b4a5f33513d8622ee66b9))
- **onboarding**: Skip transcription tour step on unsupported platforms ([f2040be](https://github.com/ilanzgx/multistream/commit/f2040be4beed78459f36b2caeb8424978c7ee343))


### Build

- **rust**: Add cpal and hound for audio capture ([b25615e](https://github.com/ilanzgx/multistream/commit/b25615ee1734c70a959657d90304e95f87b9eaa7))
- Create dummy binary file for whisper-cli on unsupported platforms to fix tauri_build error ([7627ada](https://github.com/ilanzgx/multistream/commit/7627ada0c8f25283234c127667e40b49d9ee511f))
- Create dummy dll file on unsupported platforms to fix tauri_build resource glob error ([b9f17e5](https://github.com/ilanzgx/multistream/commit/b9f17e5e4732a7d0f324c1c578edc7d7db915e05))

## [0.13.0] - 2026-06-13

### Bug Fixes

- Remove localhost origin from YouTubeStream and sandbox from CustomStream ([4f9abf5](https://github.com/ilanzgx/multistream/commit/4f9abf5b42be2d94f79c3f703925675e48155a11))


### Documentation

- **onboarding**: Add category fetching step and translate step 2 graphic helpers ([763af4d](https://github.com/ilanzgx/multistream/commit/763af4dbf10238785dbc798934366eeb20e2da34))


### Features

- Filter by stream category on SuggestedStreams ([6b07c0b](https://github.com/ilanzgx/multistream/commit/6b07c0bba36d9332c39f4580895f3b548f1d18d8))
- Implement category-based on-demand stream fetching and consolidation ([29b7600](https://github.com/ilanzgx/multistream/commit/29b760054440976970e2aa2d77c6bcf46ce995fd))
- Implement debounced autocomplete for Twitch and Kick ([f5bbb78](https://github.com/ilanzgx/multistream/commit/f5bbb78d3363b97f9fc8a206b920339283401cbd))
- Integrate autocomplete and optimize AddDialog layout ([e0e3cf3](https://github.com/ilanzgx/multistream/commit/e0e3cf3ea89378065f6ab6799f5f340d703b0d5c))


### Refactoring

- Extract 'isTauri' and unify HTTP requests ([048dae8](https://github.com/ilanzgx/multistream/commit/048dae8e70106a5652cd6eefb388f51dae67a126))


### Style

- Improve skeleton loader UI/UX and stream diagnostics integration ([71943cc](https://github.com/ilanzgx/multistream/commit/71943cc8f7c1f633d42454897108808fbfc577c6))
- Improve EmptyState layout for multi-language text wrapping ([54d8289](https://github.com/ilanzgx/multistream/commit/54d8289d25e7a0aea4e66f33326cb721b6ac0d81))

## [0.12.1] - 2026-06-09

### Features

- Watch timer persistence, useStreams refactoring and backup UX improvements ([254a829](https://github.com/ilanzgx/multistream/commit/254a8295e9303f37fc5a1303336b4a0eb7864058))

## [0.12.0] - 2026-06-08

### Bug Fixes

- Remove isLoadingMoreSuggestions on SuggestedStreams.vue ([d6270c2](https://github.com/ilanzgx/multistream/commit/d6270c27bd358c4bf38c5e021ec088cc5167c4c9))
- Resolve black screen rendering bug on background streams when dialogs open ([45142e9](https://github.com/ilanzgx/multistream/commit/45142e9ec6095b4d666c92adf4c7e49f1a30fdfd))


### Features

- **ui**: Implement robust auto-detection of platforms from pasted URLs ([c4f588e](https://github.com/ilanzgx/multistream/commit/c4f588eaec1a9d087bcb0fe602686d2af5d5020e))
- **suggestions**: Implement two-phase incremental loading and fix race conditions ([7c877ed](https://github.com/ilanzgx/multistream/commit/7c877ed949ac12071b49f3557dcd47338ce651e0))
- Add complete configuration export and import ([cac5bdd](https://github.com/ilanzgx/multistream/commit/cac5bddba44feadcdd223d8d309b897477e64f54))
- Introduce multi-step interactive tour for new users ([ecd37a4](https://github.com/ilanzgx/multistream/commit/ecd37a4ca5bdd37b4b401556dc02f4cab05f6c9c))


### Style

- Improve dialogs interfaces ([08bc0b8](https://github.com/ilanzgx/multistream/commit/08bc0b8e5e4ce0373558f510b555f09f238a7134))
- Fix some background colors at SettingsDialog ([2df4d77](https://github.com/ilanzgx/multistream/commit/2df4d7728c9c4641edf823004cf9f4c7acdb1a41))

## [0.11.3] - 2026-05-27

### Bug Fixes

- Update broken kick embeds ([30b9c68](https://github.com/ilanzgx/multistream/commit/30b9c681c8c310469eeb87092f23701adc88eaa8))

## [0.11.2] - 2026-05-21

### Bug Fixes

- Prevent xss injection on parseUrlOptions ([8bf78de](https://github.com/ilanzgx/multistream/commit/8bf78de61dc3eb7a6fa355b35ab8e620b8747119))
- Improve component lifecycle, domain matching and skeleton behavior ([c8fb716](https://github.com/ilanzgx/multistream/commit/c8fb716531afa909eb34d9d5989b32dcae153fb2))
- Prevent losing broadcast data when removing kick streams ([2c23b35](https://github.com/ilanzgx/multistream/commit/2c23b3510946a1d1de9397a52bc8000e87ded653))
- Align webview security settings and improve focus event handling ([1c0c26c](https://github.com/ilanzgx/multistream/commit/1c0c26c5094d7be77571867c40d865b47c0b1d08))

## [0.11.1] - 2026-04-03

### Features

- Add shortcuts to switch between stream chats 1-9 ([debbdd4](https://github.com/ilanzgx/multistream/commit/debbdd4d580348741144d71517eebf67185324f1))
- Add shortcut to capture screenshot of focused stream (S) ([9c883c0](https://github.com/ilanzgx/multistream/commit/9c883c067120dece57e0fa66786f3ab69e7d619b))
- Add shortcut to open add stream dialog (D) ([6338a87](https://github.com/ilanzgx/multistream/commit/6338a8763838337ca9c0e31b0f3028509a7d4856))


### Refactoring

- Adjust SideBarPanel for zero-delay stream chat switching ([53dbb2b](https://github.com/ilanzgx/multistream/commit/53dbb2bac906e456067434a04d80dc07e6bf2e09))

## [0.11.0] - 2026-04-03

### Bug Fixes

- Sort favorites streams on AddDialog by viewers count ([3e1a10a](https://github.com/ilanzgx/multistream/commit/3e1a10acb114a8981dd3733670068fe9bf3be9c0))
- Use actual timestamp in screenshot filenames ([cc25455](https://github.com/ilanzgx/multistream/commit/cc25455539cba12fcf3220d0c21f12a4304e7d96))


### Features

- Screenshot of screen stream (native resolution) ([9c8d9e9](https://github.com/ilanzgx/multistream/commit/9c8d9e9b6edd88bf422bc129d2bb04e544449164))

## [0.10.1] - 2026-03-25

### Bug Fixes

- Prevent focus invalid stream id ([ecea59a](https://github.com/ilanzgx/multistream/commit/ecea59ac004d716d56955896adb465d8f2ad28ac))
- Adapt popup buttons on unfocused streams ([96b9882](https://github.com/ilanzgx/multistream/commit/96b9882f2492d077fbef25917ab29aabc0c55a48))


### Refactoring

- Get more streams pages from twitch ([51de2eb](https://github.com/ilanzgx/multistream/commit/51de2eb0f358f5b32f534c48c53d96c5494ddf56))

## [0.10.0] - 2026-03-18

### Bug Fixes

- Prevent notification flood when losing connection ([a9236a8](https://github.com/ilanzgx/multistream/commit/a9236a80ae915b4bda27826901e0707803087d22))


### Features

- Create focused streams ([2deb0b3](https://github.com/ilanzgx/multistream/commit/2deb0b37ceb4d27c4b73900c8de368d25de7fc1a))
- Add suggested streams pagination ([743d8d2](https://github.com/ilanzgx/multistream/commit/743d8d2aa2fd17854cc3d4fe68a78e2dabf6bc52))


### Performance

- Optimize live status polling ([130a5d1](https://github.com/ilanzgx/multistream/commit/130a5d15de7ab1259956c612944c0bfafca35dfc))


### Style

- Add animations for better UX ([285cd42](https://github.com/ilanzgx/multistream/commit/285cd4210d9ac87bcebd9e0e6cd9abb0a5fdfb49))
- Add BaseChat skeleton loader for each platform ([b34677b](https://github.com/ilanzgx/multistream/commit/b34677baab85b87596cdfc97f7d01989ea090a35))
- Add borders between streams and grid container in AddDialog favorites and recents ([b5588f9](https://github.com/ilanzgx/multistream/commit/b5588f976622be62855b1bec29852ad7c96017ae))

## [0.9.5] - 2026-03-13

### Bug Fixes

- Prevent unlimited streams ([ad11d7a](https://github.com/ilanzgx/multistream/commit/ad11d7a4e7d130bb1eaddfeb124d2de80d1091cb))
- Remove internal autoplay muting parameter after initial render ([7b025c1](https://github.com/ilanzgx/multistream/commit/7b025c10e06c6593d2d36ccf2dc3dce7626e2147))

## [0.9.4] - 2026-03-08

### Bug Fixes

- Prevent infinite loop in spa fallback when adding custom stream ([d44df99](https://github.com/ilanzgx/multistream/commit/d44df994b7b4f4baf9188c73b5362cf77a62328e))


### Refactoring

- Enhance favorite list in AddDialog and improve UI ([5440e15](https://github.com/ilanzgx/multistream/commit/5440e15aed105015459567062d6cdd856fa3d4f0))


### Style

- Adjust offline stream chip ([6a06026](https://github.com/ilanzgx/multistream/commit/6a0602685cd5d47a676a8dec2ec939a27e6a8c26))

## [0.9.3] - 2026-03-06

### Features

- Splash loading screen ([3a027dd](https://github.com/ilanzgx/multistream/commit/3a027dd0aaa21df4e05406bbd4ef2734878d2efb))


### Refactoring

- Decouple webview initializers for better maintainability ([65892f6](https://github.com/ilanzgx/multistream/commit/65892f6ea0cbd02b16b4e865aad8db678faa69c9))

## [0.9.2] - 2026-03-04

### Bug Fixes

- Single welcome notification for all favorited lives and send i18n keys to rust ([c78b8c6](https://github.com/ilanzgx/multistream/commit/c78b8c6c00cb01d140e07f13b5dc0ff4e940cfc7))


### Features

- Add notification switch button on settings dialog ([51244f4](https://github.com/ilanzgx/multistream/commit/51244f49ffa6598fddc88b52eab10ee63e20456f))

## [0.9.1] - 2026-03-03

### Bug Fixes

- Change AddDialog watch behavior ([9dca5a2](https://github.com/ilanzgx/multistream/commit/9dca5a29cf1ce0f6b7460114e5115cd0a8124b18))

## [0.9.0] - 2026-03-03

### Bug Fixes

- Fallback uf the application bundle doesn't include a default icon ([78309bf](https://github.com/ilanzgx/multistream/commit/78309bfc65a08e4ea74df67a9eefaffb15ca5df3))


### Features

- Style oauth interfaces on settings dialog ([7f0de95](https://github.com/ilanzgx/multistream/commit/7f0de957456b5a3814feb9ea3299a5fdffe95ebb))
- Add notifications when favorite streams go live ([d84d50c](https://github.com/ilanzgx/multistream/commit/d84d50c7b521cb617c70be73369ded68ed88e360))

## [0.8.5] - 2026-02-26

### Features

- Add plugin_single_instance to prevent multiple windows ([3602e7a](https://github.com/ilanzgx/multistream/commit/3602e7ab4c0292940b7dd765f391aa0eed6ec4eb))


### Style

- Improve sidebar toggle button design ([90df2d5](https://github.com/ilanzgx/multistream/commit/90df2d5b0252f20f71f33a3a8c159d15a3a7f0b1))
- Enhance EmptyState interface and update version to v0.8.5 ([64074c5](https://github.com/ilanzgx/multistream/commit/64074c5acf92b6bf76dc22af78688fe20c4629a1))

## [0.8.4] - 2026-02-24

### Bug Fixes

- Repair live favorites issue and update version to v0.8.4 ([711837e](https://github.com/ilanzgx/multistream/commit/711837ef45e9832f0acb08f38d5b9a24fadaf18f))

## [0.8.3] - 2026-02-23

### Bug Fixes

- Responsive main interface and more suggestions ([386fd4f](https://github.com/ilanzgx/multistream/commit/386fd4f4ce59866c87f63751d449ac62b4a0f2ed))
- Create a window manually to set the Chrome user agent and avoid Cloudflare blocks due to false bot detection and update version to v0.8.3 ([c839ddf](https://github.com/ilanzgx/multistream/commit/c839ddf48b3992daad9e50ee454f2aff3148dc22))


### Refactoring

- Decompose App.vue into 4 small components ([fa0efef](https://github.com/ilanzgx/multistream/commit/fa0efef5e93cb2c47c685f8082229731308d2545))


### Style

- User-select text off ([725182d](https://github.com/ilanzgx/multistream/commit/725182d011be554af74ba8a3e8ee49a5ae54edef))

## [0.8.2] - 2026-02-22

### Bug Fixes

- Replace incorrect Kick icon with official version ([2a38d2b](https://github.com/ilanzgx/multistream/commit/2a38d2bc09a64523845a71d81fa25e1de8e2364f))


### Features

- Implement favorites stream system ([1e3399d](https://github.com/ilanzgx/multistream/commit/1e3399d28439b33ab987348337e909b37a9fa8a3))
- Auto-select chat in the first stream opened ([09692e3](https://github.com/ilanzgx/multistream/commit/09692e3a468b7e83bbcaa001b8337a4799118f5e))

## [0.8.1] - 2026-02-18

### Refactoring

- Centralize streams platform configurations ([cb63cb8](https://github.com/ilanzgx/multistream/commit/cb63cb8d3f47a4f1ab31058f31116c6323610a9b))
- Centralize api and translation configurations ([e94be1f](https://github.com/ilanzgx/multistream/commit/e94be1fc48979df9e90f2356bb025eca8bf6704f))


### Style

- Refine dialog layout and section margins and update to v0.8.1 ([6fbc9d6](https://github.com/ilanzgx/multistream/commit/6fbc9d6684beea4d439905cb06ca85597050319a))

## [0.8.0] - 2026-02-16

### Features

- Suggest Kick and Twitch streams when none are added ([52986f1](https://github.com/ilanzgx/multistream/commit/52986f1021f8db11369f8ce56ac591bcaad9c27d))
- Kick suggestions based on language prefix ([a0d1632](https://github.com/ilanzgx/multistream/commit/a0d16320ca4b2bf59f0b48b14cc75de597600416))
- Add twitch suggestions by language; refine kick integration ([5ce18cd](https://github.com/ilanzgx/multistream/commit/5ce18cd1112e08c7c395b56b203be981560ed671))
- Refresh suggestions when change language and update version to v0.8.0 ([9c53077](https://github.com/ilanzgx/multistream/commit/9c5307792045c4e575e43289ae23561380d61487))

## [0.7.3] - 2026-02-12

### Features

- Show recent streams in AddDialog with online/offline fetching ([100b016](https://github.com/ilanzgx/multistream/commit/100b0164264c07e5095d4629b9a15427b024cbb6))


### Style

- Change DialogContent close button to white ([384c80b](https://github.com/ilanzgx/multistream/commit/384c80b246316d8369d32e935dfdb69c4bbd86fa))

## [0.7.2] - 2026-02-12

### Features

- Share and import work as expected, converting custom streams to base64 ([5dc1050](https://github.com/ilanzgx/multistream/commit/5dc105058cc52f53adc026a33bf1ad4b13f981df))

## [0.7.1] - 2026-01-25

### Bug Fixes

- Custom stream content is blocked ([b3746b7](https://github.com/ilanzgx/multistream/commit/b3746b74afe30f10a8fa2701bc3b8163dfc7ea33))

## [0.7.0] - 2026-01-23

### Bug Fixes

- Remove needless borrow in eval to satisfy clippy ([5c817df](https://github.com/ilanzgx/multistream/commit/5c817df773ffcbb666e3eeabc3a9aa800b51b3e2))


### Features

- Some styles improvement: new skeleton loader, add new shadcn components, desktop maximized window and more ([4c54bd4](https://github.com/ilanzgx/multistream/commit/4c54bd4510e11c4c805705a08ffedcfebe657962))
- Custom stream option and bump version to v0.7.0 ([974a72f](https://github.com/ilanzgx/multistream/commit/974a72f45d5083e724e52fc800b5d76b96669735))


### Hotfix

- Add Cargo.lock missing ([42cd744](https://github.com/ilanzgx/multistream/commit/42cd744b0d8d0141b2018997fad0fdbf0436d083))

## [0.6.3] - 2026-01-05

### Bug Fixes

- Skeleton loader text multi-translactions and bump version to v0.6.3 ([83ab19f](https://github.com/ilanzgx/multistream/commit/83ab19fd9068f59af319c81fb36c2dc5efb0f277))

## [0.6.2] - 2026-01-04

### Features

- Add support for cn, de, and ru (AI-generated translations) ([6681f4c](https://github.com/ilanzgx/multistream/commit/6681f4c573ba52e0898c1c99eddb6ab1e2161dc3))

## [0.6.1] - 2026-01-04

### Features

- Update toast translations ([8cedcfd](https://github.com/ilanzgx/multistream/commit/8cedcfd51bcc9dad72d3bcb48052ea1af4473792))

## [0.6.0] - 2026-01-04

### Bug Fixes

- Not running in tauri edge cases ([5a0adbf](https://github.com/ilanzgx/multistream/commit/5a0adbf8f8104e1b1768413d9e6d2fe53a36f500))


### Features

- Add vue-i18n for internationalization ([141193c](https://github.com/ilanzgx/multistream/commit/141193c3e08d9ff4d029b0c68fe2151660d44116))
- Add national flags ([266f229](https://github.com/ilanzgx/multistream/commit/266f22955fcf658ee957992757cf34a6b90eb635))
- Finish multiple languages support and bump version to v0.6.0 ([98e1603](https://github.com/ilanzgx/multistream/commit/98e16032da3d4dff7bb2dfddfe22e3e328a0a851))

## [0.4.11] - 2026-01-02

### Bug Fixes

- Remove useUpdater ref problems and bump version to v0.4.11 ([59dcbb1](https://github.com/ilanzgx/multistream/commit/59dcbb1baf6b47b09bdb9ec4a9f5dca26c4a99e7))

## [0.4.9] - 2026-01-02

### Bug Fixes

- Default.json remote to allow access localhost:* and bump version to v0.4.9 ([cb7b884](https://github.com/ilanzgx/multistream/commit/cb7b884a45a2b2fc8b5fc8ce0ff0e8e86df30e2e))

## [0.4.8] - 2026-01-02

### Debug

- Add devtools temporarily and bump version to v0.4.8 ([a42650d](https://github.com/ilanzgx/multistream/commit/a42650d93d200a500be04d5283a8e8562839e83d))

## [0.4.7] - 2026-01-02

### Bug Fixes

- Update tauri capabilities permissions and manual update button on settings dialog ([f7c379c](https://github.com/ilanzgx/multistream/commit/f7c379c08ea922a91c9fd659770a6dfdc1811b07))

## [0.4.5] - 2026-01-02

### Bug Fixes

- Add isTauri method and bump version to v0.4.5 ([9bd0257](https://github.com/ilanzgx/multistream/commit/9bd02571ccf860f4845cb50570973cac3bc208b5))

## [0.4.3] - 2026-01-02

### Bug Fixes

- It should now generate the builds signatures ([4bb87a1](https://github.com/ilanzgx/multistream/commit/4bb87a17aed86d60b153656d1960cd258fa3f182))

## [0.4.2] - 2026-01-02

### Bug Fixes

- Rewrite release workflow to generate latest.json manually ([712c1a8](https://github.com/ilanzgx/multistream/commit/712c1a85105869bffd56d365caa084abb1e21669))
- Changed directory and added logs ([dc687b6](https://github.com/ilanzgx/multistream/commit/dc687b654c49f12ffd85b9bc13d2f25a44674587))

## [0.4.1] - 2026-01-02

### Bug Fixes

- Update release workflow for auto-updater ([9e95bd2](https://github.com/ilanzgx/multistream/commit/9e95bd2e2c260411f4659edcda7448b3252e0923))

## [0.4.0] - 2026-01-02

### Features

- Add sonner-vue notifications toasts ([2bab8ca](https://github.com/ilanzgx/multistream/commit/2bab8cacb1339f03caf58d88fd854de1540e528c))
- Create settings and share dialogs, and generate share link ([e8aca5e](https://github.com/ilanzgx/multistream/commit/e8aca5ebbc1523dbdfc5426ae69e94945429a6ae))
- Finish shared link implementation ([56d8d57](https://github.com/ilanzgx/multistream/commit/56d8d5702d90c47d1a053c4fd417da3acbbbc720))
- Add tauri auto-updater ([43aeaaf](https://github.com/ilanzgx/multistream/commit/43aeaaf342a1c78590aedd3c2d2bdff2f8122840))


### Style

- Change toast design ([e7db382](https://github.com/ilanzgx/multistream/commit/e7db38298d18bce69612e0911f5b6a1f8c8a6907))

## [0.3.0] - 2025-12-31

### Bug Fixes

- Set env variables on vite for version ([0760c20](https://github.com/ilanzgx/multistream/commit/0760c20d45bdd452fc2946d8ad600a47f26aec8c))


### Features

- Automatic platform detection via URL ([cdae500](https://github.com/ilanzgx/multistream/commit/cdae500c39d8d21bb9f4baec2ac563056d4d95e9))
- Store user preferences state persistently ([300e76b](https://github.com/ilanzgx/multistream/commit/300e76b820f7b6be98dd7228975a70df6768393d))

## [0.2.0] - 2025-12-29

### Documentation

- Update README ([1738492](https://github.com/ilanzgx/multistream/commit/17384920386b6002fda7538891de8036435935e1))
- Update README once again ([0fbeee5](https://github.com/ilanzgx/multistream/commit/0fbeee54be015a29284d14cb664ef0efba8abcfe))


### Style

- Design improvements and version on interface ([b78d3c2](https://github.com/ilanzgx/multistream/commit/b78d3c2e8cab2a461f9baa97a350728c6e05817f))

## [0.1.3] - 2025-12-28

### Bug Fixes

- LocalStorage support for desktop ([677cf31](https://github.com/ilanzgx/multistream/commit/677cf315bca229617e70447737d34c572b1d2b85))

## [0.1.2] - 2025-12-27

### Bug Fixes

- Disable DMABUF renderer on Linux to fix WebKit issues ([5d02751](https://github.com/ilanzgx/multistream/commit/5d027512abebe6d14878386098ba7e8d3b90d327))

## [0.1.1] - 2025-12-26

### Bug Fixes

- Separate release creation from build jobs ([583981e](https://github.com/ilanzgx/multistream/commit/583981ee992657717b040f8994c9b40d3f3f04c7))

## [0.1.0] - 2025-12-26

### Bug Fixes

- Reset selected chat state ([11c2a59](https://github.com/ilanzgx/multistream/commit/11c2a59976bea4e215d9dea2d49332447299ee90))
- Hide chat button and tooltips are now working properly ([1946672](https://github.com/ilanzgx/multistream/commit/19466724772d9d503b4e820cf9b72f93eb4709b1))
- Correct tauri-action version to v0 ([cd55133](https://github.com/ilanzgx/multistream/commit/cd551334a1eef6f35d3e67f23916b746560efbc1))


### Features

- Add tailwindcss and shadcn/ui ([f86cb3c](https://github.com/ilanzgx/multistream/commit/f86cb3c68fa709c9ffafb23e440b305a6d84ce68))
- Kick iframes components ([8700483](https://github.com/ilanzgx/multistream/commit/87004837a6fd10b675e77037925b8ab117c7248c))
- Initial main interface ([ccd3e9f](https://github.com/ilanzgx/multistream/commit/ccd3e9fec7b9fe3d3cfdb25017f088b78f9c3235))
- Create AddStreamDialog ([8beae79](https://github.com/ilanzgx/multistream/commit/8beae79d5f4333559d84c14cd34632364bd08ee0))
- Create useStreams composable to manage localStorage data ([38a9ec3](https://github.com/ilanzgx/multistream/commit/38a9ec3e989971c9576c605d16f98b8f9cb60698))
- Remove stream button ([425d1be](https://github.com/ilanzgx/multistream/commit/425d1beeaaaba5bef472927076ab20daa0758ebd))
- Add tooltip for bottom buttons ([c855ae7](https://github.com/ilanzgx/multistream/commit/c855ae7a554f3d1aff27449c01b88ecca21a6b1d))
- Twitch iframes components ([6bb001d](https://github.com/ilanzgx/multistream/commit/6bb001dc525bd2bd4a2562fcf507fedf7a68be46))
- Youtube iframes components ([7baa479](https://github.com/ilanzgx/multistream/commit/7baa4793a43a74dc82cd11a7566890bc532a3536))
- Stream custom skeleton loaders ([7d0585f](https://github.com/ilanzgx/multistream/commit/7d0585f734d193f1e42db9e6047cde80fc63f483))
- Platforms icons and skeleton loaders improvements ([efea0ca](https://github.com/ilanzgx/multistream/commit/efea0caec28803f41a575005c04cadbfd92848e0))
- Integrate Tauri v2 for desktop support ([0b1cefc](https://github.com/ilanzgx/multistream/commit/0b1cefcc3956474db27b6e8d184729779817cbb2))


### Refactoring

- HandleAddStream function to recognize URLs ([a1467ee](https://github.com/ilanzgx/multistream/commit/a1467ee2b182506199825c5b08c687837ec29d6e))
- Compose stream and chat components ([5d150da](https://github.com/ilanzgx/multistream/commit/5d150da9d42e484e3f7df5bd300cfd20699364e2))


### Style

- Sidebar style improvements ([1ba522a](https://github.com/ilanzgx/multistream/commit/1ba522a235eaeff0064b755519588ff6792740ef))


