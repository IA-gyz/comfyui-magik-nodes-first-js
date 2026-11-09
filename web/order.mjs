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
export function menuRank(registry, order, filter) {
  const score = nodeRank(order), categories = new Map();
  for (const node of Object.values(registry)) {
    const rank = score(node);
    if (!Number.isFinite(rank) || node.skip_list || node.filter != filter || typeof node.category !== 'string') continue;
    let path = '';
    for (const segment of node.category.split('/')) {
      path += segment + '/'; categories.set(path, Math.min(categories.get(path) ?? Infinity, rank));
    }
  }
  return entry => {
    const key = typeof entry === 'string' ? entry : entry?.value;
    if (typeof key !== 'string') return Infinity;
    if (Object.hasOwn(registry, key)) return score(registry[key]);
    return entry?.has_submenu && key.endsWith('/') ? categories.get(key) ?? Infinity : Infinity;
  };
}
