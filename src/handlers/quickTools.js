import appSettings from 'lib/settings';
import quickTools from 'components/quickTools';
import createKeyboardEvent from 'utils/keyboardEvent';
import searchSettings from 'settings/searchSettings';

/**@type {HTMLInputElement | HTMLTextAreaElement} */
let input;

const state = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
};

const events = {
  shift: [],
  alt: [],
  ctrl: [],
  meta: [],
};

/**
 * @typedef { 'shift' | 'alt' | 'ctrl' | 'meta' } QuickToolsEvent
 * 
 * @typedef {(value: boolean)=>void} QuickToolsEventListener
 */

quickTools.$input.addEventListener('input', (e) => {
  const key = e.target.value.toUpperCase();
  quickTools.$input.value = '';
  if (!key || key.length > 1) return;
  const keyCombination = getKeys({ key });

  if (keyCombination.shiftKey && !keyCombination.ctrlKey) {
    resetKeys();
    editorManager.editor.insert(shiftKeyMapping(key));
    return;
  }

  const event = createKeyboardEvent('keydown', keyCombination);
  input = input || editorManager.editor.textInput.getElement();

  resetKeys();
  input.dispatchEvent(event);
});

// quickTools.$input.addEventListener('focus', () => {
//   system.setInputType(appSettings.value.keyboardMode);
// });

export const key = {
  get shift() {
    return state.shift;
  },
  get alt() {
    return state.alt;
  },
  get ctrl() {
    return state.ctrl;
  },
  get meta() {
    return state.meta;
  },
  /**
   * Add listener when key changes
   * @param {QuickToolsEvent} event 
   * @param {QuickToolsEventListener} callback 
   */
  on(event, callback) {
    events[event].push(callback);
  },
  /**
   * Remove listener
   * @param {QuickToolsEvent} event 
   * @param {QuickToolsEventListener} callback 
   */
  off(event, callback) {
    events[event] = events[event].filter((cb) => cb !== callback);
  },
};


/**
 * Performs quick actions
 * @param {string} action 
 * @param {string} value 
 */
export default function actions(action, value) {
  const { editor } = editorManager;
  const { $input, $replaceInput } = quickTools;

  if (Object.keys(state).includes(action)) {
    setInput();
    value = !state[action];
    state[action] = value;
    events[action].forEach((cb) => cb(value));
    if (Object.values(state).includes(true)) {
      $input.focus();
    } else if (input) {
      input.focus();
    } else {
      $input.blur();
    }

    return value;
  }

  switch (action) {
    case 'insert':
      editor.insert(value);
      return true;

    case 'command':
      editor.execCommand(value);
      return true;

    case 'key': {
      const event = createKeyboardEvent('keydown', getKeys({ keyCode: value }));
      resetKeys();
      setInput();
      input.dispatchEvent(event);
      return true;
    }

    case 'search':
      toggleSearch();
      return actionStack.has('search-bar');

    case 'toggle':
      toggle();
      return true;

    case 'set-height':
      setHeight(value);
      return true;

    case 'search-prev':
      find(false, true);
      return true;

    case 'search-next':
      find(true, true);
      return true;

    case 'search-settings':
      searchSettings();
      return true;

    case 'search-replace':
      editor.replace($replaceInput.value || '');
      return true;

    case 'search-replace-all':
      editor.replaceAll($replaceInput.value || '');
      return true;

    default:
      return false;
  }
}

function setInput() {
  const { activeElement } = document;
  if (
    !activeElement
    || activeElement === quickTools.$input
    || activeElement === document.body
  ) return;
  input = activeElement;
}

function toggleSearch() {
  const $footer = quickTools.$footer;
  const $searchRow1 = quickTools.$searchRow1;
  const $searchRow2 = quickTools.$searchRow2;
  const $searchInput = quickTools.$searchInput.el;
  const $toggler = quickTools.$toggler;
  const { editor } = editorManager;
  const selectedText = editor.getCopyText();

  if (!$footer.contains($searchRow1)) {
    const { className } = quickTools.$toggler;
    const $content = [...$footer.children];
    const footerHeight = getFooterHeight();

    $toggler.className = 'floating icon clearclose';
    $footer.content = [$searchRow1, $searchRow2];
    $searchInput.value = selectedText || '';
    if (!selectedText) $searchInput.focus();

    $searchInput.oninput = function () {
      if (this.value) find(false, false);
    };

    setFooterHeight(2);
    find(false, false);

    actionStack.push({
      id: 'search-bar',
      action: () => {
        removeSearch();
        $footer.content = $content;
        $toggler.className = className;
        setFooterHeight(footerHeight);
      },
    });
  } else {
    const inputValue = $searchInput?.value || '';
    if (inputValue !== selectedText) {
      $searchInput.value = selectedText;
      $searchInput.focus();
      find(false, false);
      return;
    }

    actionStack.get('search-bar').action();
  }
  editor.resize(true);
}

