export function isMagik(value) {
  if (typeof value === 'string') return /^magik/i.test(value);
  if (!value || !['object', 'function'].includes(typeof value)) return false;
  if (['name', 'display_name', 'type', 'title'].some(k => typeof value[k] === 'string' && /^magik/i.test(value[k]))) return true;
  return ['category', 'python_module'].some(k => typeof value[k] === 'string' && value[k].split(/[./\\]/).some(s => /^magik/i.test(s)));
}
export function partition(items, preferred) {
  const yes = [], no = [];
  for (const item of items) (preferred(item) ? yes : no).push(item);
  return [...yes, ...no];
}
export function hasMagik(tree) {
  return isMagik(tree?.data) || Boolean(tree?.children?.some(hasMagik));
}
export function orderTree(root) {
  function visit(node) {
    if (!node || typeof node !== 'object') return {node, preferred: false};
    const children = Array.isArray(node.children) ? node.children.map(visit) : null;
    return {
      node: children ? {...node, children: partition(children, c => c.preferred).map(c => c.node)} : node,
      preferred: isMagik(node.data) || Boolean(children?.some(c => c.preferred))
    };
  }
  return visit(root).node;
}
export function orderSections(sections) {
  return partition(sections.map(s => ({...s, root: orderTree(s.root)})), s => hasMagik(s.root));
}
// Preserve action/separator positions in mixed native menus.
export function orderMenu(values, preferred, rank) {
  const out = []; let run = [];
  const flush = () => { out.push(...(rank ? rank(run) : partition(run, preferred))); run = []; };
  for (const value of values) {
    if (value == null || value?.separator === true) { flush(); out.push(value); }
    else run.push(value);
  }
  flush(); return out;
}
export function wrapMethod(target, key, make) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const original = target[key];
  if (typeof original !== 'function') throw Error(`Missing method: ${key}`);
  const wrapped = make(original);
  Object.defineProperty(target, key, {value: wrapped, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? false});
  return () => {
    // Leave a subsequent third-party replacement alone.
    if (target[key] !== wrapped) return false;
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
    return true;
  };
}
export function wrapSearch(service, enabled, order = nodes => partition(nodes, isMagik)) {
  return wrapMethod(Object.hasOwn(service, 'searchNode') ? service : Object.getPrototypeOf(service), 'searchNode', original => function(query, filters, options, extraOptions) {
    if (!enabled()) return original.apply(this, arguments);
    const results = original.call(this, query, filters, {...options, limit: 0}, extraOptions);
    if (!Array.isArray(results)) throw Error('Unexpected native search return value');
    const ordered = order(results);
    if (!options?.limit) return ordered;
    // Keep all matching Magik results available to V2's subsequent category/source filters.
    const magikCount = ordered.findIndex(n => !isMagik(n));
    const preferredCount = magikCount < 0 ? ordered.length : magikCount;
    return ordered.slice(0, Math.max(options.limit, preferredCount));
  });
}
export function replaceComputed(store, key, vue, transform) {
  const original = Object.getOwnPropertyDescriptor(vue.toRaw(store), key)?.value;
  if (!vue.isRef(original)) throw Error(`Expected a computed ref: ${key}`);
  const replacement = vue.computed(() => transform(original.value));
  // Assign a ref through Vue's proxy so existing cached consumers are invalidated.
  store[key] = replacement;
  return () => {
    if (Object.getOwnPropertyDescriptor(vue.toRaw(store), key)?.value !== replacement) return false;
    store[key] = original; return true;
  };
}
export function interceptProp(instance, key, vue, transform) {
  const props = instance.props, raw = vue.toRaw(props);
  const descriptor = Object.getOwnPropertyDescriptor(raw, key);
  if (!descriptor?.configurable || !Object.hasOwn(descriptor, 'value')) throw Error(`Unsupported prop descriptor: ${key}`);
  const source = vue.shallowRef(descriptor.value);
  const derived = vue.computed(() => transform(source.value));
  const get = () => derived.value, set = value => { source.value = value; };
  Object.defineProperty(raw, key, {enumerable: descriptor.enumerable, configurable: true, get, set});
  // Also invalidate consumers created before the hook was installed.
  const value = descriptor.value;
  props[key] = Array.isArray(value) ? [...value] : {...value};
  return () => {
    if (Object.getOwnPropertyDescriptor(raw, key)?.get !== get) return false;
    const latest = source.value;
    Object.defineProperty(raw, key, {...descriptor, value: latest});
    props[key] = Array.isArray(latest) ? [...latest] : {...latest};
    return true;
  };
}

/** Schedule outside ComfyUI's awaited setup hook; never hold bootstrap open. */
export function deferInstallation({install, onSuccess, onStatus = () => {}, delayMs = 200, maxAttempts = 100}) {
  let timer, cancelled = false, running = false;
  const state = {phase: 'scheduled', attempts: 0, missing: [], lastError: null};
  const publish = () => onStatus({...state, missing: [...state.missing]});
  async function attempt() {
    if (cancelled || running) return;
    running = true; state.attempts++; state.phase = 'checking'; publish();
    try {
      const api = await install(() => cancelled);
      if (cancelled) { api?.restore?.(); return; }
      state.phase = 'installed'; state.missing = []; state.lastError = null;
      onSuccess(api); publish();
    } catch (error) {
      if (cancelled) return;
      state.lastError = String(error?.message ?? error);
      state.missing = Array.isArray(error?.missing) ? [...error.missing] : [];
      if (error?.retryable === true && state.attempts < maxAttempts) {
        state.phase = 'waiting'; timer = setTimeout(attempt, delayMs);
      } else state.phase = 'failed';
      publish();
    } finally { running = false; }
  }
  publish(); timer = setTimeout(attempt, 0);
  return {
    status: () => ({...state, missing: [...state.missing]}),
    cancel() { cancelled = true; clearTimeout(timer); state.phase = 'cancelled'; publish(); },
    retry() {
      if (running || state.phase === 'installed') return false;
      clearTimeout(timer); cancelled = false; state.attempts = 0;
      state.phase = 'scheduled'; state.missing = []; state.lastError = null;
      publish(); timer = setTimeout(attempt, 0); return true;
    }
  };
}

export function getOrCreateStore(pinia, exports, id) {
  if (!pinia?._s) return undefined;
  const existing = pinia._s.get(id);
  if (existing) return existing;
  const useStore = Object.values(exports).find(value => typeof value === 'function' && value.$id === id);
  return useStore?.(pinia);
}

export function isOrganizationService(value) {
  return Boolean(value) && typeof value.organizeNodes === 'function' && typeof value.organizeNodesTab === 'function';
}

/** Scan already-loaded frontend chunks for an exported service. Cached imports are cheap; failed loads are skipped. */
export async function findExport(urls, load, predicate) {
  for (const url of urls) {
    let module;
    try { module = await load(url); } catch { continue; }
    const found = Object.values(module).find(predicate);
    if (found) return found;
  }
  return undefined;
}
