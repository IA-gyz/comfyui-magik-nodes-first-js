import { app } from '../../scripts/app.js';
import { isMagik, orderMenu, wrapMethod, wrapSearch, replaceComputed, deferInstallation, getOrCreateStore, isOrganizationService, findExport } from './priority.mjs';

import {normalizeOrder, nodeRank, rankItems, rankNodes, rankTree, menuRank} from './order.mjs';
import {openOrderEditor} from './order_editor.mjs';

const ORDER_SETTING = 'Magik.NodesFirst.Order';
const SETTING = 'Magik.NodesFirst.Enabled';
// Build gate by module *name*, not by content hash: ComfyUI's bundler renames
// e.g. settingStore-DZ2-HL-F.js on every frontend release, which broke the
// previous exact-filename gate. A stable name + hashed suffix now matches.
const REVIEWED = {
  service: 'settingStore',
  vue: 'vendor-vue-core'
};
let control, startup;
const diagnostics = {
  get active() { return control?.active ?? false; },
  status() { return control?.status() ?? startup?.status() ?? {phase: 'registered', active: false}; },
  restore() { if (control) return control.restore(); startup?.cancel(); return diagnostics.status(); },
  retry() { return startup?.retry() ?? false; }
};
if (!globalThis.magikNodesFirst?.active) globalThis.magikNodesFirst = diagnostics;
function unavailable(missing) {
  const error = Error(`Waiting for: ${missing.join(', ')}`);
  error.retryable = true; error.missing = missing; return error;
}
function loadedUrls() {
  return [...new Set([
    ...performance.getEntriesByType('resource').map(e => e.name),
    ...[...document.querySelectorAll('script[src],link[href]')].map(e => e.src || e.href)
  ])].map(url => new URL(url, document.baseURI)).filter(url => url.origin === location.origin);
}
function loadedModule(name) {
  const pattern = new RegExp(`/${name}-[A-Za-z0-9_-]+\\.js$`);
  return loadedUrls().find(url => pattern.test(url.pathname))?.href;
}
// The organization service may sit in a lazily loaded chunk that is not in the
// resource list yet. Crawl dynamic-import references starting from the loaded
// asset directory (bounded); freshly imported chunks appear as new resources.
async function findOrganization(serviceUrl) {
  const rootPath = new URL('.', serviceUrl).pathname;
  const isAsset = url => url.origin === location.origin && url.pathname.endsWith('.js') && url.pathname.startsWith(rootPath);
  const seen = new Set();
  let queue = loadedUrls().filter(isAsset).map(url => url.href);
  for (let round = 0; round < 3 && queue.length; round++) {
    const found = await findExport(queue, url => import(url), isOrganizationService);
    if (found) return found;
    const next = [];
    for (const url of queue) {
      seen.add(url);
      let text;
      try { text = await (await fetch(url)).text(); } catch { continue; }
      for (const match of text.matchAll(/import\(\s*["']([^"']+\.js)["']/g)) {
        let href;
        try { href = new URL(match[1], url).href; } catch { continue; }
        if (!seen.has(href) && !next.includes(href) && isAsset(new URL(href))) next.push(href);
      }
    }
    for (const url of loadedUrls()) if (isAsset(url) && !seen.has(url.href) && !next.includes(url.href)) next.push(url.href);
    queue = next;
  }
  return undefined;
}
function namedExport(module, name) {
  const fn = Object.values(module).find(value => typeof value === 'function' && value.name === name);
  if (!fn) throw Error(`Missing bundled Vue export: ${name}`);
  return fn;
}
async function install(isCancelled = () => false, {attempt = 1} = {}) {
  if (globalThis.magikNodesFirst?.active) throw Error('Magik Nodes First is already installed');
  const serviceUrl = loadedModule(REVIEWED.service), vueUrl = loadedModule(REVIEWED.vue);
  if (!serviceUrl || !vueUrl) throw unavailable([!serviceUrl && 'reviewed service module', !vueUrl && 'reviewed Vue module'].filter(Boolean));
  const [bundle, runtime] = await Promise.all([import(serviceUrl), import(vueUrl)]);
  const vue = Object.fromEntries(['computed', 'ref', 'shallowRef', 'toRaw', 'isRef', 'getCurrentInstance', 'onScopeDispose', 'getActivePinia'].map(name => [name, namedExport(runtime, name)]));
  const element = document.getElementById('vue-app');
  const vueApp = element?.__vue_app__;
  const pinia = vueApp?.config.globalProperties.$pinia ?? vue.getActivePinia();
  const stores = pinia?._s;
  // Setup stores are lazy. Create them through their exported useStore accessor,
  // with the application's existing Pinia, rather than waiting for a search to open.
  const defs = getOrCreateStore(pinia, bundle, 'nodeDef');
  const frequency = getOrCreateStore(pinia, bundle, 'nodeFrequency');
  // The organization service can live in its own (possibly lazy) chunk.
  let organization = Object.values(bundle).find(isOrganizationService);
  if (!organization) organization = await findOrganization(serviceUrl);
  // Newer builds moved the topNodeDefs computed from nodeFrequency to nodeDef.
  const topStore = [frequency, defs].find(store => store && vue.isRef(Object.getOwnPropertyDescriptor(vue.toRaw(store), 'topNodeDefs')?.value));
  const graph = globalThis.LiteGraph;
  const missing = [
    !element && 'Vue root element', !vueApp && 'mounted Vue app',
    !stores && 'Pinia store registry', !defs && 'nodeDef store',
    !defs?.nodeSearchService && 'node search service', !topStore && 'topNodeDefs computed',
    !graph?.ContextMenu && 'LiteGraph context menu'
  ].filter(Boolean);
  if (missing.length) throw unavailable(missing);
  // The organization service is best-effort: retry while it may still lazy-load,
  // then install without it instead of failing entirely.
  if (!organization && attempt < 50) throw unavailable(['exported node organization service']);
  if (isCancelled()) throw Error('Installation cancelled before installing hooks');
  const enabled = vue.ref(app.extensionManager.setting.get(SETTING) !== false);
  const customOrder = vue.ref(normalizeOrder(app.extensionManager.setting.get(ORDER_SETTING)));
  const orderNodes = (nodes, resolve) => rankNodes(nodes, customOrder.value, resolve);
  const restores = [];
  const state = {version: '0.2.5', phase: 'installed', active: true, enabled: enabled.value, build: REVIEWED.service, hooks: {}, customOrder: customOrder.value,
    warnings: organization ? [] : ['exported node organization service not found; search category navigation keeps native order']};
  function add(name, restore) { restores.push(restore); state.hooks[name] = true; }
  const api = {
    get active() { return state.active; },
    setEnabled(value) { if (!state.active) return; enabled.value = value !== false; state.enabled = enabled.value; },
    setOrder(value) { customOrder.value = normalizeOrder(value); state.customOrder = customOrder.value; },
    editOrder() {
      openOrderEditor({
        getNodes: () => (Array.isArray(defs.nodeDefs) ? defs.nodeDefs : defs.visibleNodeDefs).filter(isMagik),
        readOrder: () => customOrder.value,
        async saveOrder(value) {
          if (!state.active) throw Error('Extension is no longer active. Refresh the page.');
          const next = normalizeOrder(value);
          await app.extensionManager.setting.set(ORDER_SETTING, next);
          api.setOrder(next);
        }
      });
    },
    status() { return JSON.parse(JSON.stringify(state)); },
    restore() {
      if (!state.active) return api.status();
      state.active = false; state.phase = 'restored'; enabled.value = false;
      let skipped = 0;
      for (const restore of [...restores].reverse()) {
        try { if (restore() === false) skipped++; } catch (e) { console.warn('[Magik Nodes First] Restore:', e); skipped++; }
      }
      restores.length = 0;
      state.restoreSkipped = skipped;
      console.info('[Magik Nodes First] Disabled and restored. Refresh to fully unload the extension.');
      return api.status();
    }
  };
  try {
    add('searchBeforeCutoff', wrapSearch(defs.nodeSearchService, () => enabled.value, nodes => orderNodes(nodes)));
    add('emptySearch', replaceComputed(topStore, 'topNodeDefs', vue, original => {
      if (!enabled.value) return original;
      const visible = defs.visibleNodeDefs, allowed = new Set(visible.map(n => n.name));
      const ranked = (frequency?.nodeNamesByFrequency ?? []).flatMap(name => {
        const node = typeof defs.getNodeDefByName === 'function' ? defs.getNodeDefByName(name) : visible.find(n => n.name === name);
        return node && allowed.has(name) ? [node] : [];
      });
      const existing = new Set(ranked.map(n => n.name));
      return orderNodes([...ranked, ...visible.filter(n => isMagik(n) && !existing.has(n.name))]).slice(0, 64);
    }));
    if (organization) add('categoryAndClassicSidebar', wrapMethod(organization, 'organizeNodes', original => function(...args) {
      const tree = original.apply(this, args); return enabled.value ? rankTree(tree, nodeRank(customOrder.value)) : tree;
    }));
    else console.warn('[Magik Nodes First] Node organization service not found; search category navigation keeps native order. Search, menus and suggestions still reorder.');
    // Native legacy search enumerates the registry in all its filtering passes.
    // A proxy changes enumeration order, preserving every key and constructor.
    const originalRegistry = graph.registered_node_types;
    const registryProxy = new Proxy(originalRegistry, {
      ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        return enabled.value ? orderNodes(keys, key => typeof key === 'string' ? target[key] : null) : keys;
      }
    });
    graph.registered_node_types = registryProxy;
    add('legacySearchEnumeration', () => {
      if (graph.registered_node_types !== registryProxy) return false;
      graph.registered_node_types = originalRegistry; return true;
    });
    const previousMenu = graph.ContextMenu;
    const proxyMenu = new Proxy(previousMenu, {
      construct(target, args, newTarget) {
        let next = args;
        if (enabled.value && Array.isArray(args[0])) {
          const canvas = app.canvasOrUndefined;
          const score = menuRank(graph.registered_node_types, customOrder.value, canvas?.filter || canvas?.graph?.filter);
          next = [orderMenu(args[0], () => false, run => rankItems(run, score)), ...args.slice(1)];
        }
        return Reflect.construct(target, next, newTarget);
      }
    });
    graph.ContextMenu = proxyMenu;
    add('nativeContextMenusAndWireDefaults', () => {
      if (graph.ContextMenu !== proxyMenu) return false;
      graph.ContextMenu = previousMenu; return true;
    });
    globalThis.magikNodesFirst = api;
    console.info('[Magik Nodes First] Installed. Right-click the canvas → Magik node order…');
    return api;
  } catch (error) {
    api.restore(); throw error;
  }
}
app.registerExtension({
  name: 'Magik.NodesFirst.JSPrototype',
  settings: [{id: SETTING, name: 'Prioritize Magik nodes', category: ['Magik', 'Nodes', 'Priority'], type: 'boolean', defaultValue: true,
    onChange(value) { control?.setEnabled(value); }},
    {id: ORDER_SETTING, name: 'Magik node display order', type: 'hidden', defaultValue: [], onChange(value) { control?.setOrder(value); }}],
  getCanvasMenuItems() { return [{content: 'Magik node order…', callback: () => { if (control?.active) control.editOrder(); else console.warn('[Magik Nodes First] Editor unavailable:', diagnostics.status()); }}]; },
  setup() {
    if (startup || control?.active) return;
    // Do not return/await the installer: graph-ready initialization runs only
    // after ComfyUI's extension setup calls have finished.
    startup = deferInstallation({
      install,
      onSuccess(api) { control = api; },
      onStatus(status) {
        if (status.phase === 'failed') {
          console.error('[Magik Nodes First] Installation failed:', status);
        }
      }
    });
  }
});