function toggle() {
  // if search is active, remove it
  const searchBar = actionStack.get('search-bar');
  if (searchBar?.action) {
    searchBar.action();
    return;
  }

  const $footer = quickTools.$footer;
  const $row1 = quickTools.$row1;
  const $row2 = quickTools.$row2;

  if (!$footer.contains($row1)) {
    setHeight();
  } else if (!$footer.contains($row2)) {
    setHeight(2);
  } else {
    setHeight(0);
  }
  focusEditor();
}

function setHeight(height = 1) {
  const { $footer, $row1, $row2 } = quickTools;
  const { editor } = editorManager;

  setFooterHeight(height);
  appSettings.update({ quickTools: height }, false);
  editor.resize(true);

  if (!height) {
    $row1.remove();
    $row2.remove();
    return;
  }

  if (height >= 1) {
    $row1.style.scrollBehavior = 'unset';
    $footer.append($row1);
    $row1.scrollLeft = parseInt(localStorage.quickToolRow1ScrollLeft, 10);
    --height;
  }

  if (height >= 1) {
    $row2.style.scrollBehavior = 'unset';
    $footer.append($row2);
    $row2.scrollLeft = parseInt(localStorage.quickToolRow2ScrollLeft, 10);
    --height;
  }
}

/**
 * Removes search bar from footer
 */
function removeSearch() {
  const { $footer, $searchRow1, $searchRow2 } = quickTools;

  if (!$footer.contains($searchRow1)) return;
  actionStack.remove('search-bar');
  $footer.removeAttribute('data-searching');
  $searchRow1.remove();
  $searchRow2.remove();
  focusEditor();
}

/**
 * Finds the next/previous search result
 * @param {number} skip Number of search results to skip
 * @param {boolean} backward Whether to search backward
 */
function find(skip, backward) {
  const { $searchInput } = quickTools;
  editorManager.editor.find($searchInput.value, {
    skipCurrent: skip,
    backwards: backward,
    ...appSettings.value.search,
  });

  updateSearchState();
}

function updateSearchState() {
  const MAX_COUNT = 999;
  const { editor } = editorManager;
  const { $searchPos, $searchTotal } = quickTools;

  let regex = editor.$search.$options.re;
  let all = 0;
  let before = 0;
  if (regex) {
    const value = editor.getValue();
    const offset = editor.session.doc.positionToIndex(
      editor.selection.anchor,
    );
    let last = (regex.lastIndex = 0);
    let m;
    while ((m = regex.exec(value))) {
      all++;
      last = m.index;
      if (last <= offset) before++;
      if (all > MAX_COUNT) break;
      if (!m[0]) {
        regex.lastIndex = last += 1;
        if (last >= value.length) break;
      }
    }
  }
  $searchTotal.textContent = all > MAX_COUNT ? '999+' : all;
  $searchPos.textContent = before;
}

/**
 * 
 * @param {number} height 
 * @returns 
 */
function setFooterHeight(height) {
  const { $toggler, $footer, $searchRow1 } = quickTools;
  if (height) root.setAttribute('footer-height', height);
  else root.removeAttribute('footer-height');

  if ($toggler.classList.contains('clearclose')) return;

  if (height > 1 && !$footer.contains($searchRow1)) {
    $toggler.classList.remove('keyboard_arrow_up');
    $toggler.classList.add('keyboard_arrow_down');
  } else {
    $toggler.classList.remove('keyboard_arrow_down');
    $toggler.classList.add('keyboard_arrow_up');
  }
}

function getFooterHeight() {
  return parseInt(root.getAttribute('footer-height')) || 0;
}

function focusEditor() {
  const { editor, activeFile } = editorManager;
  if (activeFile.focused) {
    editor.focus();
  }
}

function resetKeys() {
  state.shift = false;
  events.shift.forEach((cb) => cb(false));
  state.alt = false;
  events.alt.forEach((cb) => cb(false));
  state.ctrl = false;
  events.ctrl.forEach((cb) => cb(false));
  state.meta = false;
  events.meta.forEach((cb) => cb(false));
  editorManager.editor.focus();
}

/**
 * Gets the current state of the modifier keys
 * @param {object} key
 * @param {int} [key.keyCode]
 * @param {string} [key.key]
 * @returns 
 */
function getKeys(key = {}) {
  return {
    ...key,
    shiftKey: state.shift,
    altKey: state.alt,
    ctrlKey: state.ctrl,
    metaKey: state.meta,
  };
}

function shiftKeyMapping(char) {
  switch (char) {
    case '1': return '!';
    case '2': return '@';
    case '3': return '#';
    case '4': return '$';
    case '5': return '%';
    case '6': return '^';
    case '7': return '&';
    case '8': return '*';
    case '9': return '(';
    case '0': return ')';
    case '-': return '_';
    case '=': return '+';
    case '[': return '{';
    case ']': return '}';
    case '\\': return '|';
    case ';': return ':';
    case '\'': return '"';
    case ',': return '<';
    case '.': return '>';
    case '/': return '?';
    default: return char.toUpperCase();
  }
}
