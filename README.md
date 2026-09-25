# WAF Tools

A collection of WAF rules and a tool for browsing, selecting, and exporting them. It covers things like exposed configuration files, SQL injection, path traversal, and known exploit patterns.

Pick the rules that make sense for your application, inspect what they match, and generate the output. You can start with a preset or build your own selection, with search and filters to narrow things down.

## Using it

Choose an **export format**, select your rules, and generate the output. Copy the result or download it. Presets help you start with a selection; each rule includes its pattern and risk information.

## Export formats

| Target           | What you get                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Cloudflare       | Custom WAF expressions, grouped by action. Log requires Enterprise.                             |
| NGINX            | Block-only configuration snippets.                                                              |
| ModSecurity 3    | Block and log rules, with stable IDs and a configurable ID range.                               |
| HAProxy          | Block-only HTTP ACLs.                                                                           |
| Caddy            | Block-only request matchers.                                                                    |
| AWS WAF          | WAFv2 API rule definitions. Log rules become Count rules; logging needs separate configuration. |
| Azure Front Door | Custom rules for query strings and User-Agent. Path matching is not supported yet.              |
| JSON             | Selected pattern strings only, without catalog metadata.                                        |
| CSV, plain text  | Rule data for integrations, security reviews, and auditing.                                     |

The new server and cloud exporters are experimental and have not been validated against their target runtimes. These are configuration exports, not automatic deployments.

Compatibility is checked before generation. If some selected rules cannot be exported, you can explicitly export the compatible rules and download a report of the exclusions. Review the output before deploying—what makes sense for one application may block legitimate traffic on another.

## Routers and network firewalls

There are no native exports for ASUS routers, OpenWrt, pfSense, or other router firewalls yet. This collection matches HTTP request content; router blocklists based on IP addresses, ports, or domains need different source data and exporters. Plain-text output is an audit list, not a router import file.

## Contributing

New rules, corrections, better descriptions, and exporters are welcome. If you're adding or changing a rule, explain what it catches and where it might cause false positives.

To run locally, use Node.js 22 or newer and run `npm start` from the project directory, then open [localhost:3000](http://localhost:3000).

See [Contributing](CONTRIBUTING.md) for setup, detection examples, and tests, and [Maintaining the ruleset](data/README.md) for the rule format. Run `npm ci` and `npm run check` before submitting changes.

## Versions

The app and catalog are versioned together using Git tags. See the [changelog](CHANGELOG.md). This is a website and ruleset collection, not an npm package.

## License

Code and rule-data licenses are awaiting a maintainer decision. Publication is blocked until they are selected; third-party asset notices are in `docs/licenses/`.

## Maintainer

Maintained by [Daniel Haim](https://github.com/danielhaim1).
