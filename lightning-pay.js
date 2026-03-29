/**
 * ⚡ Lightning Pay Plugin
 * Drop-in Bitcoin Lightning Network payment widget.
 *
 * Usage:
 *   <script src="lightning-pay.js?macaroon=BASE64&host=IP:PORT&amount=1000&expiry=10&showMessage=true&hideQr=false"></script>
 *
 * Required URL params:
 *   macaroon   - LND invoice macaroon as hex OR base64/base64url string
 *   host       - LND IP and port, e.g. "192.168.1.10:8080"
 *
 * Optional URL params:
 *   amount       - Pre-defined amount in satoshis (default: user fills in)
 *   showMessage  - Show payment message field ("true" / "false", default: "false")
 *   hideQr       - Hide QR code ("true" / "false", default: "false")
 *   expiry       - Invoice expiration in minutes (default: 10)
 */

(function () {
  "use strict";

  // ─── 1. Parse config from this script's own src URL ─────────────────────────
  function getScriptParams() {
    const scripts = document.querySelectorAll("script[src]");
    let src = "";
    for (const s of scripts) {
      if (s.src && s.src.includes("lightning-pay")) {
        src = s.src;
        break;
      }
    }
    // Also check document.currentScript (may be null in some contexts)
    if (!src && document.currentScript) {
      src = document.currentScript.src;
    }
    if (!src) return {};
    try {
      const url = new URL(src);
      const p = {};
      url.searchParams.forEach((v, k) => (p[k] = v));
      return p;
    } catch (_) {
      return {};
    }
  }

  const cfg = getScriptParams();

  // ─── Macaroon format detection & normalisation ───────────────────────────────
  // LND's Grpc-Metadata-macaroon header expects the macaroon as a hex string.
  // Accept either hex (64-char groups, no padding) or base64 / base64url and
  // convert to hex so the header value is always correct.
  function macaroonToHex(raw) {
    if (!raw) return "";
    const s = raw.trim();
    // Already hex: only 0-9 a-f A-F characters, even length
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return s.toLowerCase();
    // Otherwise treat as base64 / base64url → decode → re-encode as hex
    try {
      // Normalise base64url to standard base64
      const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
      const binary = atob(padded);
      let hex = "";
      for (let i = 0; i < binary.length; i++) {
        hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
      }
      return hex;
    } catch (_) {
      // Fallback: return as-is (let LND reject it with a clear error)
      return s;
    }
  }

  const MACAROON = macaroonToHex(cfg.macaroon || "");
  const HOST = (cfg.host || "").replace(/\/$/, "");
  const PRESET_AMOUNT = cfg.amount ? parseInt(cfg.amount, 10) : null;
  const SHOW_MESSAGE = cfg.showMessage === "true" || cfg.showMessage === "1";
  const HIDE_QR = cfg.hideQr === "true" || cfg.hideQr === "1";
  const EXPIRY_MINUTES = cfg.expiry ? parseFloat(cfg.expiry) : 10;

  if (!MACAROON || !HOST) {
    console.error("[lightning-pay] Missing required params: macaroon and host");
  }

  // ─── 2. Inject styles ────────────────────────────────────────────────────────
  const STYLE = `
  :root {
    --lp-bg: #0d0f14;
    --lp-surface: #161b27;
    --lp-border: #2a3146;
    --lp-accent: #f7931a;
    --lp-accent2: #ffb347;
    --lp-success: #22c55e;
    --lp-error: #ef4444;
    --lp-text: #e8eaf0;
    --lp-muted: #8892a4;
    --lp-radius: 14px;
    --lp-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  #lp-widget * { box-sizing: border-box; margin: 0; padding: 0; }

  #lp-widget {
    font-family: var(--lp-font);
    background: var(--lp-bg);
    border: 1px solid var(--lp-border);
    border-radius: var(--lp-radius);
    padding: 28px 24px;
    max-width: 420px;
    width: 100%;
    color: var(--lp-text);
    position: relative;
    box-shadow: 0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(247,147,26,0.08);
  }

  #lp-widget .lp-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 22px;
  }

  #lp-widget .lp-logo {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  #lp-widget .lp-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
    color: var(--lp-text);
  }

  #lp-widget .lp-subtitle {
    font-size: 12px;
    color: var(--lp-muted);
    margin-top: 2px;
  }

  #lp-widget .lp-field {
    margin-bottom: 14px;
  }

  #lp-widget .lp-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--lp-muted);
    margin-bottom: 6px;
    display: block;
  }

  #lp-widget .lp-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  #lp-widget .lp-input {
    width: 100%;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--lp-text);
    font-size: 15px;
    font-family: var(--lp-font);
    outline: none;
    transition: border-color 0.2s;
    appearance: none;
  }

  #lp-widget .lp-input:focus {
    border-color: var(--lp-accent);
  }

  #lp-widget .lp-input-suffix {
    position: absolute;
    right: 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--lp-muted);
    pointer-events: none;
  }

  #lp-widget .lp-btn {
    width: 100%;
    background: var(--lp-accent);
    color: #000;
    border: none;
    border-radius: 9px;
    padding: 13px 20px;
    font-size: 15px;
    font-weight: 700;
    font-family: var(--lp-font);
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    margin-top: 4px;
    letter-spacing: -0.1px;
  }

  #lp-widget .lp-btn:hover:not(:disabled) {
    background: var(--lp-accent2);
  }

  #lp-widget .lp-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  #lp-widget .lp-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Invoice view */
  #lp-invoice-view { display: none; }

  #lp-widget .lp-invoice-amount {
    text-align: center;
    margin-bottom: 18px;
  }

  #lp-widget .lp-invoice-amount .sats {
    font-size: 32px;
    font-weight: 800;
    color: var(--lp-accent);
    letter-spacing: -1px;
  }

  #lp-widget .lp-invoice-amount .sats-label {
    font-size: 13px;
    color: var(--lp-muted);
    margin-left: 6px;
    font-weight: 600;
  }

  #lp-widget .lp-qr-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  #lp-widget .lp-qr-container {
    background: #fff;
    border-radius: 10px;
    padding: 12px;
    display: inline-block;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.08);
  }

  #lp-widget .lp-bolt-overlay {
    position: relative;
    display: inline-block;
  }

  #lp-widget .lp-bolt-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%,-50%);
    background: #fff;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  #lp-widget .lp-copy-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  #lp-widget .lp-pr-text {
    flex: 1;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 11px;
    color: var(--lp-muted);
    font-family: "SFMono-Regular", Menlo, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: border-color 0.2s;
    user-select: all;
  }

  #lp-widget .lp-pr-text:hover {
    border-color: var(--lp-accent);
    color: var(--lp-text);
  }

  #lp-widget .lp-copy-btn {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    padding: 9px 14px;
    color: var(--lp-text);
    font-size: 12px;
    font-weight: 600;
    font-family: var(--lp-font);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  #lp-widget .lp-copy-btn:hover {
    border-color: var(--lp-accent);
    color: var(--lp-accent);
  }

  /* Progress bar */
  #lp-widget .lp-progress-wrap {
    margin-bottom: 14px;
  }

  #lp-widget .lp-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  #lp-widget .lp-progress-label {
    font-size: 11px;
    color: var(--lp-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  #lp-widget .lp-time-remaining {
    font-size: 12px;
    font-weight: 700;
    color: var(--lp-text);
    font-variant-numeric: tabular-nums;
  }

  #lp-widget .lp-progress-track {
    height: 6px;
    background: var(--lp-surface);
    border-radius: 99px;
    overflow: hidden;
    border: 1px solid var(--lp-border);
  }

  #lp-widget .lp-progress-bar {
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--lp-accent), var(--lp-accent2));
    transition: width 0.5s linear, background 0.5s;
    width: 100%;
  }

  #lp-widget .lp-progress-bar.lp-warn {
    background: linear-gradient(90deg, #ef4444, #f97316);
  }

  /* Status states */
  #lp-widget .lp-status {
    display: none;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 8px 0;
    gap: 10px;
  }

  #lp-widget .lp-status.active { display: flex; }

  #lp-widget .lp-status-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #lp-widget .lp-status-icon.success {
    background: rgba(34, 197, 94, 0.15);
    border: 2px solid var(--lp-success);
  }

  #lp-widget .lp-status-icon.error {
    background: rgba(239, 68, 68, 0.15);
    border: 2px solid var(--lp-error);
  }

  #lp-widget .lp-status-title {
    font-size: 18px;
    font-weight: 700;
  }

  #lp-widget .lp-status-title.success { color: var(--lp-success); }
  #lp-widget .lp-status-title.error   { color: var(--lp-error); }

  #lp-widget .lp-status-msg {
    font-size: 13px;
    color: var(--lp-muted);
    max-width: 280px;
    line-height: 1.5;
  }

  #lp-widget .lp-new-btn {
    background: transparent;
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    padding: 8px 20px;
    color: var(--lp-text);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--lp-font);
    cursor: pointer;
    transition: border-color 0.2s;
    margin-top: 4px;
  }

  #lp-widget .lp-new-btn:hover {
    border-color: var(--lp-accent);
    color: var(--lp-accent);
  }

  #lp-widget .lp-waiting-dots {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  #lp-widget .lp-waiting-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lp-accent);
    animation: lp-bounce 1.4s ease-in-out infinite;
  }

  #lp-widget .lp-waiting-dots span:nth-child(2) { animation-delay: 0.2s; }
  #lp-widget .lp-waiting-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes lp-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  #lp-widget .lp-error-banner {
    display: none;
    background: rgba(239,68,68,0.12);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #fca5a5;
    margin-bottom: 14px;
    line-height: 1.4;
  }

  #lp-widget .lp-error-banner.active { display: block; }

  @keyframes lp-fadein {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  #lp-widget { animation: lp-fadein 0.3s ease; }
  `;

  // ─── 3. SVG assets ───────────────────────────────────────────────────────────
  const SVG_BOLT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#f7931a"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
  const SVG_BOLT_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="#f7931a"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
  const SVG_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const SVG_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const SVG_COPY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  // ─── 4. QR Code generator (pure JS, no external deps) ───────────────────────
  // Minimal QR encoder using qrcode-generator logic embedded inline
  // We'll use a CDN-loaded library via dynamic import to keep the plugin self-contained

  function loadQRLib() {
    return new Promise((resolve) => {
      if (window.qrcode) return resolve(window.qrcode);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = () => resolve(window.QRCode);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  // Tiny fallback QR generator using the qrcode npm-free approach via data URI
  // Primary: qrcodejs canvas renderer
  // Fallback: link to external QR service if canvas unavailable

  // ─── 5. Build the widget HTML ────────────────────────────────────────────────
  function buildWidget() {
    const wrap = document.createElement("div");
    wrap.id = "lp-widget";
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Bitcoin Lightning Payment");

    const amountFixed = PRESET_AMOUNT !== null;

    wrap.innerHTML = `
      <div class="lp-header">
        <svg class="lp-logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#f7931a"/>
          <path d="M18.5 4L7 18h9.5l-2 10 14-14h-9.5l2-10z" fill="#fff"/>
        </svg>
        <div>
          <div class="lp-title">Lightning Payment</div>
          <div class="lp-subtitle">Pay instantly via Bitcoin Lightning Network</div>
        </div>
      </div>

      <div id="lp-error-banner" class="lp-error-banner"></div>

      <!-- Form view -->
      <div id="lp-form-view">
        ${!amountFixed ? `
        <div class="lp-field">
          <label class="lp-label" for="lp-amount-input">Amount</label>
          <div class="lp-input-wrap">
            <input
              id="lp-amount-input"
              class="lp-input"
              type="number"
              min="1"
              placeholder="e.g. 1000"
              inputmode="numeric"
              style="padding-right: 50px;"
            />
            <span class="lp-input-suffix">sats</span>
          </div>
        </div>
        ` : `
        <div class="lp-field">
          <label class="lp-label">Amount</label>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:8px;">
            <span style="font-size:20px;font-weight:800;color:var(--lp-accent);">${PRESET_AMOUNT.toLocaleString()}</span>
            <span style="font-size:12px;color:var(--lp-muted);font-weight:600;">SATS</span>
          </div>
        </div>
        `}

        ${SHOW_MESSAGE ? `
        <div class="lp-field">
          <label class="lp-label" for="lp-message-input">Payment Message <span style="color:var(--lp-muted);font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></label>
          <input
            id="lp-message-input"
            class="lp-input"
            type="text"
            placeholder="What's this for?"
            maxlength="180"
          />
        </div>
        ` : ""}

        <button id="lp-generate-btn" class="lp-btn" type="button">
          ${SVG_BOLT_SMALL}&nbsp; Generate Invoice
        </button>
      </div>

      <!-- Invoice view -->
      <div id="lp-invoice-view">
        <div class="lp-invoice-amount">
          <span class="sats" id="lp-display-amount">—</span>
          <span class="sats-label">SATS</span>
        </div>

        ${!HIDE_QR ? `
        <div class="lp-qr-wrap">
          <div class="lp-qr-container">
            <div class="lp-bolt-overlay">
              <div id="lp-qr-canvas"></div>
              <div class="lp-bolt-center">${SVG_BOLT}</div>
            </div>
          </div>
        </div>
        ` : ""}

        <div class="lp-copy-row">
          <div class="lp-pr-text" id="lp-pr-text" title="Click to copy" role="button" tabindex="0" aria-label="Payment request string"></div>
          <button class="lp-copy-btn" id="lp-copy-btn" type="button">${SVG_COPY}&nbsp;Copy</button>
        </div>

        <div class="lp-progress-wrap">
          <div class="lp-progress-header">
            <span class="lp-progress-label">Expires in</span>
            <span class="lp-time-remaining" id="lp-time-remaining">—</span>
          </div>
          <div class="lp-progress-track">
            <div class="lp-progress-bar" id="lp-progress-bar"></div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--lp-muted);margin-top:4px;">
          <div class="lp-waiting-dots"><span></span><span></span><span></span></div>
          Waiting for payment…
        </div>
      </div>

      <!-- Success state -->
      <div id="lp-success-view" class="lp-status">
        <div class="lp-status-icon success">${SVG_CHECK}</div>
        <div class="lp-status-title success">Payment Received!</div>
        <div class="lp-status-msg" id="lp-success-msg">Your Lightning payment was confirmed successfully.</div>
        <button class="lp-new-btn" id="lp-reset-success-btn" type="button">New Payment</button>
      </div>

      <!-- Expired state -->
      <div id="lp-expired-view" class="lp-status">
        <div class="lp-status-icon error">${SVG_CLOCK}</div>
        <div class="lp-status-title error">Invoice Expired</div>
        <div class="lp-status-msg">The invoice expired before payment was received. Please generate a new one.</div>
        <button class="lp-new-btn" id="lp-reset-expired-btn" type="button">Try Again</button>
      </div>
    `;

    return wrap;
  }

  // ─── 6. LND REST helpers ─────────────────────────────────────────────────────
  function lndFetch(method, path, body) {
    const url = `https://${HOST}${path}`;
    const opts = {
      method,
      headers: {
        "Grpc-Metadata-macaroon": MACAROON,
        "Content-Type": "application/json",
      },
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(e));
      return r.json();
    });
  }

  function createInvoice(amountSats, memo) {
    const expirySecs = Math.round(EXPIRY_MINUTES * 60);
    const payload = {
      value: String(amountSats),
      expiry: String(expirySecs),
    };
    if (memo) payload.memo = memo;
    return lndFetch("POST", "/v1/invoices", payload);
  }

  function lookupInvoice(rHashStr) {
    return lndFetch("GET", `/v1/invoice/${encodeURIComponent(rHashStr)}`, null);
  }

  // ─── 7. State machine ────────────────────────────────────────────────────────
  // States: form | loading | invoice | success | expired

  let pollInterval = null;
  let expiryTimeout = null;
  let countdownInterval = null;
  let invoiceExpireAt = null;
  let invoiceTotalSecs = null;
  let currentRHash = null;
  let currentPayReq = null;
  let currentSats = null;

  function clearTimers() {
    if (pollInterval) clearInterval(pollInterval);
    if (expiryTimeout) clearTimeout(expiryTimeout);
    if (countdownInterval) clearInterval(countdownInterval);
    pollInterval = expiryTimeout = countdownInterval = null;
  }

  function showError(msg) {
    const el = document.getElementById("lp-error-banner");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("active");
  }

  function hideError() {
    const el = document.getElementById("lp-error-banner");
    if (el) el.classList.remove("active");
  }

  function showView(id) {
    ["lp-form-view", "lp-invoice-view", "lp-success-view", "lp-expired-view"].forEach(
      (v) => {
        const el = document.getElementById(v);
        if (!el) return;
        if (v.includes("status") || v === "lp-success-view" || v === "lp-expired-view") {
          el.classList.toggle("active", v === id);
        } else {
          el.style.display = v === id ? "block" : "none";
        }
      }
    );
    // For success/expired these use .active class via lp-status
    const suc = document.getElementById("lp-success-view");
    const exp = document.getElementById("lp-expired-view");
    if (suc) suc.classList.toggle("active", id === "lp-success-view");
    if (exp) exp.classList.toggle("active", id === "lp-expired-view");
  }

  function resetToForm() {
    clearTimers();
    hideError();
    // Reset form inputs
    const amtIn = document.getElementById("lp-amount-input");
    if (amtIn && PRESET_AMOUNT === null) amtIn.value = "";
    const msgIn = document.getElementById("lp-message-input");
    if (msgIn) msgIn.value = "";
    // Clear QR
    const qrEl = document.getElementById("lp-qr-canvas");
    if (qrEl) qrEl.innerHTML = "";
    showView("lp-form-view");
  }

  function startCountdown() {
    const bar = document.getElementById("lp-progress-bar");
    const timeEl = document.getElementById("lp-time-remaining");

    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, invoiceExpireAt - now);
      const fraction = remaining / (invoiceTotalSecs * 1000);
      const pct = Math.round(fraction * 100);

      if (bar) {
        bar.style.width = pct + "%";
        bar.classList.toggle("lp-warn", pct <= 20);
      }

      if (timeEl) {
        const secs = Math.ceil(remaining / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        timeEl.textContent = m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
      }

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }

    tick();
    countdownInterval = setInterval(tick, 500);
  }

  async function renderQR(paymentRequest) {
    const qrEl = document.getElementById("lp-qr-canvas");
    if (!qrEl || HIDE_QR) return;

    const QRCode = await loadQRLib();

    if (QRCode) {
      qrEl.innerHTML = "";
      try {
        new QRCode(qrEl, {
          text: paymentRequest.toUpperCase(),
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : 1,
        });
        return;
      } catch (e) {
        // fallback below
      }
    }

    // Fallback: image from free QR API
    qrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentRequest)}&bgcolor=ffffff&color=000000&margin=0" width="200" height="200" alt="QR Code" style="border-radius:4px;" />`;
  }

  async function generateInvoice() {
    hideError();

    let amountSats = PRESET_AMOUNT;
    if (amountSats === null) {
      const amtIn = document.getElementById("lp-amount-input");
      amountSats = amtIn ? parseInt(amtIn.value, 10) : NaN;
      if (!amountSats || amountSats < 1) {
        showError("Please enter a valid amount in satoshis.");
        return;
      }
    }

    const memo = SHOW_MESSAGE
      ? (document.getElementById("lp-message-input") || {}).value || ""
      : "";

    // Disable button & show loading state
    const btn = document.getElementById("lp-generate-btn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="lp-waiting-dots" style="display:inline-flex;gap:4px;"><span></span><span></span><span></span></div>&nbsp; Creating Invoice…`;
    }

    try {
      const res = await createInvoice(amountSats, memo);

      currentSats = amountSats;
      currentPayReq = res.payment_request;

      // r_hash from LND REST is base64 — convert to hex for URL path
      // r_hash_str is the hex version returned by older LND, newer returns r_hash as base64
      // We store the base64 r_hash for lookup
      currentRHash = res.r_hash;

      invoiceTotalSecs = EXPIRY_MINUTES * 60;
      invoiceExpireAt = Date.now() + invoiceTotalSecs * 1000;

      // Populate invoice view
      const displayAmt = document.getElementById("lp-display-amount");
      if (displayAmt) displayAmt.textContent = amountSats.toLocaleString();

      const prText = document.getElementById("lp-pr-text");
      if (prText) prText.textContent = currentPayReq;

      // Render QR
      await renderQR(currentPayReq);

      showView("lp-invoice-view");
      startCountdown();
      startPolling();

      // Auto-expire
      expiryTimeout = setTimeout(() => {
        clearTimers();
        showView("lp-expired-view");
      }, invoiceTotalSecs * 1000);
    } catch (err) {
      const msg =
        err && err.message
          ? err.message
          : err && typeof err === "object"
          ? JSON.stringify(err)
          : "Failed to create invoice. Check your LND connection.";
      showError("⚠ " + msg);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${SVG_BOLT_SMALL}&nbsp; Generate Invoice`;
      }
    }
  }

  function startPolling() {
    // Poll every 2 seconds
    pollInterval = setInterval(async () => {
      if (!currentRHash) return;
      try {
        // LND REST /v2/invoices/lookup?payment_hash= expects standard base64 (not base64url).
        // res.r_hash from AddInvoice is already standard base64; we just need to ensure
        // the padding is intact and URL-encode it so + and = survive in the query string.
        const pad = currentRHash.length % 4 === 0 ? 0 : 4 - (currentRHash.length % 4);
        const b64 = currentRHash + "=".repeat(pad);
        const inv = await lndFetch("GET", `/v2/invoices/lookup?payment_hash=${encodeURIComponent(b64)}`, null);

        if (inv && inv.state === "SETTLED") {
          clearTimers();
          const suc = document.getElementById("lp-success-msg");
          if (suc) {
            const paid = inv.amt_paid_sat ? parseInt(inv.amt_paid_sat) : currentSats;
            suc.textContent = `Received ${paid.toLocaleString()} sats. Thank you! ⚡`;
          }
          showView("lp-success-view");
        } else if (inv && (inv.state === "CANCELED" || inv.state === "EXPIRED")) {
          clearTimers();
          showView("lp-expired-view");
        }
      } catch (_) {
        // Silently ignore poll errors (node might be temporarily unreachable)
      }
    }, 2000);
  }

  // ─── 8. Copy to clipboard helper ────────────────────────────────────────────
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  // ─── 9. Mount ────────────────────────────────────────────────────────────────
  function mount() {
    // Inject styles
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    // Create widget
    const widget = buildWidget();

    // Find insertion point: right after this script tag or at end of body
    let insertTarget = document.currentScript;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(widget, insertTarget.nextSibling);
    } else {
      // Fallback: find script by src
      const scripts = document.querySelectorAll("script[src]");
      let targetScript = null;
      for (const s of scripts) {
        if (s.src && s.src.includes("lightning-pay")) {
          targetScript = s;
          break;
        }
      }
      if (targetScript && targetScript.parentNode) {
        targetScript.parentNode.insertBefore(widget, targetScript.nextSibling);
      } else {
        document.body.appendChild(widget);
      }
    }

    // Init view
    showView("lp-form-view");

    // If no form needed (fixed amount, no message), auto-generate on load
    // (opt-in: add autoGenerate=true param)
    if (cfg.autoGenerate === "true" && PRESET_AMOUNT !== null && !SHOW_MESSAGE) {
      setTimeout(generateInvoice, 300);
    }

    // Wire events (wait for next tick so the widget is in the DOM)
    setTimeout(() => {
      const genBtn = document.getElementById("lp-generate-btn");
      if (genBtn) genBtn.addEventListener("click", generateInvoice);

      const copyBtn = document.getElementById("lp-copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          if (!currentPayReq) return;
          copyToClipboard(currentPayReq).then(() => {
            copyBtn.textContent = "Copied!";
            copyBtn.style.color = "var(--lp-success)";
            copyBtn.style.borderColor = "var(--lp-success)";
            setTimeout(() => {
              copyBtn.innerHTML = `${SVG_COPY}&nbsp;Copy`;
              copyBtn.style.color = "";
              copyBtn.style.borderColor = "";
            }, 1800);
          });
        });
      }

      const prText = document.getElementById("lp-pr-text");
      if (prText) {
        prText.addEventListener("click", () => {
          if (currentPayReq) copyToClipboard(currentPayReq);
        });
        prText.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (currentPayReq) copyToClipboard(currentPayReq);
          }
        });
      }

      const resetSuccess = document.getElementById("lp-reset-success-btn");
      if (resetSuccess) resetSuccess.addEventListener("click", resetToForm);

      const resetExpired = document.getElementById("lp-reset-expired-btn");
      if (resetExpired) resetExpired.addEventListener("click", resetToForm);

      // Allow Enter key in amount input
      const amtIn = document.getElementById("lp-amount-input");
      if (amtIn) {
        amtIn.addEventListener("keydown", (e) => {
          if (e.key === "Enter") generateInvoice();
        });
      }
    }, 0);
  }

  // ─── 10. Boot ────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
