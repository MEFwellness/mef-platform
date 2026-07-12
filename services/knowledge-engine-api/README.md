# knowledge-engine-api

**Status: scaffold only. Not implemented in Sprint 1.**

Per Architecture v2.1 Section D, this service will own:

- Retrieval over `mef_method_content_versions`
- LLM orchestration (the only service permitted to call a model provider)
- Narrating pre-selected `prioritized_insights` rows

Sprint 1 explicitly excludes AI orchestration and the Pattern Engine. This
directory exists so the repository structure matches the target
architecture from day one, per the monorepo's stated goal of "every future
product depends on the same foundation" — nothing here should be built
until the sprint that introduces the Pattern Engine and Method content
repository.
