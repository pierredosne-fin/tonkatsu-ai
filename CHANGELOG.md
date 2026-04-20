# [1.2.0](https://github.com/pierredosne-fin/tonkatsu-ai/compare/v1.1.2...v1.2.0) (2026-04-20)


### Bug Fixes

* configure gh CLI for SSH protocol alongside ~/.ssh/id_rsa setup ([ad92f02](https://github.com/pierredosne-fin/tonkatsu-ai/commit/ad92f027bfa0bacdd41e56eeb35d0aedabf8ce50))
* initialize SOUL.md, OPS.md, TOOLS.md for new and existing templates ([ed4ec80](https://github.com/pierredosne-fin/tonkatsu-ai/commit/ed4ec80be1ca3720f0763a9987322bd15a4e6bd5))
* initialize SOUL.md, OPS.md, TOOLS.md for new and existing templates ([73adcdf](https://github.com/pierredosne-fin/tonkatsu-ai/commit/73adcdfc3d5a8b4d3d0d7bdd2884547fb353b35d))
* install git and openssh-client in Docker runtime image ([105d5a7](https://github.com/pierredosne-fin/tonkatsu-ai/commit/105d5a728ff647aebe93572370e6183fd634ca8e))
* serve frontend from Express and fix CORS/socket for production ([89a4c03](https://github.com/pierredosne-fin/tonkatsu-ai/commit/89a4c0398afd9b70f01e019f2c01d6af48ebb7d0))
* serve frontend on 5173 and backend on 3001 as separate processes ([22d92f4](https://github.com/pierredosne-fin/tonkatsu-ai/commit/22d92f4c5addf8b7372f31dfa869f5c7462e7997))
* single process — Express serves frontend + API on port 5173 ([71b409d](https://github.com/pierredosne-fin/tonkatsu-ai/commit/71b409d57617048224d54ff1ed231e61772cdfbc))
* update baseUrl to match new repo name tonkatsu-ai ([e916760](https://github.com/pierredosne-fin/tonkatsu-ai/commit/e916760a02869bb65cc79947b743510d0251fb58))
* use useBaseUrl/require for image paths — fixes rendering on GitHub Pages ([23a9956](https://github.com/pierredosne-fin/tonkatsu-ai/commit/23a9956378fa126858627400c5ae5b2d948d2711))
* wrap POST /api/agents in try-catch to surface actual errors in CI ([7e47531](https://github.com/pierredosne-fin/tonkatsu-ai/commit/7e47531bab43077cc4e8b881acc7ce00427976c1))


### Features

* add Dockerfile and fix TS build errors ([e566133](https://github.com/pierredosne-fin/tonkatsu-ai/commit/e566133ab77476d95b4e6ad7b476cc1d8e315e3c))
* add Generate/Improve buttons for SOUL.md, OPS.md, TOOLS.md ([df8bfb6](https://github.com/pierredosne-fin/tonkatsu-ai/commit/df8bfb614adcfcb3e7493c9f5cf1380fc96c430a))
* add gh, gcloud, and bq to Docker runtime image ([28e5b22](https://github.com/pierredosne-fin/tonkatsu-ai/commit/28e5b2263d60ea77771e880c345a51f589e67fd2))
* add manual release workflow (semantic release + docker + docs) ([5a36e45](https://github.com/pierredosne-fin/tonkatsu-ai/commit/5a36e45b6c5621221b8d02d15481d0dde3e9b9b3))
* add pixel snow canvas animation to hero section ([ee6fea8](https://github.com/pierredosne-fin/tonkatsu-ai/commit/ee6fea89d283240b4886a67b67f1faedd601ebf5))
* add SOUL.md, OPS.md, TOOLS.md editing to agent and template UI ([38b3095](https://github.com/pierredosne-fin/tonkatsu-ai/commit/38b30955e9cac6f0f7f34d2df31b10736ca4dc7b))
* auto-install global SSH key as ~/.ssh/id_rsa for agent git/gh access ([77b9183](https://github.com/pierredosne-fin/tonkatsu-ai/commit/77b91833064b415cbd08cbfc151d319b889dc430))

## [1.1.2](https://github.com/pierredosne-fin/data-platform-tonkatsu/compare/v1.1.1...v1.1.2) (2026-04-19)


### Bug Fixes

* set correct baseUrl and url for GitHub Pages deployment ([8f1dde4](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/8f1dde4c936984ba55e3adfe9ea52e19d6a4e896))

## [1.1.1](https://github.com/pierredosne-fin/data-platform-tonkatsu/compare/v1.1.0...v1.1.1) (2026-04-19)


### Bug Fixes

* trigger docs deploy on any push to main, remove paths filter ([013be89](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/013be89d7e5cc64062d07b737dc15b1ec370ea2f))

# [1.1.0](https://github.com/pierredosne-fin/data-platform-tonkatsu/compare/v1.0.1...v1.1.0) (2026-04-19)


### Features

* add Docusaurus build and GitHub Pages deploy workflow ([98216f9](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/98216f9864bfbec5ad896fa732e04b7b7a8c9f03))

## [1.0.1](https://github.com/pierredosne-fin/data-platform-tonkatsu/compare/v1.0.0...v1.0.1) (2026-04-19)


### Bug Fixes

* add docker/setup-buildx-action to enable GHA cache in release CI ([0b4ed50](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/0b4ed504183fae4d87db20579c6ae9ee48bf2232))

# 1.0.0 (2026-04-19)


### Bug Fixes

* add docker/setup-buildx-action to enable GHA cache in develop CI ([45607da](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/45607da86d534961747bbe5ea5bda859c2f5bcbb))
* also downgrade react-hooks/refs to warn for react-hooks v7 compatibility ([48fb56b](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/48fb56ba1737cabb6d52b86d1ca9741ec832dc69))
* downgrade react-hooks/set-state-in-effect to warn for react-hooks v7 compatibility ([aca6a5c](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/aca6a5cc84b8dd95d192320e6a4ca4619d305c9d))
* guard agent.name access in ChatModal handleDelete (TS18048) ([d897c49](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/d897c4956477aa1a49823827106fda7609095668))
* guard agent.repoUrl before snapshotWorkspace call (TS2345) ([af76ccd](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/af76ccdeb87975b10e598ddd6ad76929269ceca3))
* revert package.json to avoid lock file mismatch; use extra_plugins in release action ([3437168](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/3437168542f16d3575a80feefcf0b1827cc45cb3))
* update GitHub repo links to correct repository ([2a73d8f](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/2a73d8f24e0088b1e9c51b44bbcf6a167a8059df))


### Features

* add full CI/CD pipeline with semantic versioning and Docker builds ([d90e58d](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/d90e58dcbb5d25de3b30074922ea5de998bbecaf))
* release first version ([c6a78ea](https://github.com/pierredosne-fin/data-platform-tonkatsu/commit/c6a78ea6f494ed3ab8e9acca6d470c5853f04066))
