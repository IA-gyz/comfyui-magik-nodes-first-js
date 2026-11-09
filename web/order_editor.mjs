import {editorIds, moveId, normalizeOrder, nodeId} from './order.mjs';
let current;
export function openOrderEditor({getNodes, readOrder, saveOrder}) {
  if (current?.isConnected) { current.focus(); return; }
  const nodes = getNodes(), byId = new Map(nodes.map(node => [nodeId(node), node]));
  const saved = normalizeOrder(readOrder());
  let draft = editorIds(nodes, saved), defaultOrder = saved.length === 0, dragged, saving = false;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog'); current = dialog;
  dialog.className = 'magik-order-dialog';
  const style = document.createElement('style');
  style.textContent = `
.magik-order-dialog{box-sizing:border-box;width:min(780px,94vw);max-height:88vh;padding:22px;border:1px solid #626a84;border-radius:12px;background:#202330;color:#f0f1f7;font:14px system-ui;box-shadow:0 20px 80px #0009}
.magik-order-dialog::backdrop{background:#0009}.magik-order-dialog h2{margin:0 0 10px;color:#e4d5ff}.magik-order-dialog p{line-height:1.45;color:#c4c8d5}
.magik-order-dialog ol{margin:14px 0;padding:0;list-style:none;max-height:55vh;overflow:auto;border:1px solid #474d64;border-radius:6px}
.magik-order-dialog li{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #383f53;background:#282d3c}.magik-order-dialog li:focus{outline:2px solid #ae8bfa;outline-offset:-2px}
.magik-order-dialog .node-label{flex:1;min-width:0;overflow-wrap:anywhere}.magik-order-dialog small{display:block;color:#a9afc2;margin-top:3px}.magik-order-dialog .number{color:#c6a9ff;min-width:28px}
.magik-order-dialog button{padding:7px 11px;border:1px solid #656d88;border-radius:5px;background:#394158;color:#fff;cursor:pointer;font:inherit}.magik-order-dialog button:disabled{opacity:.4;cursor:default}.magik-order-dialog button:focus-visible{outline:2px solid #cfb6ff}
.magik-order-dialog footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.magik-order-dialog .spacer{flex:1}.magik-order-dialog .save{background:#5a438f}.magik-order-dialog .error{color:#ffb4b4;min-height:1.4em;margin:8px 0}
`;
  dialog.append(style);
  const title = document.createElement('h2'); title.id = 'magik-order-title'; title.textContent = 'Magik node order'; dialog.append(title); dialog.setAttribute('aria-labelledby', title.id);
  const info = document.createElement('p'); info.textContent = 'Drag rows, use the arrow buttons, or press Alt + ↑/↓ on a row. This order applies to matching Magik nodes in menus and search.'; dialog.append(info);
  const list = document.createElement('ol'); list.setAttribute('aria-label', 'Magik nodes in display order'); dialog.append(list);
  const error = document.createElement('p'); error.className = 'error'; error.setAttribute('role', 'status'); dialog.append(error);
  const footer = document.createElement('footer'); dialog.append(footer);
  function button(label, action, parent = footer) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); parent.append(b); return b;
  }
  function move(id, target) { if (saving) return; draft = moveId(draft, id, target); defaultOrder = false; render(id); }
  function render(focusId) {
    const scroll = list.scrollTop; list.replaceChildren();
    draft.forEach((id, index) => {
      const node = byId.get(id), label = node?.display_name || node?.title || id;
      const row = document.createElement('li'); row.tabIndex = 0; row.draggable = !saving; row.dataset.nodeId = id;
      const number = document.createElement('span'); number.className = 'number'; number.textContent = String(index + 1); row.append(number);
      const text = document.createElement('span'); text.className = 'node-label'; text.textContent = label; row.append(text);
      const detail = document.createElement('small'); detail.textContent = node ? id : `${id} — currently unavailable; saved position retained`; text.append(detail);
      for (const [symbol, position, meaning] of [['⇈', 0, 'Move to top'], ['↑', index - 1, 'Move up'], ['↓', index + 1, 'Move down'], ['⇊', draft.length - 1, 'Move to bottom']]) {
        const b = button(symbol, () => move(id, position), row); b.title = `${meaning}: ${label}`; b.setAttribute('aria-label', b.title);
        b.disabled = saving || position < 0 || position >= draft.length || position === index;
      }
      row.addEventListener('keydown', event => {
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(id, index + (event.key === 'ArrowUp' ? -1 : 1)); }
      });
      row.addEventListener('dragstart', event => { if (saving) { event.preventDefault(); return; } dragged = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', event => { if (dragged && !saving) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
      row.addEventListener('drop', event => { event.preventDefault(); if (dragged && draft.includes(dragged)) move(dragged, index); dragged = undefined; });
      row.addEventListener('dragend', () => { dragged = undefined; }); list.append(row);
    });
    list.scrollTop = scroll;
    if (focusId) [...list.children].find(row => row.dataset.nodeId === focusId)?.focus({preventScroll: true});
  }
  const reset = button('Reset to default', () => { draft = editorIds(nodes, []); defaultOrder = true; error.textContent = ''; render(); });
  const spacer = document.createElement('span'); spacer.className = 'spacer'; footer.append(spacer);
  const cancel = button('Cancel', () => dialog.close());
  const save = button('Save order', async () => {
    if (saving) return; saving = true; error.textContent = ''; reset.disabled = cancel.disabled = save.disabled = true; render();
    try { await saveOrder(defaultOrder ? [] : normalizeOrder(draft)); dialog.close(); }
    catch (e) { error.textContent = `Could not save: ${e?.message || e}`; }
    finally { saving = false; reset.disabled = cancel.disabled = save.disabled = false; if (dialog.isConnected) render(); }
  }); save.className = 'save';
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (current === dialog) current = undefined; if (previousFocus?.isConnected) previousFocus.focus(); }, {once: true});
  document.body.append(dialog); render(); dialog.showModal(); cancel.focus();
}
