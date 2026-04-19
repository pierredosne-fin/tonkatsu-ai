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
