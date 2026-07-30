/**
 * MEF Wellness Lead Capture Agent — embeddable widget.
 *
 * Self-contained: one <script src="https://<this-app-domain>/lead-widget.js">
 * tag renders a floating chat bubble (bottom-right) and its chat panel.
 * Everything (styles, DOM, API calls) lives inside a Shadow DOM so it
 * never collides with — or is broken by — whatever CSS already exists on
 * the Leadpages page it's dropped into.
 *
 * Talks to POST <this-app-domain>/api/lead-capture (app/api/lead-capture/
 * route.ts) — the app's own public Lead Capture API. The API origin is
 * inferred from this script's own <script src>, so a future update to the
 * agent (prompt, flow, styling of this file) never requires touching the
 * Leadpages page again.
 */
(function () {
  'use strict';

  var CURRENT_SCRIPT = document.currentScript;
  var API_ORIGIN = CURRENT_SCRIPT ? new URL(CURRENT_SCRIPT.src).origin : '';
  var STORAGE_KEY = 'mef_lead_conversation_id';

  var COLORS = {
    forest: '#1B3A2D',
    gold: '#C4A050',
    cream: '#F5F0E4',
  };

  var state = {
    conversationId: null,
    open: false,
    sending: false,
  };

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
      '  border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); display: none; flex-direction: column;\n' +
      '  overflow: hidden; z-index: 2147483000; border: 1px solid rgba(27,58,45,0.15);\n' +
      '}\n' +
      '.mef-panel.mef-open { display: flex; }\n' +
      '.mef-header {\n' +
      '  background: ' + COLORS.forest + '; color: ' + COLORS.cream + '; padding: 14px 16px;\n' +
      '  display: flex; align-items: center; justify-content: space-between;\n' +
      '}\n' +
      '.mef-header-title { font-weight: 700; font-size: 15px; }\n' +
      '.mef-header-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }\n' +
      '.mef-close { cursor: pointer; background: none; border: none; color: ' + COLORS.cream + '; font-size: 20px; line-height: 1; padding: 4px; }\n' +
      '.mef-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }\n' +
      '.mef-msg { max-width: 82%; padding: 9px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.4; }\n' +
      '.mef-msg-agent { align-self: flex-start; background: #ffffff; color: ' + COLORS.forest + '; border-bottom-left-radius: 4px; }\n' +
      '.mef-msg-lead { align-self: flex-end; background: ' + COLORS.forest + '; color: #ffffff; border-bottom-right-radius: 4px; }\n' +
      '.mef-quick-replies { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 10px; }\n' +
      '.mef-quick-reply {\n' +
      '  border: 1.5px solid ' + COLORS.gold + '; color: ' + COLORS.forest + '; background: #ffffff;\n' +
      '  border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;\n' +
      '}\n' +
      '.mef-quick-reply:hover { background: ' + COLORS.gold + '; color: #ffffff; }\n' +
      '.mef-inputbar { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(27,58,45,0.12); background: #ffffff; }\n' +
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
          quickReplies.innerHTML = '';
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
          try {
            sessionStorage.setItem(STORAGE_KEY, data.conversationId);
          } catch (e) {
            /* sessionStorage unavailable (private mode etc.) — conversation just won't resume on reload */
          }
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
      var existingId = null;
      try {
        existingId = sessionStorage.getItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      if (existingId) {
        state.conversationId = existingId;
        addMessage('agent', "Welcome back! Pick up where we left off, or type a new message.");
        return;
      }
      sendTurn({});
    }

    function openPanel() {
      state.open = true;
      panel.classList.add('mef-open');
      if (messages.children.length === 0) startConversation();
      input.focus();
    }

    function closePanel() {
      state.open = false;
      panel.classList.remove('mef-open');
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
      addMessage('lead', value);
      sendTurn({ message: value });
    }

    sendBtn.addEventListener('click', submitInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitInput();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
