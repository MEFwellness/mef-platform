/**
 * MEF Wellness Lead Capture Agent — embeddable widget.
 *
 * Self-contained: one <script src="https://<this-app-domain>/lead-widget.js">
 * tag renders a floating chat bubble (bottom-right) plus its chat panel —
 * a bottom-right card on desktop, a bottom-sheet on narrow/mobile screens
 * (max-width: 480px). Everything (styles, DOM, API calls) lives inside a
 * Shadow DOM so it never collides with — or is broken by — whatever CSS
 * already exists on the Leadpages page it's dropped into.
 *
 * Talks to POST <this-app-domain>/api/lead-capture (app/api/lead-capture/
 * route.ts) — the app's own public Lead Capture API. The API origin is
 * inferred from this script's own <script src>, so a future update to the
 * agent (prompt, flow, styling of this file) never requires touching the
 * Leadpages page again.
 *
 * Proactive pop-up: on page load, a timer (8s) and a scroll listener
 * (25% of scrollable height) race — whichever fires first opens the panel
 * automatically, straight to the first question and its quick-reply
 * buttons, same as a manual bubble tap would. It fires at most once per
 * browser session (sessionStorage-backed) and never once the visitor has
 * opened the widget themselves. Dismissing it (the X) always collapses to
 * the small corner bubble, which stays reopenable — reopening before the
 * visitor has answered anything shows a different, practitioner-voice
 * line acknowledging the return, rather than repeating the same opener.
 */
