# Maintaining the ruleset

This is an authored collection. The JSON files in this directory are the source of truth; there is no upstream feed, scheduled synchronization, or Markdown importer. Contributors add and revise rules here through reviewed changes.

## Where to edit

| File                           | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `categories.json`              | Category IDs, display names, descriptions, ordering, and enabled state |
| `rules/<category-id>.json`     | Category metadata and its ordered `rules` array                        |
| `../src/assets/js/catalog.js`  | Shared catalog validation                                              |
| `../src/assets/js/generate.js` | Supported Cloudflare generation behavior                               |
| `../tests/builder.test.js`     | Catalog, selection, and generation tests                               |

The loader discovers every `.json` file directly inside `rules/`, in filename order. It does not scan subdirectories. Keep templates and notes outside that directory. Each file must contain `schema_version: 1`, a `category` object with an ID registered in `categories.json`, and a `rules` array.

Do not edit `dist/data/catalog.json`: the build replaces it. The files in `../docs/archive/` are historical migration reports, not inputs to the application.

## Add a rule

1. Choose an existing category and append a rule to its `rules` array. Preserve the order of unrelated rules.
2. Give it a unique, descriptive ID using lowercase letters, digits, and single hyphens, such as `example-internal-status-path`. Rule IDs must be unique across the entire collection.
3. Define the exact request component, match type, and literal pattern. Check the supported mappings below.
4. Explain the detection, legitimate uses, and expected false positives in `notes`. Include supporting references and applicability information where available.
5. Assess severity, confidence, false-positive risk, and action explicitly. Do not copy another rule's risk ratings or recommendation flags without reviewing them.
6. Run the checks and inspect the rule in the browser before submitting it.

This illustrative rule shows the structure. It is not a recommendation to add or block this endpoint:

```json
{
  "id": "example-internal-status-path",
  "name": "Example internal status endpoint",
  "detection": {
    "location": "path",
    "match": "exact",
    "pattern": "/internal/status",
    "case_sensitive": true,
    "decoding": {
      "url_decode": false,
      "html_entity_decode": false
    }
  },
  "implementations": {
    "cloudflare": {
      "field": "http.request.uri.path",
      "operator": "eq"
    }
  },
  "risk": {
    "severity": "medium",
    "confidence": "medium",
    "false_positive_risk": "high"
  },
  "action": {
    "recommended": "log"
  },
  "applicability": {
    "platforms": ["custom-application"],
    "operating_systems": ["any"],
    "web_stacks": ["generic"],
    "requires": ["Application exposes this endpoint"]
  },
  "references": {
    "cves": [],
    "cwes": [],
    "external": []
  },
  "tags": ["diagnostic", "example"],
  "notes": "Illustrative endpoint match. Legitimate health checks may use this path; a match alone does not establish an attack.",
  "ui": {
    "default_selected": false,
    "recommended": false
  }
}
```

Use JSON escaping when writing patterns: a literal backslash is `\\`, and a literal double quote is `\"`. The exporter preserves the parsed string; do not pre-escape it for Cloudflare. Do not substitute a regex for a literal substring.

## Supported detection and actions

| `detection.location` | Cloudflare `field`       |
| -------------------- | ------------------------ |
| `path`               | `http.request.uri.path`  |
| `query`              | `http.request.uri.query` |
| `full_uri`           | `http.request.full_uri`  |
| `user_agent`         | `http.user_agent`        |

| `detection.match` | Cloudflare `operator` | Meaning                                |
| ----------------- | --------------------- | -------------------------------------- |
| `exact`           | `eq`                  | The entire field equals the pattern    |
| `contains`        | `contains`            | The field contains the literal pattern |

The current exporter supports only `case_sensitive: true`, both decoding flags set to `false`, and recommended actions `block` or `log`. Cloudflare implementation metadata, when present, must agree with canonical detection. A selected rule with unsupported semantics or conflicting metadata stops the entire export; it is not silently skipped. Extending these capabilities requires a generator change and corresponding tests.

Severity accepts `critical`, `high`, `medium`, or `low`. Confidence and false-positive risk each accept `high`, `medium`, or `low`. Severity describes potential impact; confidence describes the evidence behind the detection; false-positive risk describes the likelihood of matching legitimate traffic.

The two `ui` flags influence the Balanced preset. Setting them to `false` does **not** guarantee a rule stays unselected: presets also consider risk and action, and Aggressive includes every enabled rule. Medium or high false-positive risk produces the UI's review indicator. There is currently no per-rule draft or disabled flag, so keep unfinished candidates outside `rules/`.

## Update or remove a rule

Keep an existing ID when correcting the same detection. Create a new ID for a distinct detection; never reuse a retired ID for unrelated behavior. Selection persistence uses these IDs, so renaming one also changes how saved selections are restored.

Review changes to match type, case sensitivity, encoding, action, and recommendation flags as behavior changes. Explain why they are needed and what legitimate requests could be affected. Check for equivalent patterns in other categories, but do not remove a rule solely because its pattern text matches another: location and other detection semantics may differ.

Remove obsolete rules deliberately and explain the reason in the contribution. If removing a category, remove or move its rules as well. Setting a category's `enabled` value to `false` excludes its rules from the UI and export without deleting their source data.

## Add a category

Create `rules/<category-id>.json` with the same wrapper as an existing category file. Register the same ID in `categories.json`, including its `name`, `description`, `group`, `enabled`, and numeric `order`.

Keep category metadata consistent between both files. The UI uses the registry in `categories.json` for category labels and ordering; changing only the name in a rule file does not rename the category in the UI. Rules within a category retain their array order.

## Validate and preview

Run these commands from the repository root with Node 22 or newer:

```sh
npm test
npm run build
npm start
```

Run `npm ci` first to install the build tools. The build validates catalog structure and writes the static site to `dist/`. The tests also attempt generation for the enabled catalog and check expression splitting, literal preservation, action grouping, and selection behavior.

Tests derive catalog counts dynamically. New rules should not require changing fixed count assertions.

The local server defaults to port 3000. If occupied, use `PORT=3001 npm start`. It rereads the catalog on refresh; no rebuild is needed during source preview. Reselect a preset when checking its new defaults, because the browser remembers the exact selection from the current session.

In the browser, search for the new rule, inspect its pattern and metadata, select it, and generate its expression. Check the listed action and literal text. For each changed detection, include an intended matching example and a legitimate nonmatching example in the contribution. Add matching and nonmatching field examples in `tests/fixtures/<rule-id>.json`; `npm test` executes them. See [Contributing](../CONTRIBUTING.md) for the format and CI requirements. This is literal field matching, not a full HTTP replay harness. Passing local checks does not validate expressions against Cloudflare's API or establish their detection quality.

Optional development checks require `npm ci` followed by `npm run lint`. For data formatting, run Prettier only on the JSON files you changed to avoid unrelated formatting churn.

## Submit and publish

In a contribution, describe the rule's purpose, evidence or source references, matching and nonmatching examples, false-positive considerations, and any change to default selection. Include the checks you ran and review the diff for accidental ID, ordering, or pattern changes.

The pipeline is:

```text
Authored JSON → validation and examples → public-field allowlist → approved catalog → UI selection → exports
```

After review, version and approve the public catalog, then deploy its tag through GitHub Pages. There is no automatic installation into a firewall; deployed firewall configurations must be updated separately.
