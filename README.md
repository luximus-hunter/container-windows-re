# Container Windows RE

A Firefox extension that groups container tabs into dedicated browsing windows while excluding windows positively detected as apps.

By **Thomas Lipman** · Package: `container-windows-re`

Version **1.0.0** · Firefox **148+** · [MIT licence](LICENCE)

Container Windows RE is based on **Container Windows 1.3 by JM**. The MIT licence credits Thomas Lipman for this version and retains the upstream copyright notice. The extension ID remains:
`{572d2b62-7dda-4e5e-b71f-e6480f4bd5cd}`. Disable the original extension while using this fork so its separate router cannot interfere. Settings from the original extension are not imported.

## Get started

Build the extension with Node.js **22.18+** and pnpm **12.18.0**:

```sh
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm run check
```

In Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `build/extension/manifest.json`.
3. Accept website access in Firefox’s installation prompt. If access is missing, the extension opens its preferences in `about:addons`; select **Allow website access** there.
4. Choose which containers should group in the **Containers** section.
5. Reopen settings through `about:addons` → **Container Windows RE** → **Preferences**. The extension has no toolbar action.

Automatic grouping and newly discovered containers are enabled by default. Temporary add-ons must be loaded again after Firefox restarts. Installation, updates, removal and signing instructions are below.

**Load the generated manifest in `build/extension`, not `src/manifest.json`.** Source pages reference TypeScript and require the build step.

## How grouping works

When a new tab opens in an enabled container, the extension looks for a compatible window dedicated to that container. It prefers the container's remembered home; otherwise, it selects the eligible dedicated window with the lowest ID. A destination containing a tab from any other container is excluded, including default and disabled containers.

If no destination is available and the source contains other containers, the extension moves the tab into a new regular browsing window. A source already dedicated to that container can stay in place. The original tab is moved rather than recreated from its URL.

| Window or tab state                   | Grouping behavior                              |
| ------------------------------------- | ---------------------------------------------- |
| Regular browser window                | Eligible                                       |
| Unknown display mode                  | Eligible, subject to initial-window protection |
| Positively detected app tab or window | Excluded                                       |
| Paused window                         | Excluded                                       |
| Private or non-normal window          | Excluded                                       |
| Default or disabled container tab     | Not routed                                     |
| Initial tab of a newly opened window  | Never routed automatically                     |

### Initial-window protection

An app window can open before Firefox exposes its app display mode. To protect app launches, the initial tabs of every newly opened window stay in place automatically, including ordinary browsing windows. Later container tabs opened in an existing eligible window can group normally.

Initial-window protection survives a background restart through tab session markers. **Group existing tabs now** can move a protected initial tab only when that tab positively reports regular-browser mode. Visit an inspectable website first if an initial tab needs to be consolidated.

### Settings controls

- **Automatic grouping** enables or disables routing globally.
- **Pause grouping in this window** excludes the current window until resumed or the browser session ends.
- **Group existing tabs now** consolidates a snapshot of eligible tabs across windows. It reports moves, created windows, skips, deferred checks and errors.
- **Containers** controls which containers participate.
- **Diagnostics** shows the loaded version, current state, container preferences, last routing decision and errors.

Enabling grouping, resuming a window or granting website access does not rearrange existing tabs. Use **Group existing tabs now** for those. The last batch result remains available when settings are reopened during the same background lifetime.

## App detection and privacy

Detection runs a small isolated script in top-level page contexts. It checks `document.readyState` and CSS `display-mode` media queries:

- `minimal-ui`, `standalone` or `window-controls-overlay` means **app**.
- A completed document reporting `browser` provides **regular-browser** evidence.
- Missing access, restricted pages, timeouts or inconclusive results mean **unknown**.

Any positive app result excludes the whole window. Loading or discarded probes cannot establish regular-browser status, but positive app evidence is retained. A readable regular document can establish browser mode even if another tab is a restricted internal page. URLs, titles, window geometry and tab count are not used to classify apps.