(function () {
  'use strict';

  var CURRENT_SCRIPT = document.currentScript;
  var API_ORIGIN = CURRENT_SCRIPT ? new URL(CURRENT_SCRIPT.src).origin : '';
  var STORAGE_KEY = 'mef_lead_conversation_id';
  var AUTOPOP_KEY = 'mef_lead_autopopped';

  /** Mirrors fallback.ts's REOPEN_MESSAGE exactly — shown client-side only, since reopening an un-engaged conversation is not itself a new turn against the API. */
  var REOPEN_MESSAGE = "Still thinking about something? Tell me what's been going on.";

  var COLORS = {
    forest: '#1B3A2D',
    gold: '#C4A050',
    cream: '#F5F0E4',
  };

  var state = {
    conversationId: null,
    open: false,
    sending: false,
    engaged: false, // true once the visitor has sent any real answer (button tap or typed message)
    pendingReopenLine: false, // set on close if not yet engaged; consumed on the next open
  };

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      /* sessionStorage unavailable (private mode etc.) — proactive pop-up may re-fire on reload, which is an acceptable degradation */
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'style') node.style.cssText = attrs.style;
        else if (key === 'text') node.textContent = attrs.text;
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function buildStyle() {
    return (
      '@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap");\n' +
      '* { box-sizing: border-box; }\n' +
      '.mef-lead-widget { font-family: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif; }\n' +
      '.mef-bubble {\n' +
      '  position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%;\n' +
      '  background: ' + COLORS.forest + '; border: 2px solid ' + COLORS.gold + ';\n' +
      '  display: flex; align-items: center; justify-content: center; cursor: pointer;\n' +
      '  box-shadow: 0 6px 20px rgba(0,0,0,0.25); z-index: 2147483000; transition: transform 0.15s ease;\n' +
      '}\n' +
      '.mef-bubble:hover { transform: scale(1.06); }\n' +
      '.mef-bubble svg { width: 28px; height: 28px; }\n' +
      '.mef-panel {\n' +
      '  position: fixed; bottom: 92px; right: 20px; width: 340px; max-width: calc(100vw - 32px);\n' +
      '  height: 480px; max-height: calc(100vh - 140px); background: ' + COLORS.cream + ';\n' +
      '  border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column;\n' +
      '  overflow: hidden; z-index: 2147483000; border: 1px solid rgba(27,58,45,0.15);\n' +
      '  opacity: 0; pointer-events: none; transform: translateY(16px) scale(0.98);\n' +
      '  transition: opacity 0.22s ease, transform 0.22s ease;\n' +
      '}\n' +
      '.mef-panel.mef-open { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }\n' +
      '@media (max-width: 480px) {\n' +
      '  .mef-panel {\n' +
      '    left: 0; right: 0; bottom: 0; width: 100%; max-width: 100%;\n' +
      '    height: auto; max-height: 75vh; border-radius: 20px 20px 0 0;\n' +
      '    transform: translateY(100%);\n' +
      '  }\n' +
      '  .mef-panel.mef-open { transform: translateY(0); }\n' +
      '}\n' +
      '.mef-header {\n' +
      '  background: ' + COLORS.forest + '; color: ' + COLORS.cream + '; padding: 14px 16px;\n' +
      '  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;\n' +
      '}\n' +
      '.mef-header-title { font-weight: 700; font-size: 15px; }\n' +
      '.mef-header-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }\n' +
      '.mef-close { cursor: pointer; background: none; border: none; color: ' + COLORS.cream + '; font-size: 22px; line-height: 1; padding: 6px; }\n' +
      '.mef-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; }\n' +
      '.mef-msg { max-width: 82%; padding: 9px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.4; }\n' +
      '.mef-msg-agent { align-self: flex-start; background: #ffffff; color: ' + COLORS.forest + '; border-bottom-left-radius: 4px; }\n' +
      '.mef-msg-lead { align-self: flex-end; background: ' + COLORS.forest + '; color: #ffffff; border-bottom-right-radius: 4px; }\n' +
      '.mef-quick-replies { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 10px; flex-shrink: 0; }\n' +
      '.mef-quick-reply {\n' +
      '  border: 1.5px solid ' + COLORS.gold + '; color: ' + COLORS.forest + '; background: #ffffff;\n' +
      '  border-radius: 999px; padding: 11px 16px; min-height: 40px; display: flex; align-items: center;\n' +
      '  font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; line-height: 1.2;\n' +
      '}\n' +
      '.mef-quick-reply:hover { background: ' + COLORS.gold + '; color: #ffffff; }\n' +
      '.mef-inputbar { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(27,58,45,0.12); background: #ffffff; flex-shrink: 0; }\n' +
      '.mef-input {\n' +
      '  flex: 1; border: 1.5px solid rgba(27,58,45,0.2); border-radius: 999px; padding: 9px 14px;\n' +
      '  font-size: 13.5px; font-family: inherit; outline: none; color: ' + COLORS.forest + ';\n' +
      '}\n' +
      '.mef-input:focus { border-color: ' + COLORS.gold + '; }\n' +
      '.mef-send {\n' +
      '  background: ' + COLORS.forest + '; color: #fff; border: none; border-radius: 999px; width: 38px; height: 38px;\n' +
      '  cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;\n' +
      '}\n' +
      '.mef-send:disabled { opacity: 0.5; cursor: default; }\n' +
      '.mef-typing { align-self: flex-start; font-size: 12px; color: ' + COLORS.forest + '; opacity: 0.6; padding: 0 4px; }\n'
    );
  }

  function createWidget() {
    var host = el('div', { class: 'mef-lead-widget' });
    var shadow = host.attachShadow({ mode: 'open' });

    var styleTag = el('style');
    styleTag.textContent = buildStyle();
    shadow.appendChild(styleTag);

    var bubble = el('div', { class: 'mef-bubble', role: 'button', 'aria-label': 'Open chat' }, [
      (function () {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', COLORS.cream);
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          'M12 2C6.48 2 2 6.03 2 11c0 2.61 1.23 4.95 3.22 6.6-.15 1.15-.63 2.6-1.4 3.9 1.6-.2 3.2-.8 4.5-1.7C9.4 20 10.68 20 12 20c5.52 0 10-4.03 10-9s-4.48-9-10-9z'
        );
        svg.appendChild(path);
        return svg;
      })(),
    ]);

    var headerTitle = el('div', { class: 'mef-header-title', text: 'MEF Wellness' });
    var headerSub = el('div', { class: 'mef-header-sub', text: "Let's talk about how you're feeling" });
    var closeBtn = el('button', { class: 'mef-close', text: '×', 'aria-label': 'Close chat' });
    var header = el('div', { class: 'mef-header' }, [
      el('div', {}, [headerTitle, headerSub]),
      closeBtn,
    ]);

    var messages = el('div', { class: 'mef-messages' });
    var quickReplies = el('div', { class: 'mef-quick-replies' });

    var input = el('input', { class: 'mef-input', type: 'text', placeholder: 'Type a message…' });
    var sendBtn = el('button', { class: 'mef-send', 'aria-label': 'Send' }, [
      (function () {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', '#fff');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M2 21l21-9L2 3v7l15 2-15 2z');
        svg.appendChild(path);
        return svg;
      })(),
    ]);
    var inputBar = el('div', { class: 'mef-inputbar' }, [input, sendBtn]);

    var panel = el('div', { class: 'mef-panel' }, [header, messages, quickReplies, inputBar]);

    shadow.appendChild(bubble);
    shadow.appendChild(panel);
    document.body.appendChild(host);

    function addMessage(role, text) {
      var bubbleEl = el('div', {
        class: 'mef-msg ' + (role === 'agent' ? 'mef-msg-agent' : 'mef-msg-lead'),
        text: text,
      });
      messages.appendChild(bubbleEl);
      messages.scrollTop = messages.scrollHeight;
    }

    function setQuickReplies(options) {
      quickReplies.innerHTML = '';
      (options || []).forEach(function (label) {
        var btn = el('button', { class: 'mef-quick-reply', text: label });
        btn.addEventListener('click', function () {
          state.engaged = true;
          sendTurn({ quickReply: label });
        });
        quickReplies.appendChild(btn);
      });
    }

    function setTyping(isTyping) {
      var existing = shadow.querySelector('.mef-typing');
      if (existing) existing.remove();
      if (isTyping) {
        var typing = el('div', { class: 'mef-typing', text: 'Typing…' });
        messages.appendChild(typing);
        messages.scrollTop = messages.scrollHeight;
      }
    }

    function setSending(isSending) {
      state.sending = isSending;
      sendBtn.disabled = isSending;
      input.disabled = isSending;
    }

    function sendTurn(payload) {
      if (state.sending) return;
      setSending(true);
      quickReplies.innerHTML = '';

      var body = Object.assign({}, payload, {
        conversationId: state.conversationId,
        sourceUrl: window.location.href,
      });

      if (payload.quickReply) addMessage('lead', payload.quickReply);

      setTyping(true);

      fetch(API_ORIGIN + '/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          setTyping(false);
          setSending(false);
          if (data.error) {
            addMessage('agent', "Sorry, something went wrong on our end — please try again in a moment.");
            return;
          }
          state.conversationId = data.conversationId;
          safeSessionSet(STORAGE_KEY, data.conversationId);
          addMessage('agent', data.reply);
          setQuickReplies(data.quickReplies);
        })
        .catch(function () {
          setTyping(false);
          setSending(false);
          addMessage('agent', "Sorry, I'm having trouble connecting — please try again in a moment.");
        });
    }

    function startConversation() {
      var existingId = safeSessionGet(STORAGE_KEY);
      if (existingId) {
        state.conversationId = existingId;
        addMessage('agent', REOPEN_MESSAGE);
        return;
      }
      sendTurn({});
    }

    function openPanel() {
      state.open = true;
      panel.classList.add('mef-open');
      if (messages.children.length === 0) {
        startConversation();
      } else if (state.pendingReopenLine && !state.engaged) {
        addMessage('agent', REOPEN_MESSAGE);
      }
      state.pendingReopenLine = false;
      input.focus();
    }

    function closePanel() {
      state.open = false;
      panel.classList.remove('mef-open');
      if (!state.engaged) state.pendingReopenLine = true;
    }

    bubble.addEventListener('click', function () {
      if (state.open) closePanel();
      else openPanel();
    });
    closeBtn.addEventListener('click', closePanel);

    function submitInput() {
      var value = input.value.trim();
      if (!value) return;
      input.value = '';
      state.engaged = true;
      addMessage('lead', value);
      sendTurn({ message: value });
    }

    sendBtn.addEventListener('click', submitInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitInput();
    });

    scheduleProactivePopup(openPanel);
  }

  /**
   * Races an 8-second timer against a 25%-of-page-scroll threshold —
   * whichever fires first opens the panel automatically, straight to the
   * first question and its buttons. Fires at most once per browser
   * session (sessionStorage-backed, so a reload within the same session
   * doesn't re-trigger it), and never once the visitor has opened the
   * widget on their own first (checked at fire time, not just schedule
   * time, since either trigger could fire well after a manual open).
   */
  function scheduleProactivePopup(openPanelFn) {
    if (safeSessionGet(AUTOPOP_KEY)) return;

    var fired = false;
    var timer = null;

    function trigger() {
      if (fired || state.open || state.conversationId) return;
      fired = true;
      safeSessionSet(AUTOPOP_KEY, '1');
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      openPanelFn();
    }

    function onScroll() {
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable >= 0.25) trigger();
    }

    timer = setTimeout(trigger, 8000);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
