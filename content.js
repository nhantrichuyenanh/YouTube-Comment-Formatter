// observes DOM changes to detect new comment boxes and enhance them
const commentObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      try {
        const boxes = node.querySelectorAll ? node.querySelectorAll('#commentbox') : [];
        boxes.forEach(enhanceCommentBox);
        if (node.id === 'commentbox') enhanceCommentBox(node);
      } catch (err) {
      }
    }
  }
});

commentObserver.observe(document.body, {
  childList: true,
  subtree: true
});

let defaultSettings = {
  enableHotkeys: true,
  showButtons: true,
  autoPreview: false
};

// loads user preferences
browser.storage.sync.get(defaultSettings, (res) => {
  defaultSettings = Object.assign({}, defaultSettings, res);
  updateAllCommentBoxesButtons();
});

// listens for changes in options menu
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'updateSettings' && message.settings) {
    defaultSettings = Object.assign({}, defaultSettings, message.settings);
    updateAllCommentBoxesButtons();
  }
});

// UTILITY FUNCTIONS //
function findAncestorCommentBox(node) {
  while (node && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE && node.id === 'commentbox') return node;
    node = node.parentNode;
  }
  return null;
}

function restoreCursorPos(textNode, offset) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  const selection = window.getSelection();
  const range = document.createRange();
  const maxOffset = Math.max(0, textNode.textContent.length);
  const safeOffset = Math.min(maxOffset, Math.max(0, offset));
  try {
    range.setStart(textNode, safeOffset);
    range.setEnd(textNode, safeOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (e) {
    try {
      range.setStart(textNode, textNode.textContent.length);
      range.setEnd(textNode, textNode.textContent.length);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (err) {
    }
  }
}

function findWordBoundariesAtOffset(text, offset) {
  if (offset < 0) offset = 0;
  if (offset > text.length) offset = text.length;
  let start = offset;
  let end = offset;
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  while (end < text.length && /\S/.test(text[end])) end++;
  if (start === end) return null;
  return { start, end, word: text.substring(start, end) };
}

function isTextAlreadyFormatted(text, cursorStart, cursorEnd, symbol) {
  let openPos = -1;
  for (let i = cursorStart - 1; i >= 0; i--) {
    if (text[i] === symbol) {
      if (i === 0 || /\s/.test(text[i - 1])) {
        openPos = i;
        break;
      }
    } else if (/\s/.test(text[i])) {
      break;
    }
  }

  let closePos = -1;
  for (let i = cursorEnd; i < text.length; i++) {
    if (text[i] === symbol) {
      if (i === text.length - 1 || /\s/.test(text[i + 1])) {
        closePos = i;
        break;
      }
    } else if (/\s/.test(text[i])) {
      break;
    }
  }

  return { isFormatted: openPos !== -1 && closePos !== -1, openPos, closePos };
}

// TEXT FORMATTING FUNCTIONS //
function toggleFormatting(symbol) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  let textNode = range.commonAncestorContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) {
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer;
    } else if (range.startContainer.firstChild && range.startContainer.firstChild.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer.firstChild;
    } else {
      return;
    }
  }

  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  const fullText = textNode.textContent;
  const cursorStart = range.startOffset;
  const cursorEnd = range.endOffset;
  const selectedText = fullText.substring(cursorStart, cursorEnd);

  const origCursorPos = cursorStart;
  const formatCheck = isTextAlreadyFormatted(fullText, cursorStart, cursorEnd, symbol);

  if (formatCheck.isFormatted) {
    const beforeFormat = fullText.substring(0, formatCheck.openPos);
    const formattedContent = fullText.substring(formatCheck.openPos + 1, formatCheck.closePos);
    const afterFormat = fullText.substring(formatCheck.closePos + 1);
    const newText = beforeFormat + formattedContent + afterFormat;
    textNode.textContent = newText;

    let newCursorPos;
    if (origCursorPos <= formatCheck.openPos) {
      newCursorPos = origCursorPos;
    } else if (origCursorPos >= formatCheck.closePos) {
      newCursorPos = origCursorPos - 2;
    } else {
      newCursorPos = origCursorPos - 1;
    }
    restoreCursorPos(textNode, newCursorPos);
  } else {
    if (selectedText === "") {
      const wordBoundaries = findWordBoundariesAtOffset(fullText, cursorStart);
      if (wordBoundaries && wordBoundaries.word.trim().length > 0) {
        const beforeWord = fullText.substring(0, wordBoundaries.start);
        const afterWord = fullText.substring(wordBoundaries.end);
        const word = wordBoundaries.word;

        const needsSpaceBefore = beforeWord.length > 0 && !/\s$/.test(beforeWord);
        const needsSpaceAfter = afterWord.length > 0 && !/^\s/.test(afterWord);
        const spaceBefore = needsSpaceBefore ? ' ' : '';
        const spaceAfter = needsSpaceAfter ? ' ' : '';

        const newText = `${beforeWord}${spaceBefore}${symbol}${word}${symbol}${spaceAfter}${afterWord}`;
        textNode.textContent = newText;

        let newCursorPos;
        if (origCursorPos <= wordBoundaries.start) {
          newCursorPos = origCursorPos + spaceBefore.length;
        } else if (origCursorPos >= wordBoundaries.end) {
          newCursorPos = beforeWord.length + spaceBefore.length + symbol.length + word.length + symbol.length + (origCursorPos - wordBoundaries.end);
        } else {
          const relativePos = origCursorPos - wordBoundaries.start;
          newCursorPos = beforeWord.length + spaceBefore.length + symbol.length + relativePos;
        }
        restoreCursorPos(textNode, newCursorPos);
      } else {
        restoreCursorPos(textNode, origCursorPos);
      }
    } else {
      const beforeText = fullText.substring(0, cursorStart);
      const afterText = fullText.substring(cursorEnd);
      const needsSpaceBefore = beforeText.length > 0 && !/\s$/.test(beforeText);
      const needsSpaceAfter = afterText.length > 0 && !/^\s/.test(afterText);
      const spaceBefore = needsSpaceBefore ? ' ' : '';
      const spaceAfter = needsSpaceAfter ? ' ' : '';
      const newText = `${beforeText}${spaceBefore}${symbol}${selectedText}${symbol}${spaceAfter}${afterText}`;
      textNode.textContent = newText;

      const newCursorPos = beforeText.length + spaceBefore.length + symbol.length + selectedText.length + symbol.length;
      restoreCursorPos(textNode, newCursorPos);
    }
  }
}

