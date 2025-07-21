(() => {
  const WRAP = { b: "*", i: "_", s: "-" };

  function isEditable(el) {
    return el && el.isContentEditable;
  }

  function findWordBounds(text, offset) {
    let start = offset;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    let end = offset;
    while (end < text.length && !/\s/.test(text[end])) end++;
    return [start, end];
  }

  function toggleWrap(range, wrapper) {
    const txt = range.toString();
    const wlen = wrapper.length;
    let newText, caretOffset;

    if (
      txt.startsWith(wrapper) &&
      txt.endsWith(wrapper) &&
      txt.length >= 2 * wlen
    ) {
      // unwrap
      newText = txt.slice(wlen, txt.length - wlen);
      caretOffset = range.collapsed ? range.startOffset - wlen : null;
    } else {
      // wrap
      newText = wrapper + txt + wrapper;
      caretOffset = range.collapsed ? wlen + range.startOffset : null;
    }

    range.deleteContents();
    const node = document.createTextNode(newText);
    range.insertNode(node);

    const sel = window.getSelection();
    sel.removeAllRanges();
    const newR = document.createRange();

    if (caretOffset != null) {
      const pos = Math.max(0, Math.min(newText.length, caretOffset));
      newR.setStart(node, pos);
      newR.collapse(true);
    } else {
      newR.selectNodeContents(node);
    }

    sel.addRange(newR);
  }

  function applyFormatting(wrapper) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let range = sel.getRangeAt(0);

    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const txtNode = range.startContainer;
      const txt = txtNode.textContent;
      const off = range.startOffset;
      const [w0, w1] = findWordBounds(txt, off);
      if (w0 !== w1) {
        range = document.createRange();
        range.setStart(txtNode, w0);
        range.setEnd(txtNode, w1);
      }
    }

    toggleWrap(range, wrapper);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const active = document.activeElement;
      if (!isEditable(active)) return;

      const isMac = navigator.platform.includes("Mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const key = e.key;

      // remove all formatting with Ctrl + Space or \
      if (!e.shiftKey && (key === " " || key === "\\")) {
        e.preventDefault();
        const clean = active.textContent.replace(/[\*\-_]/g, "");
        active.textContent = clean;
        const r = document.createRange();
        r.selectNodeContents(active);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return;
      }

      // bold / italic / strikethrough
      if (!e.shiftKey) {
        const lk = key.toLowerCase();
        if (lk in WRAP) {
          e.preventDefault();
          applyFormatting(WRAP[lk]);
        }
      }
    },
    true
  );
})();