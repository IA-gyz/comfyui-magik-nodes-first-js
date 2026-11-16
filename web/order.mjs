import {isMagik} from './priority.mjs';
export function normalizeOrder(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string' && id.trim().length > 0))];
}
export function nodeId(node) {
  if (typeof node === 'string') return node;
  if (!node) return '';
  return (typeof node === 'function' ? node.type : node.name ?? node.type) ?? '';
}
export function nodeRank(order) {
  const ids = normalizeOrder(order), rank = new Map(ids.map((id, index) => [id, index]));
  return node => isMagik(node) ? rank.get(nodeId(node)) ?? ids.length : Infinity;
}
export function rankItems(items, score) {
  return items.map((item, index) => ({item, index, score: score(item)}))
    .sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : a.index - b.index)).map(e => e.item);
}
export function rankNodes(items, order, resolve = value => value) {
  const score = nodeRank(order); return rankItems(items, value => score(resolve(value)));
}
/** Stable multi-key sort: lexicographic by key tuple, then original index. */
export function rankItemsBy(items, keys) {
  return items.map((item, index) => ({item, index, keys: keys(item)}))
    .sort((a, b) => {
      for (let i = 0; i < a.keys.length; i++) {
        if (a.keys[i] < b.keys[i]) return -1;
        if (a.keys[i] > b.keys[i]) return 1;
      }
      return a.index - b.index;
    }).map(e => e.item);
}
const WILDCARD = '*', GENERIC = new Set(['', WILDCARD, '0']);
// A wire-release search carries an input/output type filter; extract the socket
// side a proposed node must have and the accepted type values.
export function socketFilter(filters) {
  for (const entry of Array.isArray(filters) ? filters : []) {
    const id = entry?.filterDef?.id, value = entry?.value;
    if ((id !== 'input' && id !== 'output') || typeof value !== 'string') continue;
    const values = value.split(',').map(v => v.trim()).filter(v => v && !GENERIC.has(v));
    if (values.length) return {side: id === 'input' ? 'inputTypes' : 'outputTypes', values};
  }
  return null;
}
// A dragged connecting link: its free end (toType) decides which socket side a
// proposed node must have; the dragged slot's type is the required value.
export function linkFilter(link) {
  const type = link?.fromSlot?.type;
  const value = typeof type === 'string' || typeof type === 'number' ? String(type).trim() : '';
  if (!value || GENERIC.has(value)) return null;
  return {side: link?.toType === 'input' ? 'inputTypes' : 'outputTypes', values: [value]};
}
/** Socket-fit tiers: 0 = exact type match, 1 = wildcard match, 2 = no fit. */
export function fitRank(filter) {
  if (!filter) return () => 2;
  const {side, values} = filter;
  return node => {
    const types = node?.[side];
    if (!Array.isArray(types)) return 2;
    return values.some(value => types.includes(value)) ? 0 : types.includes(WILDCARD) ? 1 : 2;
  };
}
/** Fit tier first, saved Magik order within each tier, stable for the rest. */
export function rankNodesFit(items, order, fit, resolve = value => value) {
  const rank = nodeRank(order), score = fit ?? (() => 2);
  return rankItemsBy(items, value => [score(resolve(value)), rank(resolve(value))]);
}
export function rankTree(root, score) {
  function visit(node) {
    if (!node || typeof node !== 'object') return {node, score: Infinity};
    const children = Array.isArray(node.children) ? node.children.map(visit) : [];
    const rank = Math.min(score(node.data), ...children.map(c => c.score));
    return {node: children.length ? {...node, children: rankItems(children, c => c.score).map(c => c.node)} : node, score: rank};
  }
  return visit(root).node;
}
export function moveId(ids, id, target) {
  const index = ids.indexOf(id);
  if (index < 0 || !Number.isInteger(target)) return [...ids];
  const next = [...ids]; next.splice(index, 1); next.splice(Math.max(0, Math.min(target, next.length)), 0, id); return next;
}
export function editorIds(nodes, saved) {
  return normalizeOrder([...normalizeOrder(saved), ...nodes.map(nodeId)]);
}

/** Build descendant category scores once per menu, rather than rescanning for each row. */
const menuRankCache = new WeakMap();
export function menuRank(registry, order, filter) {
  // Cache per registry; recompute when the registry grows or the order/filter changes.
  const size = Object.keys(registry).length;
  const cached = menuRankCache.get(registry);
  if (cached && cached.size === size && cached.order === order && cached.filter === filter) return cached.score;
  const score = nodeRank(order), categories = new Map();
  for (const node of Object.values(registry)) {
    const rank = score(node);
    if (!Number.isFinite(rank) || node.skip_list || node.filter != filter || typeof node.category !== 'string') continue;
    let path = '';
    for (const segment of node.category.split('/')) {
      path += segment + '/'; categories.set(path, Math.min(categories.get(path) ?? Infinity, rank));
    }
  }
  const entryScore = entry => {
    const key = typeof entry === 'string' ? entry : entry?.value;
    if (typeof key !== 'string') return Infinity;
    if (Object.hasOwn(registry, key)) return score(registry[key]);
    return entry?.has_submenu && key.endsWith('/') ? categories.get(key) ?? Infinity : Infinity;
  };
  menuRankCache.set(registry, {size, order, filter, score: entryScore});
  return entryScore;
}

/** Socket-fit score for menu entries; categories take their best fitting descendant. */
const menuFitCache = new WeakMap();
export function menuFit(registry, filter, fitKey, fit) {
  // Cache per registry; recompute when the registry grows or the filter/context changes.
  const size = Object.keys(registry).length;
  const cached = menuFitCache.get(registry);
  if (cached && cached.size === size && cached.filter === filter && cached.fitKey === fitKey) return cached.score;
  const categories = new Map();
  for (const node of Object.values(registry)) {
    if (node.skip_list || node.filter != filter || typeof node.category !== 'string') continue;
    const tier = fit(node);
    let path = '';
    for (const segment of node.category.split('/')) {
      path += segment + '/';
      categories.set(path, Math.min(categories.get(path) ?? Infinity, tier));
    }
  }
  const entryScore = entry => {
    const key = typeof entry === 'string' ? entry : entry?.value;
    if (typeof key !== 'string') return 2;
    if (Object.hasOwn(registry, key)) return fit(registry[key]);
    return entry?.has_submenu && key.endsWith('/') ? categories.get(key) ?? 2 : 2;
  };
  menuFitCache.set(registry, {size, filter, fitKey, score: entryScore});
  return entryScore;
}
