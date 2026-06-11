// dom.js — tiny DOM helpers shared by the render layer and screens.

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(node, child) {
  clear(node);
  node.appendChild(child);
}
