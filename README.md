# Magik Nodes First — 0.2.1

A frontend-only ComfyUI extension that puts Magik nodes first and lets you choose their order. No frontend rebuild or Python dependencies are required.

## Install or update

Replace the existing folder with this one:

`/home/toto/Apps/comfyui/custom_nodes/Magik_Nodes_First_JS/`

`__init__.py` and `web/` must be directly inside that folder. Keep only one installed copy. Restart ComfyUI and hard-refresh the app/browser with Ctrl+Shift+R.

## Edit the order

**Right-click an empty part of the canvas → Magik node order…**

- Drag rows, use the up/down or top/bottom buttons, or press Alt+Up/Down while a row has focus.
- Click **Save order** to apply and persist the preference in ComfyUI's user settings.
- **Cancel** discards changes. **Reset to default** prepares the default order; click Save to commit it.
- Reopen any existing search or context menu after saving to refresh its results.

The list uses backend node IDs so similarly named nodes remain distinct. Installed Magik nodes are included even if currently hidden from native search; native visibility and socket-compatibility filters still govern the actual results. Saved entries for temporarily unavailable nodes retain their position and are labeled as unavailable. New nodes that do not yet have a saved position follow the explicitly ordered nodes.

Your ordering applies to matching Magik nodes in:

- Native Add Node menus and nested categories.
- Typed search and empty-search suggestions.
- Legacy search, where it uses native registry enumeration.
- Native wire-release suggested nodes.

Native category nesting and menu separators are preserved. A category is positioned according to its earliest ranked eligible Magik descendant; nodes stay inside their existing categories. Other nodes retain their native relative order after Magik nodes. Socket compatibility and search matching are unchanged.

The existing **Prioritize Magik nodes** toggle in Settings still controls the feature. Disabling it restores native ordering; your saved custom order is retained for when you enable it again. Saving a custom order does not rewrite node IDs, workflows, frequency records, or node definitions.

## Scope and compatibility

Menus, searches and wire suggestions were confirmed working by the user in 0.1.1. Sidebar-specific support is excluded by request. Version 0.2.0 removes the sidebar lifecycle hooks and DOM observers; the shared category-organization hook remains for search category navigation and may also affect native views that use the same service.

This extension uses internal runtime hooks for the supplied production frontend 1.55.18 build. It currently recognizes `settingStore-DZ2-HL-F.js` and `vendor-vue-core-y4MynkKA.js`. A different frontend build may need a bridge update. It does not replace or freeze your installed frontend. Third-party node pickers that bypass native services may need separate integration.

Startup is deferred until after ComfyUI's setup hook returns. Lazy stores are created through their native accessors in the existing application Pinia. Missing prerequisites are retried for roughly 20 seconds; failures include their names.

## Diagnostics and removal

The developer-console diagnostic remains available, including when installation fails:

```javascript
console.log(JSON.stringify(magikNodesFirst.status(), null, 2))
```

You can also open the editor with:

```javascript
magikNodesFirst.editOrder()
```

Once installed, `customOrder` in the status output contains the saved backend IDs. `magikNodesFirst.restore()` disables and restores hooks in the current session; refresh to fully unload them. If startup failed, `magikNodesFirst.retry()` retries it. To uninstall, remove the extension folder, restart ComfyUI and refresh.

## Verification

Automated checks cover explicit ranking, normalization, new/missing nodes, duplicate display names, nested category ordering, menu separators, search cutoffs, compatibility membership, saving/cancelling/resetting the editor, save failure, drag event handling, startup and restoration. The editor tests use a minimal DOM fixture: they verify its actions and state, not visual appearance or native browser drag behavior. Integration tests use the supplied production Vue/Pinia runtime and mock browser/service objects. The updated dialog still needs a live browser check.

To run the dependency-free tests with Node.js 24+:

```bash
node --test tests/*.test.mjs
```

Production-runtime tests skip unless you point to an extracted copy of your original frontend package:

```bash
MAGIK_FRONTEND_STATIC="/path/to/comfyui_frontend_package/static" \
  node --test tests/*.test.mjs
```

The compiled frontend is not redistributed. Node.js is needed only to run development tests, not to use this extension.

License: GPL-3.0-only.