**Unknown windows participate in grouping.** An app whose display mode cannot be read may therefore have tabs moved into or out of it. Website access improves detection; it does not guarantee exclusion of every app.

| Permission             | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `contextualIdentities` | Read containers and react to container creation/removal    |
| `sessions`             | Mark seen tabs and protect initial-window tabs             |
| `storage`              | Save preferences, pauses and remembered container homes    |
| `scripting`            | Run the display-mode query                                 |
| HTTP/HTTPS host access | Allow the query on websites; requested during installation |

The implementation does not read page content, send network requests or transmit diagnostics. No native helper is required. HTTP/HTTPS access is declared in `host_permissions`, so Firefox includes it in the normal installation prompt. On installation, re-enabling the extension, browser startup, temporary reload or background-script initialization, the extension immediately checks access and opens its embedded `about:addons` preferences if access is missing. If access has already been granted, no setup page opens. Firefox still lets users revoke website access; preferences remain available from `about:addons`.

Firefox requires [`permissions.request()` to run from a user action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request), so a background script cannot directly show a native runtime permission prompt. The settings page's **Allow website access** button supplies the required click. Host access is never silently granted.

## Session behavior and limits

Container preferences and the global automatic setting persist in local extension storage. Per-window pauses and remembered window IDs use session storage and are reconciled when the background starts; a full browser restart clears them.

Routing is serialized. Seen/startup/restored tabs are baselined rather than replayed, and in-memory deferred requests are lost on background restart. Third-party restoration tools that create new unmarked tabs can look like ordinary tab creations; disable automatic grouping before using those tools if needed.

The router checks display modes, tab membership, location, preferences and pause state again before moving. Firefox does not provide an atomic conditional move: navigation, app conversion or closure can still race the final check. Moving the last tab can close its source window. Native API failures are reported without retrying the failed operation.

The extension moves the existing tab without changing its container, recreating its URL or explicitly changing its pin state. Actual pin/history preservation, permission prompts and Taskbar Tabs launch/conversion timing still require live browser testing.

## Development

Application code, build configuration and the packaging tool use strict TypeScript.

