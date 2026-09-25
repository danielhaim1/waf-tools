# Contributing to WAF Tools

Corrections, new detections, and exporter improvements are welcome. Explain the behavior you are changing and provide evidence. A matching pattern is an indicator, not proof that a request is malicious.

## Run locally

Use Node.js 22 or newer (Node 24 is the recommended version in `.nvmrc`).

```sh
npm ci
npm start
```

Open http://localhost:3000. Opening `src/index.html` as a file does not provide the generated catalog endpoint.

## Make a change

1. Edit the canonical JSON in `data/rules/`. See [the ruleset guide](data/README.md).
2. For a new rule or a change to detection/action, add `tests/fixtures/<rule-id>.json` with matching and nonmatching examples. The existing `.key` fixture also records a known false positive.
3. Explain evidence, application context, and false-positive risk in the PR template. Include sensitive examples only after sanitizing them.
4. Add a brief entry under `Unreleased` in `CHANGELOG.md`.
5. Run `npm run check`, then inspect the relevant UI and generated output.

Example fixture (use the real rule ID and actual field contents):

```json
{
  "ruleId": "example-internal-status-path",
  "cases": [
    { "input": "/internal/status", "matches": true, "reason": "Exact endpoint." },
    { "input": "/public/status", "matches": false, "reason": "Public endpoint is unrelated." }
  ]
}
```

`input` is the value of the rule's declared request component, not a full HTTP request. Tests apply the declared literal matching semantics. A legitimate request that currently matches should be recorded as `matches: true` with its false-positive explanation, not disguised as a passing negative example.

Existing rules without fixtures are a known backlog. PR checks require fixtures for new rules and changes to detection or action. Deleted rules must also have obsolete fixtures removed. Metadata-only changes still need review, but do not require a new fixture.

## What the checks prove

- `npm run validate`: loads every canonical rule document and checks structure and current Cloudflare mapping support.
- `npm test`: checks catalog invariants, selection behavior, detection examples, exporter output/escaping, unsupported cases, and publication boundaries.
- `npm run lint`: checks JavaScript for common errors.
- `npm run build`: creates the public site and catalog under `dist/`.
- `npm run test:build`: checks version/checksum consistency, deployment URL metadata, referenced assets, and ES5 bundle syntax.
- `npm run check`: runs all of the above in order.

CI runs on Node 22 and 24. Counts are derived from the catalog; adding a valid rule does not require changing a baseline count.

These checks do not validate configurations against Cloudflare/AWS/Azure accounts or run NGINX, ModSecurity, HAProxy, or Caddy. Before calling an exporter production-ready, test its configuration in the target engine and replay representative legitimate and matching requests. Report the engine version and results, or explicitly say it was not tested.

For UI changes, check a narrow mobile viewport, keyboard-only navigation, Show more focus behavior, selection, generation, copy, and download. No browser-testing dependency is required by this project yet.

## Review and publication

Maintainers review changes before merging. Pull requests run checks on Node 22 and 24.
Once GitHub Pages is configured, pushes to `main` also check, build, and deploy `dist/`.
See the [build and Pages setup](README.md#build-and-github-pages) for configuration and site visibility.

Licensing is pending. Resolve the code and data licenses before inviting external contributions or publishing the repository. Never commit material that must remain private: the build allowlist does not hide files in a public Git repository.

The browser receives one classic ES5 script, compiled with Babel and bundled with esbuild. Source files remain vanilla JavaScript modules. The build checks ES5 syntax with Acorn and bundles language polyfills plus fetch. ES5 syntax alone does not guarantee full Internet Explorer support: CSS and DOM APIs still require browser-specific validation.