function clearAllFormattingInEditable(editable) {
  if (!editable) return;
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent) {
      node.textContent = node.textContent.replace(/[\*\-_]/g, '');
    }
  }
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  editable.dispatchEvent(new Event('input', { bubbles: true }));
}

// VIDEO TIMESTAMP FUNCTIONS //
function insertCurrentVideoTimestamp(input) {
  const video = document.querySelector("video");
  if (!video) return;

  const currentTime = Math.floor(video.currentTime);
  const hours = Math.floor(currentTime / 3600);
  const minutes = Math.floor((currentTime % 3600) / 60);
  const seconds = currentTime % 60;

  const formattedTime =
    (hours > 0
      ? [hours, String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")]
      : [minutes, String(seconds).padStart(2, "0")]
    ).join(":");

  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const tsNode = document.createTextNode(formattedTime);

  range.insertNode(tsNode);
  range.setStartAfter(tsNode);
  range.setEndAfter(tsNode);

  selection.removeAllRanges();
  selection.addRange(range);

  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// KEYBOARD SHORTCUTS //
(function installHotkeys() {
  const WRAP = { b: '*', i: '_', s: '-' };

  function selectionIsInsideCommentBox() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    return !!findAncestorCommentBox(sel.anchorNode);
  }

  function applyWrapFromHotkey(symbol) {
    toggleFormatting(symbol);
    const sel = window.getSelection();
    const cb = sel && sel.anchorNode ? findAncestorCommentBox(sel.anchorNode) : null;
    const editable = cb ? cb.querySelector('#contenteditable-root') : null;
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('keydown', (e) => {
    if (!defaultSettings.enableHotkeys) return;

    if (!selectionIsInsideCommentBox()) return;

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    const key = e.key;

    if (!e.shiftKey && (key === ' ' || key === '\\')) {
      e.preventDefault();
      const sel = window.getSelection();
      const cb = sel && sel.anchorNode ? findAncestorCommentBox(sel.anchorNode) : null;
      const editable = cb ? cb.querySelector('#contenteditable-root') : null;
      if (editable) clearAllFormattingInEditable(editable);
      return;
    }

    if (!e.shiftKey) {
      const lk = key.toLowerCase();
      if (lk in WRAP) {
        e.preventDefault();
        applyWrapFromHotkey(WRAP[lk]);
      }
    }
  }, true);
})();

// COMMENT BOX ENHANCEMENT //
function enhanceCommentBox(commentBox) {
  if (!commentBox || commentBox.dataset.enhanced === 'true') return;
  commentBox.dataset.enhanced = 'true';

  const emojiButton = commentBox.querySelector('#emoji-button');
  const input = commentBox.querySelector('#contenteditable-root');
  const footer = commentBox.querySelector('#footer');

  if (!input || !footer) {
    return;
  }

  // prevent preview pop-up glitching when Auto Live Preview is enabled
  let manuallyToggled = false;

  // preview pop-up
  const previewContainer = document.createElement('div');
  previewContainer.className = 'yt-comments-enhanced-preview-container';
  previewContainer.style.display = 'none';
  previewContainer.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
  previewContainer.style.transform = 'translateY(-6px)';
  previewContainer.style.opacity = '0';
  const previewBody = document.createElement('span');
  previewContainer.appendChild(previewBody);
  footer.insertAdjacentElement('afterend', previewContainer);

  let previewToggleBtn = null;

  function updatePreview() {
    const rawText = getTextContent(input).trim();
    if (!rawText) {
      previewBody.innerHTML = '';
      if (!defaultSettings.autoPreview && previewContainer.style.display === 'block') {
        previewContainer.style.transform = 'translateY(-6px)';
        previewContainer.style.opacity = '0';
        setTimeout(() => { previewContainer.style.display = 'none'; }, 200);
      }
      return;
    }

    let formattedText = formatText(rawText);

    if (input._emojiMap && input._emojiMap.size > 0) {
      input._emojiMap.forEach((emojiElement, emojiId) => {
        const placeholder = `{{${emojiId}}}`;
        const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
        formattedText = formattedText.replace(regex, emojiElement.outerHTML);
      });
    }

    previewBody.innerHTML = formattedText;
  }

  function parseTimestampToSeconds(ts) {
    const parts = ts.trim().split(':').map(n => parseInt(n, 10));
    if (parts.some(Number.isNaN)) return NaN;
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  }

  function handleTimestampActivate(e) {
    const base = e.target && (e.target.nodeType === Node.ELEMENT_NODE ? e.target : e.target.parentElement);
    const tEl = base && base.closest ? base.closest('.yt-enhanced-timestamp') : null;
    if (!tEl) return;

    e.preventDefault();
    e.stopPropagation();

    const seconds = parseTimestampToSeconds(tEl.dataset.timestamp || '');
    if (!Number.isFinite(seconds)) return;

    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  }

  previewContainer.addEventListener('pointerdown', (e) => {
    if (typeof e.button === 'number' && e.button !== 0) return;
    handleTimestampActivate(e);
  }, true);

  function getTextContent(element) {
    let text = '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ALL, null, false);
    let node;

    // preserves custom YouTube emojis
    if (!element._emojiMap) element._emojiMap = new Map();

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tname = node.tagName.toLowerCase();
        if (tname === 'br') {
          text += '\n';
        } else if (tname === 'img') {
          const isCustomEmoji = node.classList.contains('emoji') || node.src.includes('youtube.com/s/gaming/emoji')

          if (isCustomEmoji) {
            const emojiId = 'EMOJI_' + Math.random().toString(36).substr(2, 9);

            const prevSibling = node.previousSibling;
            const nextSibling = node.nextSibling;
            let prefix = '';
            let suffix = '';

            if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
              const prevText = prevSibling.textContent;
              const formatSymbols = /[\*_\-]$/;
              if (formatSymbols.test(prevText)) {
                prefix = prevText.match(formatSymbols)[0];
              }
            }

            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
              const nextText = nextSibling.textContent;
              const formatSymbols = /^[\*_\-]/;
              if (formatSymbols.test(nextText)) {
                suffix = nextText.match(formatSymbols)[0];
              }
            }

            text += `${prefix}{{${emojiId}}}${suffix}`;
            element._emojiMap.set(emojiId, node.cloneNode(true));
          } else if (node.alt) {
            text += node.alt;
          }
        } else if (tname === 'div' && node !== element) {
          if (text && !text.endsWith('\n')) text += '\n';
        }
      }
    }
    return text;
  }

  function togglePreview() {
    manuallyToggled = true;
    if (previewContainer.style.display === 'none' || previewContainer.style.display === '') {
      previewContainer.style.display = 'block';
      setTimeout(() => {
        previewContainer.style.transform = 'translateY(0)';
        previewContainer.style.opacity = '1';
      }, 10);
      updatePreview();
    } else {
      previewContainer.style.transform = 'translateY(-6px)';
      previewContainer.style.opacity = '0';
      setTimeout(() => { previewContainer.style.display = 'none'; }, 200);
    }
  }

  function updatePreviewButtonVisibility() {
    if (!previewToggleBtn) return;
    const content = input.innerHTML.trim();
    const hasText = content !== '' && content !== '<br>' && content.length > 0;
    previewToggleBtn.style.display = hasText ? 'inline-flex' : 'none';
    if (defaultSettings.autoPreview && hasText && !manuallyToggled) {
      if (previewContainer.style.display === 'none') togglePreview();
    } else if (!hasText) {
      manuallyToggled = false; // reset when no text
      if (previewContainer.style.display === 'block') {
        previewContainer.style.transform = 'translateY(-6px)';
        previewContainer.style.opacity = '0';
        setTimeout(() => { previewContainer.style.display = 'none'; }, 200);
      }
    }
  }

  input.addEventListener('input', () => {
    updatePreview();
    setTimeout(updatePreviewButtonVisibility, 10);
  });
  input.addEventListener('focus', () => {
    updatePreview();
    setTimeout(updatePreviewButtonVisibility, 10);
  });
  input.addEventListener('blur', () => {
    updatePreview();
    setTimeout(updatePreviewButtonVisibility, 10);
  });

  const inputObserver = new MutationObserver(() => {
    setTimeout(() => {
      updatePreview();
      updatePreviewButtonVisibility();
    }, 10);
  });
  inputObserver.observe(input, { childList: true, subtree: true, characterData: true });

  function createButton({ label, classes = [], onClick }) {
    const btn = document.createElement('button');
    btn.innerHTML =  label;
    btn.type = 'button';
    btn.classList.add('yt-comments-enhanced-buttons', ...classes);
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      try { onClick(); } catch (err) {}
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return btn;
  }

  function applyWrapSymbol(symbol) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const cb = findAncestorCommentBox(sel.anchorNode);
    if (cb !== commentBox) return;
    toggleFormatting(symbol);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function addButtonsIfMissing() {
    if (!emojiButton) return;
    if (commentBox.querySelector('.yt-comments-enhanced-buttons')) return;

    // format buttons
    const configs = [
      { label: '<b>B</b>', classes: ['yt-comments-enhanced-bold'], onClick: () => applyWrapSymbol('*') },
      { label: '<i>I</i>', classes: ['yt-comments-enhanced-italic'], onClick: () => applyWrapSymbol('_') },
      { label: '<s>S</s>', classes: ['yt-comments-enhanced-strikethrough'], onClick: () => applyWrapSymbol('-') },
      { label: '<u><i>T</i></u><sub>ₓ</sub>', classes: ['yt-comments-enhanced-clear'], onClick: () => clearAllFormattingInEditable(input) },
      { label: '🖋', classes: ['yt-comments-enhanced-preview-toggle'], onClick: () => togglePreview() },
      { label: '⏱', classes: ['yt-comments-enhanced-timestamp'], onClick: () => insertCurrentVideoTimestamp(input) },
    ];

    // insert format buttons next to emoji button
    configs.reverse().forEach(cfg => {
      const btn = createButton(cfg);
      emojiButton.insertAdjacentElement('afterend', btn);
      if (cfg.classes.includes('yt-comments-enhanced-preview-toggle')) {
        previewToggleBtn = btn;
        // show preview button immediately if editing comment
        previewToggleBtn.style.display = (input && input.textContent && input.textContent.trim().length > 0) ? 'inline-flex' : 'none';
      }
    });

    setButtonsVisibility(defaultSettings.showButtons);
  }

  function setButtonsVisibility(show) {
    const btns = commentBox.querySelectorAll('.yt-comments-enhanced-buttons');
    btns.forEach(b => {
      if (show) {
        b.classList.remove('yt-comments-enhanced-buttons--hidden');
      } else {
        b.classList.add('yt-comments-enhanced-buttons--hidden');
      }
    });
  }

  commentBox._ytEnhance_setButtonsVisibility = setButtonsVisibility;
  commentBox._ytEnhance_addButtonsIfMissing = addButtonsIfMissing;

  addButtonsIfMissing();

  // show preview automatically if auto preview is enabled
  if (defaultSettings.autoPreview && input.textContent && input.textContent.trim().length > 0) {
    previewContainer.style.display = 'block';
    setTimeout(() => {
      previewContainer.style.transform = 'translateY(0)';
      previewContainer.style.opacity = '1';
    }, 10);
    updatePreview();
  }
}

