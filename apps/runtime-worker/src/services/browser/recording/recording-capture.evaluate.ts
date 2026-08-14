// buildRecorderScript returns a self-contained IIFE string for injection into the browser page.
// The string is plain JS — no TS syntax inside the template literal.
import { recordingActionableBrowserScript } from "./recording-actionable.js";
import { RECORDER_HOST_ID } from "./recording-overlay.constants.js";
import { chooseBestSelectorCandidate } from "./recording-candidate.js";

export { chooseBestSelectorCandidate };

export function buildRecorderScript(testidCandidates: readonly string[]): string {
  return `
(function() {
  if (window.__vindicateRecorderActive) return;
  window.__vindicateRecorderActive = true;
  window.__vindicateRecorderStopped = false;
  window.__vindicateRecorderStopping = false;

  const HOST_ID = ${JSON.stringify(RECORDER_HOST_ID)};
  const TESTID_CANDIDATES = ${JSON.stringify([...testidCandidates])};

  var paused = false;
  var stepCount = 0;
  var flashTimer = null;
  var shadowRoot = null;
  var statusDot = null;
  var statusText = null;
  var stepCounterEl = null;
  var flashEl = null;
  var pauseBtn = null;
  var snapshotBtn = null;
  var stopBtn = null;
  var infoBtn = null;
  var infoTooltip = null;
  var remountObserver = null;
  var boxEl = null;
  var dragHandleEl = null;
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragStartLeft = 0;
  var dragStartTop = 0;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function applyHostPosition(host, left, top) {
    if (!host) return;
    var maxLeft = Math.max(0, window.innerWidth - host.offsetWidth);
    var maxTop = Math.max(0, window.innerHeight - host.offsetHeight);
    var nextLeft = clamp(left, 0, maxLeft);
    var nextTop = clamp(top, 0, maxTop);
    host.style.left = String(nextLeft) + 'px';
    host.style.top = String(nextTop) + 'px';
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    window.__vindicateRecorderPosition = { left: nextLeft, top: nextTop };
  }

  function restoreHostPosition(host) {
    if (!host) return;
    var pos = window.__vindicateRecorderPosition;
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
    applyHostPosition(host, pos.left, pos.top);
  }

  function onDragMove(e) {
    if (!isDragging) return;
    var host = getHost();
    if (!host) return;
    var nextLeft = dragStartLeft + (e.clientX - dragStartX);
    var nextTop = dragStartTop + (e.clientY - dragStartY);
    applyHostPosition(host, nextLeft, nextTop);
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove, true);
    document.removeEventListener('mouseup', onDragEnd, true);
  }

  function findTestid(el, candidates) {
    for (const attr of candidates) {
      const val = el.getAttribute(attr);
      if (val !== null && val.length > 0) {
        return { value: val, attr: attr };
      }
    }
    return null;
  }

  ${recordingActionableBrowserScript()}

  function chooseBestCandidate(candidates) {
    var nonDynamic = candidates.filter(function(c) { return !c.dynamic; });
    var pool = nonDynamic.length > 0 ? nonDynamic : candidates;
    // parity: recording-candidate.ts STRATEGY_ORDER — must match the strategy names buildCandidates
    // actually pushes ('testid'/'scoped'/'dom_id'/'role_name'/'attr_combo'/'sibling_text'/'nth'), not
    // legacy display names.
    var order = ['testid', 'scoped', 'dom_id', 'role_name', 'text', 'attr_combo', 'sibling_text', 'nth'];
    for (var i = 0; i < order.length; i++) {
      var strategy = order[i];
      var hit = pool.find(function(c) { return c.strategy === strategy; });
      if (hit !== undefined) {
        return hit;
      }
    }
    return pool[0] || null;
  }

  // parity: recording-candidate.ts isGeneratedDomId / ref-generator.ts
  function isGeneratedDomId(id) {
    return /^[a-z]+-[0-9a-f]{6,}$/i.test(id) || /^\\d+$/.test(id) || /^[a-z0-9_]*-?:[a-z0-9]+:$/i.test(id) || /^sc-[A-Za-z]/.test(id);
  }

  function findRepeatingContainer(el) {
    var current = el.parentElement;
    while (current) {
      var tag = current.tagName.toLowerCase();
      var role = current.getAttribute('role');
      if (tag === 'tr' || tag === 'li' || role === 'row' || role === 'listitem' || role === 'gridcell') {
        if (role === 'gridcell') {
          var row = current.closest('[role=row], tr');
          return row || current;
        }
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  // parity: interactive-capture.evaluate.ts xpathLiteral
  function xpathLiteral(s) {
    var SQ = "'";
    if (s.indexOf('"') === -1) return '"' + s + '"';
    if (s.indexOf(SQ) === -1) return SQ + s + SQ;
    var segs = s.split('"');
    return 'concat(' + segs.map(function (seg, i) {
      return i < segs.length - 1 ? '"' + seg + '", ' + SQ + '"' + SQ : '"' + seg + '"';
    }).join(', ') + ')';
  }

  // parity: recording-candidate.ts buildSiblingTextCandidate
  function buildSiblingTextCandidate(el) {
    var parent = el.parentElement;
    if (!parent) return null;
    var texts = [];
    var siblings = Array.prototype.slice.call(parent.children);
    for (var i = 0; i < siblings.length; i++) {
      var sib = siblings[i];
      if (sib === el || isInteractive(sib)) continue;
      var t = getAccessibleName(sib);
      if (t) texts.push(t);
    }
    if (texts.length !== 1) return null;
    var tag = el.tagName.toLowerCase();
    var lit = xpathLiteral(texts[0]);
    var xp = '//' + tag + '[preceding-sibling::*[normalize-space()=' + lit + '] or following-sibling::*[normalize-space()=' + lit + ']]';
    return { strategy: 'sibling_text', value: xp, strength: 'medium' };
  }

  // ARIA implicit role for an element with no explicit 'role' attribute — NOT the tag name itself.
  // <tr>'s implicit role is "row", not "tr"; getByRole('tr', ...) matches nothing in a real browser
  // (Playwright resolves against the computed accessibility tree, not raw tag names).
  function implicitRole(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit;
    var tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'input') {
      var t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'range') return 'slider';
      if (t === 'number') return 'spinbutton';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'option') return 'option';
    if (tag === 'summary') return 'button';
    if (tag === 'tr') return 'row';
    if (tag === 'li') return 'listitem';
    if (tag === 'td') return 'gridcell';
    return 'generic';
  }

  function buildScopedCandidate(el) {
    var container = findRepeatingContainer(el);
    if (!container) return null;
    var rowRole = implicitRole(container);
    var rowName = getAccessibleName(container);
    if (!rowName) return null;
    var targetRole = implicitRole(el);
    var targetName = getAccessibleName(el);
    if (!targetName) return null;
    return {
      strategy: 'scoped',
      value: targetRole + '[name="' + targetName + '"]',
      container: { role: rowRole, name: rowName },
      strength: 'strong'
    };
  }

  function getCssSelector(el) {
    if (el.id && !isGeneratedDomId(el.id) && !/^[0-9]/.test(el.id)) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    const name = el.getAttribute('name');
    if (type) return tag + '[type="' + type + '"]';
    if (name) return tag + '[name="' + name + '"]';
    return tag;
  }

  function getXPath(el, foundTestid) {
    if (foundTestid !== null) {
      return '//*[@' + foundTestid.attr + '="' + foundTestid.value.replace(/"/g, '\\\\"') + '"]';
    }
    const tag = el.tagName.toLowerCase();
    const id = el.id;
    if (id && !/^[0-9]/.test(id)) return '//' + tag + '[@id="' + id + '"]';
    const label = el.getAttribute('aria-label');
    if (label) return '//' + tag + '[@aria-label="' + label + '"]';
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return '//' + tag + '[@placeholder="' + placeholder + '"]';
    return '//' + tag;
  }

  // Space-join descendant text (ARIA accessible-name spacing) so abutting child elements don't run together.
  function elementText(el) {
    var out = '';
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        out += ' ' + elementText(node) + ' ';
      }
    }
    return out;
  }

  function getAccessibleName(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl) return lbl.textContent.trim();
    }
    if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    const text = elementText(el).replace(/\\s+/g, ' ').trim();
    if (text && text.length < 80) return text;
    return '';
  }

  // Same fallback chain as getAccessibleName, but for the 'text' strategy candidate specifically — which
  // Playwright renders via getByText(value, {exact:true}) at act time, a genuinely different matching
  // algorithm from getByRole(role,{name}) (which 'role_name'/'scoped' candidates use getAccessibleName
  // for). getByRole matches the ARIA accessible name — why elementText inserts a synthetic space per
  // child element ('ColomboColombo District' -> 'Colombo Colombo District'). getByText matches raw
  // concatenated text content instead, with no such insertion: confirmed live against a real production
  // timeout — a Klarna checkout payment radio's click-delegate label renders 'Credit or debit card' and
  // 'Secure and encrypted' in adjacent <div>s with no whitespace between them in the DOM, and getByText
  // only ever matched the *unspaced* concatenation, never the accessible-name-style spaced version
  // getAccessibleName would produce.
  function getTextCandidateName(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl) return lbl.textContent.trim();
    }
    if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text && text.length < 80) return text;
    return '';
  }

  function buildCandidates(el) {
    const candidates = [];
    const foundTestid = findTestid(el, TESTID_CANDIDATES);
    if (foundTestid !== null) {
      candidates.push({ strategy: 'testid', value: foundTestid.value, attr: foundTestid.attr, strength: 'strong' });
    }
    const scoped = buildScopedCandidate(el);
    if (scoped !== null) candidates.push(scoped);
    if (el.id && !isGeneratedDomId(el.id)) {
      candidates.push({ strategy: 'dom_id', value: el.id, strength: 'strong' });
    }
    const role = implicitRole(el);
    const name = getAccessibleName(el);
    // Only offer a role_name candidate when the name is matchable by getByRole(role,{name}): an author
    // name (any role), or descendant text on a name-from-content role. alert/status text in a child is
    // not the element's accessible name — skip it and let attr_combo/nth carry the locator.
    // Canonical home + drift guard: snapshot/name-from-content.ts (pinned by name-from-content.test.ts).
    var ROLE_NAME_FROM_CONTENT = ['button','link','heading','menuitem','menuitemcheckbox','menuitemradio','option','radio','checkbox','switch','tab','treeitem','cell','gridcell','columnheader','rowheader','row','tooltip'];
    var authorName = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.labels && el.labels.length > 0) || el.getAttribute('placeholder'));
    if (name && (ROLE_NAME_FROM_CONTENT.indexOf(role) !== -1 || authorName)) candidates.push({ strategy: 'role_name', value: role + '[name="' + name + '"]', strength: 'strong' });
    // Role-less container (no explicit role attribute, not a form-control tag with its own name
    // semantics) with real text — e.g. a custom multi-select row div whose own text is its label.
    // getByText matches the same way capture's T5 tier does; skipped for form-control tags since
    // role_name/getByRole is the more precise match there when one applies.
    var tag = el.tagName.toLowerCase();
    var isFormControlTag = ['input', 'select', 'textarea', 'button', 'a'].indexOf(tag) !== -1;
    if (el.getAttribute('role') === null && !isFormControlTag) {
      var textCandidateName = getTextCandidateName(el);
      if (textCandidateName) {
        candidates.push({ strategy: 'text', value: textCandidateName, strength: 'medium' });
      }
    }
    var typeAttr = el.getAttribute('type');
    var nameAttr = el.getAttribute('name');
    var attrParts = [];
    if (typeAttr) attrParts.push('@type="' + typeAttr + '"');
    if (nameAttr) attrParts.push('@name="' + nameAttr + '"');
    if (attrParts.length > 0) {
      candidates.push({ strategy: 'attr_combo', value: '//' + tag + '[' + attrParts.join(' and ') + ']', strength: 'medium' });
    }
    // Last resort before position: no accessible name at all (broken/unlabeled markup) — an unambiguous
    // single text-bearing sibling is still a real, human-readable identifier. Never a substitute for a
    // real name; only offered when one genuinely doesn't exist.
    if (!name) {
      var siblingText = buildSiblingTextCandidate(el);
      if (siblingText !== null) candidates.push(siblingText);
    }
    candidates.push({ strategy: 'nth', value: getXPath(el, foundTestid), strength: 'weak' });
    return candidates;
  }

  function buildElementMeta(el) {
    return {
      role: implicitRole(el),
      name: getAccessibleName(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
    };
  }

  function eventTargetEl(e) {
    var path = e.composedPath && e.composedPath();
    if (path && path.length > 0) return path[0];
    return e.target;
  }

  function getHost() {
    return document.getElementById(HOST_ID);
  }

  function isRecorderUi(el) {
    if (!el) return true;
    var host = getHost();
    if (!host) return false;
    if (el === host) return true;
    var root = el.getRootNode && el.getRootNode();
    if (shadowRoot !== null && root === shadowRoot) return true;
    return false;
  }

  function updateStepCounter() {
    if (stepCounterEl) stepCounterEl.textContent = String(stepCount);
  }

  function flashLastAction(label) {
    if (!flashEl) return;
    flashEl.textContent = label;
    flashEl.style.opacity = '1';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function() {
      if (!flashEl) return;
      flashEl.style.opacity = '0';
      setTimeout(function() {
        if (flashEl && flashEl.style.opacity === '0') flashEl.textContent = '';
      }, 300);
    }, 1500);
  }

  function setErrorUi(message) {
    if (boxEl) boxEl.style.background = '#991b1b';
    if (statusDot) {
      statusDot.className = '';
      statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fca5a5;display:inline-block';
    }
    if (statusText) statusText.textContent = message;
    if (pauseBtn) pauseBtn.disabled = true;
    if (snapshotBtn) snapshotBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
  }

  function setRecordingUi() {
    if (boxEl) boxEl.style.background = '#ef4444';
    if (statusDot) {
      statusDot.className = '';
      statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block;animation:__vindicate-pulse 1s infinite';
    }
    if (statusText) statusText.textContent = paused ? 'Paused' : 'Recording…';
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      pauseBtn.title = paused ? 'Resume capturing steps' : 'Pause capturing — scroll or navigate without recording';
    }
    if (snapshotBtn) {
      snapshotBtn.style.display = '';
      snapshotBtn.disabled = paused;
      snapshotBtn.textContent = 'Snapshot';
      snapshotBtn.style.opacity = paused ? '0.6' : '1';
      snapshotBtn.style.cursor = paused ? 'not-allowed' : 'pointer';
    }
    if (stopBtn) {
      stopBtn.style.display = '';
      stopBtn.disabled = false;
      stopBtn.textContent = 'Stop';
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
    }
    updateStepCounter();
  }

  function setStoppingUi() {
    if (boxEl) boxEl.style.background = '#dc2626';
    if (statusDot) {
      statusDot.style.animation = 'none';
      statusDot.className = '__vindicate-recorder-spinner';
      statusDot.style.cssText = '';
    }
    if (statusText) statusText.textContent = 'Stopping…';
    if (pauseBtn) pauseBtn.disabled = true;
    if (snapshotBtn) {
      snapshotBtn.disabled = true;
      snapshotBtn.style.opacity = '0.6';
      snapshotBtn.style.cursor = 'wait';
    }
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = '…';
      stopBtn.style.opacity = '0.6';
      stopBtn.style.cursor = 'wait';
    }
  }

  function setStoppedUi() {
    window.__vindicateRecorderStopped = true;
    window.__vindicateRecorderStopping = false;
    if (boxEl) boxEl.style.background = '#475569';
    if (statusDot) {
      statusDot.className = '';
      statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block';
    }
    if (statusText) statusText.textContent = 'Stopped — review in VS Code';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (snapshotBtn) snapshotBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (infoBtn) infoBtn.style.display = 'none';
    if (infoTooltip) infoTooltip.style.display = 'none';
  }

  window.__vindicateSetRecorderStoppingUi = setStoppingUi;
  window.__vindicateSetRecorderStoppedUi = setStoppedUi;
  window.__vindicateSetRecorderRecordingUi = setRecordingUi;

  window.__vindicateSetRecorderHidden = function(hide) {
    if (hide) {
      beginScreenshotHide();
    } else {
      endScreenshotHide();
    }
  };

  window.__vindicateScreenshotHideDepth = 0;

  function beginScreenshotHide() {
    var host = getHost();
    if (!host) return;
    window.__vindicateScreenshotHideDepth++;
    if (window.__vindicateScreenshotHideDepth === 1) {
      host.style.visibility = 'hidden';
      host.style.opacity = '0';
    }
  }

  function endScreenshotHide() {
    window.__vindicateScreenshotHideDepth = Math.max(0, window.__vindicateScreenshotHideDepth - 1);
    var host = getHost();
    if (!host) return;
    if (window.__vindicateScreenshotHideDepth === 0) {
      host.style.visibility = '';
      host.style.opacity = '';
    }
  }

  window.__vindicateBeginScreenshotHide = beginScreenshotHide;
  window.__vindicateEndScreenshotHide = endScreenshotHide;

  window.__vindicateSetRecorderPaused = function(p) {
    paused = !!p;
    setRecordingUi();
    safeRecordEvent({ event: '__paused', paused: paused });
  };

  // Server-pushed pause-state sync only — applies the recording session's real (server-side) paused
  // state to THIS page's local flag + banner, without re-emitting a '__paused' event. Used to broadcast
  // a pause toggled on one open page (main page or a popup) to every other open page in the same
  // recording, so a stale banner never implies "still recording" on a page that's actually paused.
  // Deliberately separate from __vindicateSetRecorderPaused above: that one is for a human/external trigger
  // and always reports back to the server; calling it here for a server-originated sync would re-emit
  // the same event back to the server, which would re-broadcast it, looping forever.
  window.__vindicateApplyPausedState = function(p) {
    paused = !!p;
    setRecordingUi();
  };

  function safeRecordEvent(payload) {
    try {
      if (typeof window.__vindicateRecordEvent !== 'function') {
        setErrorUi('Recorder lost — reopen recording');
        return;
      }
      window.__vindicateRecordEvent(payload);
      if (payload.action) {
        stepCount++;
        updateStepCounter();
        var name = (payload.element && payload.element.name) || '';
        var label = '✓ ' + payload.action + (name ? ' · ' + name : '');
        flashLastAction(label);
      }
    } catch (err) {
      setErrorUi('Recorder lost — reopen recording');
    }
  }

  function emit(eventType, el, extra) {
    if (window.__vindicateRecorderStopped || paused) return;
    const candidates = buildCandidates(el);
    safeRecordEvent(Object.assign({
      action: eventType,
      timestamp: new Date().toISOString(),
      candidates: candidates,
      chosen: chooseBestCandidate(candidates),
      element: buildElementMeta(el),
    }, extra || {}));
  }

  function emitDrag(sourceEl, targetEl) {
    if (window.__vindicateRecorderStopped || paused) return;
    const sourceCandidates = buildCandidates(sourceEl);
    const targetCandidates = buildCandidates(targetEl);
    safeRecordEvent({
      action: 'drag',
      timestamp: new Date().toISOString(),
      candidates: sourceCandidates,
      chosen: chooseBestCandidate(sourceCandidates),
      element: buildElementMeta(sourceEl),
      target: {
        candidates: targetCandidates,
        chosen: chooseBestCandidate(targetCandidates),
        element: buildElementMeta(targetEl)
      }
    });
  }

  var suppressNextClick = false;
  var pointerDragSource = null;
  var pointerDragStart = null;
  var nativeDragSource = null;

  document.addEventListener('click', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const el = eventTargetEl(e);
    if (isRecorderUi(el)) return;
    const actionable = resolveActionableElement(el);
    if (actionable === null) return;
    emit('click', actionable, {});
  }, true);

  document.addEventListener('dblclick', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    const el = eventTargetEl(e);
    if (isRecorderUi(el)) return;
    const actionable = resolveActionableElement(el);
    if (actionable === null) return;
    emit('dblclick', actionable, {});
  }, true);

  document.addEventListener('dragstart', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    const el = eventTargetEl(e);
    if (isRecorderUi(el)) return;
    const actionable = resolveActionableElement(el);
    if (actionable !== null) nativeDragSource = actionable;
  }, true);

  document.addEventListener('drop', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    const el = eventTargetEl(e);
    if (isRecorderUi(el)) return;
    const target = resolveActionableElement(el);
    if (nativeDragSource !== null && target !== null && nativeDragSource !== target) {
      emitDrag(nativeDragSource, target);
      suppressNextClick = true;
    }
    nativeDragSource = null;
  }, true);

  document.addEventListener('mousedown', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    suppressNextClick = false;
    const el = eventTargetEl(e);
    if (isRecorderUi(el)) return;
    const actionable = resolveActionableElement(el);
    if (actionable === null) return;
    pointerDragSource = actionable;
    pointerDragStart = { x: e.clientX, y: e.clientY };
  }, true);

  document.addEventListener('mouseup', function(e) {
    if (window.__vindicateRecorderStopped || paused || pointerDragSource === null || pointerDragStart === null) return;
    const el = eventTargetEl(e);
    const target = el ? resolveActionableElement(el) : null;
    const dx = e.clientX - pointerDragStart.x;
    const dy = e.clientY - pointerDragStart.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    if (moved > 10 && target !== null && target !== pointerDragSource) {
      emitDrag(pointerDragSource, target);
      suppressNextClick = true;
    }
    pointerDragSource = null;
    pointerDragStart = null;
  }, true);

  function isStrongEnvVarField(el) {
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return true;
    var hay = [el.getAttribute('name'), el.getAttribute('placeholder'), getAccessibleName(el)].filter(Boolean).join(' ').toLowerCase();
    return /(password|passwd|pwd|secret|token|api[_-]?key|otp|pin|cvv|card|ssn|client[_-]?secret)/.test(hay);
  }

  document.addEventListener('change', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    const el = eventTargetEl(e);
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const inputType = (el.getAttribute('type') || '').toLowerCase();
      if (inputType === 'file') {
        const names = Array.from(el.files || []).map(function(f) { return f.name; });
        emit('upload_file', el, { files: names });
        return;
      }
      if (inputType === 'checkbox' || inputType === 'radio') return;
      emit('fill', el, { text: el.value, ...(isStrongEnvVarField(el) ? { env_var: true } : {}) });
    } else if (tag === 'textarea') {
      emit('fill', el, { text: el.value, ...(isStrongEnvVarField(el) ? { env_var: true } : {}) });
    } else if (tag === 'select') {
      emit('select', el, { text: el.value });
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (window.__vindicateRecorderStopped || paused) return;
    if (!['Enter', 'Escape'].includes(e.key)) return;
    const el = eventTargetEl(e);
    if (el && !isRecorderUi(el)) {
      emit('press_key', el, { key: e.key });
    }
  }, true);

  function mountIndicator() {
    if (window.top !== window) return;
    if (getHost()) return;

    var host = document.createElement('div');
    host.id = HOST_ID;
    // Host is a bare positioning container only — all visible styling lives inside the
    // shadow root so the page's CSS cannot alter the banner's appearance.
    host.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'left:auto',
      'width:max-content',
      'max-width:calc(100vw - 24px)',
      'z-index:2147483647',
      'pointer-events:none'
    ].join(';');

    shadowRoot = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent =
      '@keyframes __vindicate-pulse{0%,100%{opacity:1}50%{opacity:0.4}}' +
      '@keyframes __vindicate-spin{to{transform:rotate(360deg)}}' +
      '.__vindicate-wrap{position:relative;display:inline-flex;align-items:center;gap:8px;flex-wrap:nowrap;width:max-content;max-width:100%;box-sizing:border-box;background:#ef4444;color:#fff;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:default;user-select:none;pointer-events:auto}' +
      '.__vindicate-status{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}' +
      '#__vindicate-drag-handle{cursor:move;gap:6px}' +
      '.__vindicate-drag-icon{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:10px;height:14px;color:rgba(255,255,255,0.7)}' +
      '#__vindicate-drag-handle:hover .__vindicate-drag-icon{color:#fff}' +
      '.__vindicate-actions{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}' +
      '.__vindicate-recorder-spinner{width:12px;height:12px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:__vindicate-spin 0.7s linear infinite;display:inline-block}' +
      '.__vindicate-btn{background:rgba(255,255,255,0.25);border:none;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit}' +
      '.__vindicate-btn:disabled{opacity:0.6;cursor:wait}' +
      '.__vindicate-info-btn{background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;width:18px;height:18px;border-radius:50%;cursor:help;font-size:11px;font-weight:700;line-height:1;padding:0}' +
      '.__vindicate-info-wrap{position:relative;display:inline-flex;align-items:center}' +
      '.__vindicate-tooltip{display:none;position:absolute;top:calc(100% + 8px);right:0;width:272px;padding:10px 12px;border-radius:8px;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:500;line-height:1.45;box-shadow:0 4px 16px rgba(0,0,0,0.35);z-index:2147483647;text-align:left;white-space:normal}' +
      '.__vindicate-info-wrap:hover .__vindicate-tooltip,.__vindicate-info-wrap:focus-within .__vindicate-tooltip{display:block}' +
      '.__vindicate-flash{position:absolute;top:calc(100% + 6px);left:0;right:0;font-size:11px;font-weight:500;opacity:0;transition:opacity 0.3s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;text-align:left}' +
      '.__vindicate-steps{font-size:11px;font-weight:500;opacity:0.9}';

    var wrap = document.createElement('div');
    wrap.className = '__vindicate-wrap';
    wrap.innerHTML =
      '<div id="__vindicate-drag-handle" class="__vindicate-status" title="Drag to move recorder panel" aria-label="Drag to move recorder panel">' +
        '<span class="__vindicate-drag-icon" aria-hidden="true">' +
          '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" focusable="false">' +
            '<circle cx="2.5" cy="2.5" r="1.25"/>' +
            '<circle cx="7.5" cy="2.5" r="1.25"/>' +
            '<circle cx="2.5" cy="7" r="1.25"/>' +
            '<circle cx="7.5" cy="7" r="1.25"/>' +
            '<circle cx="2.5" cy="11.5" r="1.25"/>' +
            '<circle cx="7.5" cy="11.5" r="1.25"/>' +
          '</svg>' +
        '</span>' +
        '<span id="__vindicate-recorder-status-dot" style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block;animation:__vindicate-pulse 1s infinite"></span>' +
        '<span id="__vindicate-recorder-status-text">Recording…</span>' +
        '<span class="__vindicate-steps">● REC · <span id="__vindicate-step-counter">0</span> steps</span>' +
      '</div>' +
      '<div class="__vindicate-actions">' +
        '<span class="__vindicate-info-wrap">' +
          '<button type="button" id="__vindicate-recorder-info-btn" class="__vindicate-info-btn" aria-label="About Vindicate recording">?</button>' +
          '<div id="__vindicate-recorder-tooltip" class="__vindicate-tooltip" role="tooltip">' +
            '<strong style="display:block;margin-bottom:4px;font-size:12px">Vindicate recording</strong>' +
            'Your clicks and form changes are captured for test automation. ' +
            '<strong>Snapshot</strong> saves the current page state. ' +
            '<strong>Stop</strong> when finished, then review in VS Code. ' +
            'This banner does not change your app — it only listens.' +
          '</div>' +
        '</span>' +
        '<button type="button" id="__vindicate-pause-btn" class="__vindicate-btn" title="Pause capturing — scroll or navigate without recording">Pause</button>' +
        '<button type="button" id="__vindicate-snapshot-btn" class="__vindicate-btn" title="Capture the current page state — fields, errors, buttons">Snapshot</button>' +
        '<button type="button" id="__vindicate-stop-btn" class="__vindicate-btn" title="Stop recording — review &amp; edit steps in VS Code">Stop</button>' +
      '</div>' +
      '<span id="__vindicate-flash" class="__vindicate-flash"></span>';

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(wrap);
    boxEl = wrap;

    statusDot = shadowRoot.getElementById('__vindicate-recorder-status-dot');
    statusText = shadowRoot.getElementById('__vindicate-recorder-status-text');
    stepCounterEl = shadowRoot.getElementById('__vindicate-step-counter');
    flashEl = shadowRoot.getElementById('__vindicate-flash');
    pauseBtn = shadowRoot.getElementById('__vindicate-pause-btn');
    snapshotBtn = shadowRoot.getElementById('__vindicate-snapshot-btn');
    stopBtn = shadowRoot.getElementById('__vindicate-stop-btn');
    infoBtn = shadowRoot.getElementById('__vindicate-recorder-info-btn');
    infoTooltip = shadowRoot.getElementById('__vindicate-recorder-tooltip');
    dragHandleEl = shadowRoot.getElementById('__vindicate-drag-handle');

    if (dragHandleEl) {
      dragHandleEl.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        var hostNow = getHost();
        if (!hostNow) return;
        e.preventDefault();
        e.stopPropagation();
        var rect = hostNow.getBoundingClientRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartLeft = rect.left;
        dragStartTop = rect.top;
        isDragging = true;
        document.addEventListener('mousemove', onDragMove, true);
        document.addEventListener('mouseup', onDragEnd, true);
      }, true);
    }

    if (infoBtn && infoTooltip) {
      infoBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        infoTooltip.style.display = infoTooltip.style.display === 'block' ? 'none' : 'block';
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.__vindicateRecorderStopped) return;
        paused = !paused;
        setRecordingUi();
        safeRecordEvent({ event: '__paused', paused: paused });
      });
    }

    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.__vindicateRecorderStopped || paused) return;
        safeRecordEvent({
          action: 'snapshot',
          timestamp: new Date().toISOString(),
          url: window.location.href,
          candidates: [],
          chosen: null
        });
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.__vindicateRecorderStopped || window.__vindicateRecorderStopping) return;
        window.__vindicateRecorderStopping = true;
        window.__vindicateRecorderStopped = true;
        setStoppingUi();
        Promise.resolve(window.__vindicateStopRecording())
          .then(function() {
            setStoppedUi();
          })
          .catch(function() {
            window.__vindicateRecorderStopping = false;
            window.__vindicateRecorderStopped = false;
            setRecordingUi();
            if (statusText) statusText.textContent = 'Stop failed — try again';
          });
      });
    }

    document.body.appendChild(host);
    requestAnimationFrame(function() {
      restoreHostPosition(host);
    });

    if (!window.__vindicateRecorderResizeBound) {
      window.__vindicateRecorderResizeBound = true;
      window.addEventListener('resize', function() {
        var hostNow = getHost();
        if (!hostNow) return;
        var pos = window.__vindicateRecorderPosition;
        if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
        applyHostPosition(hostNow, pos.left, pos.top);
      });
    }

    // Single observer for the page lifetime — re-mounts the indicator if an SPA body-swap removes it.
    if (remountObserver === null && document.documentElement) {
      remountObserver = new MutationObserver(function() {
        if (!getHost() && document.body) {
          mountIndicator();
        }
      });
      remountObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.body) {
    mountIndicator();
  } else {
    document.addEventListener('DOMContentLoaded', mountIndicator, { once: true });
  }

  console.log('[Vindicate Recorder] Active');
})();
  `;
}
