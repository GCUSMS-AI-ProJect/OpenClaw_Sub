// Local OpenClaw UI extension. Only the render projection changes; session state
// and all Gateway requests keep the full transcript.
(() => {
  "use strict";
  if (window.__openclawClearChatView) return;
  const deleteStyle = document.createElement("style");
  deleteStyle.textContent = `
    .local-message-delete, .local-script-delete {
      opacity: 0; pointer-events: none; transition: opacity 120ms ease, background 120ms ease;
    }
    .chat-group:hover .local-message-delete,
    .chat-group:focus-within .local-message-delete,
    .local-script-message:hover > .local-script-delete,
    .local-script-message:focus-within > .local-script-delete {
      opacity: 1; pointer-events: auto;
    }
    .local-message-delete:hover, .local-script-delete:hover { background: #c54b3518 !important; color: #c54b35 !important; }
    .local-message-delete:focus-visible, .local-script-delete:focus-visible { outline: 2px solid #c54b35; outline-offset: 2px; }
    @media (max-width: 600px) { .local-message-delete { right: 0 !important; top: calc(100% + 28px) !important; } }
    @media (prefers-reduced-motion: reduce) { .local-message-delete, .local-script-delete { transition: none; } }
    @media (hover: none) { .local-message-delete, .local-script-delete { opacity: 1; pointer-events: auto; } }
  `;
  document.head.append(deleteStyle);
  const storageKey = "openclaw.local.clear-chat-view.v1";
  const boundaries = new Map();
  const deletedStorageKey = "openclaw.local.deleted-chat-messages.v1";
  const deletedRecords = new Map();
  let toast;
  let toastTimer;
  try {
    for (const [key, value] of JSON.parse(localStorage.getItem(storageKey) || "[]")) {
      if (value && Array.isArray(value.ids) && value.sources) boundaries.set(key, value);
    }
  } catch { /* Storage is optional. */ }
  try {
    for (const [key, ids] of JSON.parse(localStorage.getItem(deletedStorageKey) || "[]")) {
      if (Array.isArray(ids)) deletedRecords.set(key, new Set(ids.filter(id => typeof id === "string")));
    }
  } catch { /* Storage is optional. */ }

  function scope(pane) {
    const state = pane.state;
    if (!state?.sessionKey || !state.currentSessionId) return null;
    const user = pane.context?.gateway?.snapshot?.selfUser;
    return JSON.stringify([
      state.settings?.gatewayUrl || location.origin,
      user?.identity?.id || user?.id || "local",
      state.sessionKey,
      state.currentSessionId,
    ]);
  }

  function save() {
    // Store only boundaries and record identifiers, never message contents.
    try { localStorage.setItem(storageKey, JSON.stringify([...boundaries])); } catch {}
    try { localStorage.setItem(deletedStorageKey, JSON.stringify([...deletedRecords].map(([key, ids]) => [key, [...ids]]))); } catch {}
  }

  function recordId(message) {
    return message?.__openclaw?.id || message?.id || message?.idempotencyKey;
  }

  function timestamp(message) {
    const value = message?.__openclaw?.recordTimestampMs ?? message?.timestamp;
    const numeric = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function hidden(message, boundary) {
    if (!message || typeof message !== "object") return false;
    if (boundary.ids.includes(recordId(message))) return true;
    if (boundary.runId && message.__openclaw?.runId === boundary.runId) return true;
    const position = message.__openclaw?.transcriptPosition;
    if (position && Object.hasOwn(boundary.sources, position.source)) {
      return position.rawSeq <= boundary.sources[position.source];
    }
    const time = timestamp(message);
    return time !== null && time <= boundary.timestamp;
  }

  function project(pane, props) {
    const key = scope(pane);
    const boundary = boundaries.get(key);
    const deleted = deletedRecords.get(key);
    if (!boundary && !deleted?.size) return props;
    const result = { ...props };
    for (const field of ["messages", "toolMessages", "guardianNotices", "streamSegments"]) {
      if (Array.isArray(props[field])) result[field] = props[field].filter(m =>
        !deleted?.has(recordId(m)) && !(boundary && hidden(m, boundary)));
    }
    // Older history remains on the server and can be revealed with Restore.
    if (boundary) result.historyPagination = undefined;
    if (boundary?.runId && props.runId === boundary.runId) {
      result.stream = null;
      result.streamSegments = [];
      result.progressCard = null;
    }
    return result;
  }

  function notify(message, undo) {
    clearTimeout(toastTimer);
    toast?.remove();
    toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed", bottom: "150px", left: "50%", transform: "translateX(-50%)",
      zIndex: "2147483647", padding: "12px 18px", borderRadius: "10px",
      background: "#253239", color: "#fff", font: "14px sans-serif",
      boxShadow: "0 4px 20px #0003", maxWidth: "85vw", pointerEvents: "none",
    });
    if (undo) {
      toast.style.pointerEvents = "auto";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "撤销";
      button.setAttribute("aria-label", "撤销删除消息");
      Object.assign(button.style, {
        marginLeft: "16px", padding: "3px 8px", border: "1px solid #ffffff70",
        borderRadius: "5px", background: "transparent", color: "white", cursor: "pointer",
      });
      button.addEventListener("click", () => { undo(); toast?.remove(); });
      toast.append(button);
    }
    document.body.append(toast);
    toastTimer = setTimeout(() => toast?.remove(), 2000);
  }

  function refreshScope(key) {
    document.querySelectorAll("openclaw-chat-pane").forEach(pane => {
      if (scope(pane) === key) pane.requestUpdate();
    });
  }

  function records(pane) {
    return [...pane.state.chatMessages, ...(window.__openclawScriptedChat?.messages(pane) || [])];
  }

  function deleteMessage(pane, id) {
    const key = scope(pane);
    if (!key || !records(pane).some(message => recordId(message) === id)) return;
    const deleted = deletedRecords.get(key) || new Set();
    deleted.add(id);
    deletedRecords.set(key, deleted);
    save();
    refreshScope(key);
    notify("已从界面删除这条消息，后台历史仍保留。", () => {
      deletedRecords.get(key)?.delete(id);
      save();
      refreshScope(key);
    });
  }

  function installMessageButtons() {
    for (const pane of document.querySelectorAll("openclaw-chat-pane")) {
      if (!scope(pane)) continue;
      const ids = new Set(records(pane).map(recordId).filter(Boolean));
      for (const bubble of pane.querySelectorAll(".chat-bubble[data-entry-id]")) {
        if (!ids.has(bubble.dataset.entryId) || bubble.querySelector(":scope > .local-message-delete")) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "local-message-delete";
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
        button.title = "仅从界面删除，后台历史和模型上下文保留";
        button.setAttribute("aria-label", "从界面删除这条消息");
        Object.assign(button.style, {
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "absolute", top: "100%", right: "-28px", zIndex: "3",
          width: "24px", height: "24px", boxSizing: "border-box", margin: "0", padding: "4px",
          border: "none", borderRadius: "4px", background: "transparent",
          color: "var(--muted, #777)", fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
        });
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          deleteMessage(pane, bubble.dataset.entryId);
        });
        bubble.append(button);
      }
    }
  }

  function refresh(pane) {
    pane.requestUpdate();
    pane.updateComplete?.then(() => pane.state?.scrollToBottom?.());
  }

  function clear(pane) {
    const key = scope(pane);
    if (!key) return;
    const state = pane.state;
    const previous = boundaries.get(key);
    const boundary = {
      ids: [...(previous?.ids || [])], sources: { ...previous?.sources },
      timestamp: previous?.timestamp || 0,
      runId: state.chatRunId || null,
    };
    for (const message of [...records(pane), ...(state.chatToolMessages || [])]) {
      const id = recordId(message);
      if (id && !boundary.ids.includes(id)) boundary.ids.push(id);
      const position = message.__openclaw?.transcriptPosition;
      if (position && Number.isFinite(position.rawSeq)) {
        boundary.sources[position.source] = Math.max(boundary.sources[position.source] ?? -1, position.rawSeq);
      }
      boundary.timestamp = Math.max(boundary.timestamp, timestamp(message) ?? 0);
    }
    boundaries.set(key, boundary);
    save();
    refresh(pane);
    notify("已清除显示，会话历史仍保留。Ctrl+Shift+L 恢复显示。");
  }

  function restore(pane) {
    boundaries.delete(scope(pane));
    deletedRecords.delete(scope(pane));
    save();
    refresh(pane);
    notify("已恢复全部会话历史，包括从界面删除的消息。");
  }

  customElements.whenDefined("openclaw-chat-pane").then(() => {
    const prototype = customElements.get("openclaw-chat-pane").prototype;
    const original = prototype.renderChatPaneLayout;
    if (typeof original !== "function") return;
    prototype.renderChatPaneLayout = function (args) {
      return original.call(this, { ...args, chatProps: project(this, args.chatProps) });
    };
    document.querySelectorAll("openclaw-chat-pane").forEach(pane => pane.requestUpdate());
    let scanQueued = false;
    const observer = new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(() => { scanQueued = false; installMessageButtons(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-entry-id"] });
    installMessageButtons();
    window.addEventListener("keydown", event => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat || event.key.toLowerCase() !== "l") return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      const panes = [...document.querySelectorAll("openclaw-chat-pane")];
      const pane = panes.find(p => p.active && p.presented && p.visuallyPresented && p.getClientRects().length);
      if (!pane || !scope(pane)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) restore(pane); else clear(pane);
    }, true);
  });
  window.__openclawClearChatView = { project, clear, restore, deleteMessage };
})();