function updateAllCommentBoxesButtons() {
  const boxes = document.querySelectorAll('#commentbox');
  boxes.forEach(cb => {
    if (cb.dataset.enhanced === 'true') {
      if (typeof cb._ytEnhance_addButtonsIfMissing === 'function') cb._ytEnhance_addButtonsIfMissing();
      if (typeof cb._ytEnhance_setButtonsVisibility === 'function') cb._ytEnhance_setButtonsVisibility(defaultSettings.showButtons);
      const input = cb.querySelector('#contenteditable-root');
      if (input) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
}

// TEXT FORMATTING //
function formatText(input) {
  let output = input;

  // timestamps
  if (window.location.href.includes('/watch?v=')) { // community post don't have timestamps
    output = output.replace(/(?:^|\s)((\d{1,2}:)?(\d{1,2}):(\d{2}))(?=\s|$)/g, (match, timestamp) => {
      return match.replace(
        timestamp,
        `<span class="yt-enhanced-timestamp" data-timestamp="${timestamp}" style="color:#3ea2f7; cursor:pointer">${timestamp}</span>`
      );
    });
  }

  // links (not perfect but works ig)
  output = output.replace(/(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/\S*)?/gi, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#3ea2f7">${url}</a>`;
  });

  // hashtags
  output = output.replace(/(^|\s)#([A-Za-z0-9_]+)(?=\s|$)/g, (match, space, hashtag) => {
    return `${space}<a href="https://www.youtube.com/hashtag/${hashtag}" target="_blank" rel="noopener noreferrer" style="color:#3ea2f7">#${hashtag}</a>`;
  });

 // triple combinations
  output = output.replace(/(^|\s)\*_-([^-\n]*?)-_\*(?=\s|$)/g, '$1<span style="font-weight:500;"><span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough">$2</span></span></span>');
  output = output.replace(/(^|\s)\*-_([^_\n]*?)_-\*(?=\s|$)/g, '$1<span style="font-weight:500;"><span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized">$2</span></span></span>');
  output = output.replace(/(^|\s)_\*-([^-\n]*?)-\*_(?=\s|$)/g, '$1<span class="yt-core-attributed-string--italicized"><span style="font-weight:500;"><span class="yt-core-attributed-string--strikethrough">$2</span></span></span>');
  output = output.replace(/(^|\s)_-\*([^*\n]*?)\*-_(?=\s|$)/g, '$1<span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough"><span style="font-weight:500;">$2</span></span></span>');
  output = output.replace(/(^|\s)-\*_([^_\n]*?)_\*-(?=\s|$)/g, '$1<span class="yt-core-attributed-string--strikethrough"><span style="font-weight:500;"><span class="yt-core-attributed-string--italicized">$2</span></span></span>');
  output = output.replace(/(^|\s)-_\*([^*\n]*?)\*_-(?=\s|$)/g, '$1<span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized"><span style="font-weight:500;">$2</span></span></span>');

  // double combinations
  output = output.replace(/(^|\s)\*_([^_\n]*?)_\*(?=\s|$)/g, '$1<span style="font-weight:500;"><span class="yt-core-attributed-string--italicized">$2</span></span>');
  output = output.replace(/(^|\s)_\*([^*\n]*?)\*_(?=\s|$)/g, '$1<span class="yt-core-attributed-string--italicized"><span style="font-weight:500;">$2</span></span>');
  output = output.replace(/(^|\s)\*-([^-\n]*?)-\*(?=\s|$)/g, '$1<span style="font-weight:500;"><span class="yt-core-attributed-string--strikethrough">$2</span></span>');
  output = output.replace(/(^|\s)-\*([^*\n]*?)\*-(?=\s|$)/g, '$1<span class="yt-core-attributed-string--strikethrough"><span style="font-weight:500;">$2</span></span>');
  output = output.replace(/(^|\s)_-([^-\n]*?)-_(?=\s|$)/g, '$1<span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough">$2</span></span>');
  output = output.replace(/(^|\s)-_([^_\n]*?)_-(?=\s|$)/g, '$1<span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized">$2</span></span>');

  // single combination
  output = output.replace(/(^|\s)\*([^*\n]*?)\*(?=\s|$)/g, '$1<span style="font-weight:500;">$2</span>');
  output = output.replace(/(^|\s)_([^_\n]*?)_(?=\s|$)/g, '$1<span class="yt-core-attributed-string--italicized">$2</span>');
  output = output.replace(/(^|\s)-([^-\n]*?(-[^-\s\n]+)*?)-(?=\s|$)/g, '$1<span class="yt-core-attributed-string--strikethrough">$2</span>');

  return output.trim();
}

function scan() {
  try {
    const boxes = document.querySelectorAll('#commentbox');
    boxes.forEach(enhanceCommentBox);
  } catch (err) {
  }
}

scan();