| Tool                                                          | Role                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript                                                    | Strict static checking with `tsc --noEmit`           |
| Vite 8                                                        | Build settings page and background entry             |
| Rolldown and Oxc                                              | Bundling and TypeScript transformation through Vite  |
| tsdown                                                        | Bundle the Node packaging tool using Rolldown        |
| Oxlint                                                        | Lint source                                          |
| [Oxfmt](https://oxc.rs/docs/guide/usage/formatter/quickstart) | Format source, configuration, HTML and documentation |
| web-ext                                                       | Validate the generated Firefox extension             |

### Commands

| Command                 | Action                                                  |
| ----------------------- | ------------------------------------------------------- |
| `pnpm run dev`          | Watch and rebuild extension assets                      |
| `pnpm run build`        | Build the extension and packaging tool                  |
| `pnpm run format`       | Apply Oxfmt formatting                                  |
| `pnpm run format:check` | Check formatting without rewriting files                |
| `pnpm run typecheck`    | Check TypeScript types                                  |
| `pnpm run lint`         | Run Oxlint, type checking, build and Firefox validation |
| `pnpm run package`      | Build and create the unsigned ZIP and checksum          |
| `pnpm run check`        | Run formatting checks, lint and packaging               |

During development, keep `pnpm run dev` running and reload the temporary extension from Firefox's debugging page after changes. The extension uses local built assets; no development server is required. Changes to copied static assets or build configuration may require restarting the watcher or running `pnpm run build`.

Oxfmt covers all project JSON, TypeScript, HTML and Markdown files, including hidden JSON
configuration files. The pnpm-generated lockfile is automatically
excluded by Oxfmt. Settings live in `.oxfmtrc.json`; generated output, dependencies and original signatures are excluded. Oxlint settings live in `.oxlintrc.json`.

### Project layout

```text
src/
  background.ts        Firefox event listeners and message dispatch
  router.ts            Grouping decisions, queue and lifecycle state
  display-mode.ts      Injectable display-mode query and probes
  common.ts            Shared container and storage helpers
  types.ts             Browser snapshots and routing/state types
  settings-controls.ts Grouping controls, access request and diagnostics
  permissions.ts       Shared website-access and startup setup flow
  options.ts / options.html
                       Settings page and per-container preferences
  manifest.json        Source Firefox manifest
  app-window.svg       Lucide App Window extension icon
vite.config.ts         Extension build and static asset copying
tsdown.config.ts       Node packaging-tool build
scripts/package.ts     ZIP and SHA-256 generation
build/extension/       Generated extension to load in Firefox
build/tools/           Generated Node packaging tool
dist/                  Unsigned ZIP and checksum
```

## Install, update and remove

### Temporary installation and updates

Disable the original **Container Windows** in `about:addons` while using this extension. After building, load `build/extension/manifest.json` from **Load Temporary Add-on** in `about:debugging#/runtime/this-firefox`.

To update a temporary installation, run `pnpm install --frozen-lockfile` and `pnpm run check`, then click **Reload** beside **Container Windows RE** in `about:debugging`. If the temporary entry disappeared, load the generated manifest again. Confirm the name and version on the settings page. Existing preferences are retained under the same extension ID; previously disabled automatic grouping or containers remain disabled. Existing tabs stay in place unless you select **Group existing tabs now**.

Per-window pauses may clear on reload and clear on a full browser restart. Global grouping and container choices persist. A full restart also clears remembered window IDs; startup baselining prevents restored tabs from being regrouped automatically.

### Permanent installation and signing

Release Firefox requires a signed extension. Keep signature enforcement enabled.

1. Build with `pnpm install --frozen-lockfile` and `pnpm run check`, and verify behavior in a disposable Firefox profile.
2. Sign in to the [AMO Developer Hub](https://addons.mozilla.org/developers/). For a public addons.mozilla.org listing, submit a new add-on and choose **On this site**. Use **On your own** only for self-distribution. If updating a previously submitted version of this fork, use that existing listing.
3. Upload `dist/container-windows-re-1.0.0-unsigned.zip`. Keep the existing extension ID `{572d2b62-7dda-4e5e-b71f-e6480f4bd5cd}` for updates.
4. If Mozilla requests source, provide `src/`, `scripts/`, build and formatter/linter configurations, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, README and LICENCE. The TypeScript source is transformed and bundled; include the Node version and `pnpm install --frozen-lockfile` / `pnpm run build` instructions. Exclude `node_modules`, generated `build`/`dist` and original `META-INF` signatures.
5. Address review requests and download the signed XPI. Local validation does not guarantee approval.
6. Remove the temporary copy, then open `about:addons` → gear menu → **Install Add-on From File…** and select the signed XPI.
7. Grant website access from the startup settings page if requested.

For later releases, increment both `src/manifest.json` and `package.json` versions, run `pnpm install --lockfile-only` and `pnpm run check`, then submit the new ZIP to the same listing. Install the signed update from file. Automatic self-distribution updates are not configured.

See [Mozilla's signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) for the distribution process.

### Disable or remove

To stop routing, open preferences in `about:addons` and select **Disable automatic grouping**. Website access can be revoked in the extension's Permissions tab in `about:addons`; unknown windows still participate in grouping when automatic grouping is enabled.

Remove a temporary installation through `about:debugging` or by exiting Firefox. Remove a signed installation through `about:addons` → **Container Windows RE** → three-dot menu → **Remove**. Removing the extension stops routing but does not undo earlier tab moves. Re-enable the original extension only after this one is disabled or removed.

## Packaging and verification

`pnpm run package` writes:

```text
dist/container-windows-re-1.0.0-unsigned.zip
dist/container-windows-re-1.0.0-unsigned.zip.sha256
```

Vite cleans and regenerates `build/extension`, rewrites HTML references and copies the manifest, icon and licence. The packager archives only generated extension files with sorted paths and fixed timestamps. Build tools, TypeScript sources, dependencies and the extracted original `META-INF` signatures do not ship. The MIT licence credits Thomas Lipman and retains JM's upstream notice. The extension ID is unchanged so existing installations can update.

The ZIP is unsigned. Build and validation commands do not install, sign, submit or publish the extension or change Firefox settings.

## Icon attribution

The extension uses the [App Window icon](https://lucide.dev/icons/app-window) from
[Lucide](https://lucide.dev/), copyright © 2026 Lucide Icons and Contributors,
under the [ISC licence](LUCIDE-LICENSE). Its SVG is stored locally in
`src/app-window.svg`; the Lucide licence is included in the packaged extension.

## GitHub builds, releases and AMO publishing

The workflow in `.github/workflows/release.yml` runs on pushes, pull requests and manual dispatch. It installs locked dependencies, runs `pnpm run check`, and uploads a build artifact containing the unsigned extension ZIP, a ZIP of the committed source and both SHA-256 checksums.

A version tag such as `v1.0.0` also creates a public GitHub release with those files. Package and manifest versions must agree; the pnpm lockfile must be up to date, and the tag must be `v` followed by that version. GitHub's automatically provided `GITHUB_TOKEN` publishes release assets; no personal access token is needed for the workflow.

### One-time repository setup

1. Push this project to your GitHub repository, including `.github/workflows/release.yml` and `amo-metadata.json`.
2. In the repository, open **Settings → Actions → General** and ensure GitHub Actions and the official `actions/*` actions are allowed. The release job explicitly requests `contents: write`.
3. Sign in to the [AMO Developer Hub](https://addons.mozilla.org/developers/), complete the developer account requirements, and generate [AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/).
4. In GitHub, open **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Add:
   - `WEB_EXT_API_KEY`: Mozilla's JWT issuer/API key.
   - `WEB_EXT_API_SECRET`: Mozilla's JWT secret/API secret.
     Do not put either value in source files, workflow YAML or Git commits.
5. Review `amo-metadata.json`: it supplies the public summary, Tabs category, MIT licence and source/build notes for reviewers. The manifest supplies the extension name and stable ID. If this ID is already registered on AMO, your API credentials must belong to an account that can update it.
6. Under the same GitHub settings page, choose **Variables → New repository variable**. Set `AMO_PUBLISH` to `true` to submit version tags automatically. Leave it unset to build and publish GitHub releases without contacting AMO.

[GitHub secrets documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) and [Mozilla's submission options](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign) describe the underlying services.

### Publish version 1.0.0

After committing the project and pushing the default branch:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Watch **Actions → Build and release**. The `build` job validates and archives the project; `github-release` publishes the downloadable assets. The independent `amo` job submits to the public **listed** channel only when `AMO_PUBLISH=true`. Fork pull requests and branch builds never receive the publishing secrets.

If the tag was published before AMO was configured, open **Actions → Build and release → Run workflow**, select the version tag, and enable **Submit this version tag to AMO**. This submits the tagged code without creating a new version. Only use this for a version that has not already been submitted; Mozilla can reject duplicate versions. Do not automatically retry an AMO submission that timed out without first checking its status in the Developer Hub.

AMO signing/review is separate from the GitHub release. A successful upload does not guarantee Mozilla approval or immediate public availability. The listed submission may remain under review beyond the workflow's wait period; check the Developer Hub before taking further action. The GitHub ZIP remains unsigned; obtain the signed extension from Mozilla. Screenshots, listing details and reviewer follow-up may still need attention in the Developer Hub.

For later releases, bump `src/manifest.json` and `package.json`, refresh the lockfile, commit and push, then tag the new version. Never reuse a published version tag for different code.
