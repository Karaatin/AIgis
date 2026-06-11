# Implementation Plan — PII & Config Subscriptions

> Status: **Draft / Approved for implementation**
> Target: AIgis v1.5.0
> Last updated: 2026-06-11

Enables users (especially enterprise teams and shared environments) to subscribe to remote JSON
feeds containing custom wordlists and configuration templates. The extension pulls, caches, and
applies these rules **locally** — the feed is the only network interaction, and it is strictly
one-way (GET, no user data ever attached).

---

## 1. Threat Model & Security Requirements

These requirements are binding for every phase below.

### 1.1 The primary threat is config weakening, not ReDoS

Custom words can only ever *add* masking. But `config.modules` can turn modules **off**
(e.g. `secret: false`) — a compromised or malicious feed silently disabling protection is the
worst-case scenario.

**Resolution:**
- Show a diff-style confirmation modal when config is **first applied** AND **whenever the
  remote config changes** between syncs (compare cached config hash):
  `"This feed wants to change: Secret Detection: ON → OFF"`.
- Until the user confirms a changed config, the *previous accepted* config stays in effect.
- Store the accepted config hash in the subscription metadata (`acceptedConfigHash`).

### 1.2 Regex safety (ReDoS) — `allowRegex` is trust delegation, not protection

The per-subscription "Allow Regular Expressions (Trusted Source)" checkbox stays, but with
runtime safeguards layered on top, because "trusted" sources can be compromised:

1. **Compile check:** every pattern is compiled with `new RegExp()` in try/catch at sync time.
   Invalid patterns are skipped, counted, and reported in the subscription status
   (`"3 patterns rejected"`), never thrown into `CustomMask`.
2. **Length cap:** patterns longer than 256 chars are rejected.
3. **Static backtracking check:** reject patterns with nested quantifiers
   (`(a+)+`, `(a*)*`, `(a|aa)+` shapes) — a `safe-regex`-style heuristic, implemented locally
   (~30 lines, no new dependency).
4. **Rejected patterns are surfaced in the UI** (not only debug logs) — a rejected pattern
   means reduced protection, the user must be able to see it.
5. If `allowRegex` is **disabled**: the entire string including delimiters is escaped and
   matched literally (existing plan — unchanged).

> Note: one bad pattern must never break the engine. `CustomMask.buildRegex()` currently
> compiles one giant alternation — validation MUST happen before words reach it.

### 1.3 Transport & permissions

- **HTTPS only.** Reject `http://` URLs at add time with a clear message.
- **No broad host permissions.** Use `optional_host_permissions` in the manifest and call
  `chrome.permissions.request({ origins: [origin] })` when the user adds a subscription.
  Never request `<all_urls>` — fatal for CWS review of a privacy extension.
- **Payload size cap:** reject responses > 1 MB before parsing.
- **GET only, no credentials, no query parameters derived from local data.** The fetch must
  never leak anything (Zero-Leak core guarantee).
- **`id` is generated locally** (`crypto.randomUUID()`), never taken from the feed.

### 1.4 Trust UI hardening

- The feed controls its own `name` — and the name appears in trust-critical UI
  (`🔒 Managed by [name]`). Always show the URL host alongside:
  `🔒 Managed by Corp Rules (rules.example.com)`.

---

## 2. Data Model

### 2.1 Subscription metadata (`chrome.storage.sync`, key `subscriptions`)

```typescript
interface Subscription {
    id: string;                 // crypto.randomUUID(), generated locally
    name: string;               // From feed (cached); display always pairs it with URL host
    description?: string;       // From feed (cached)
    url: string;                // HTTPS-only remote JSON URL
    enabled: boolean;           // Master toggle
    applyConfig: boolean;       // Enforce config overrides (only one sub may have this active)
    allowRegex: boolean;        // Execute /.../ patterns from this feed
    lastUpdated?: string;       // ISO timestamp of last successful sync
    lastStatus: 'ok' | 'error' | 'pending';   // Drives green/red status dot
    lastError?: string;         // Human-readable failure reason
    etag?: string;              // For If-None-Match conditional fetches
    acceptedConfigHash?: string;// SHA-256 of last user-confirmed config (see 1.1)
    rejectedPatterns?: number;  // Count of patterns dropped by validation (see 1.2)
}
```

### 2.2 Payload cache (`chrome.storage.local`, key `subscriptionData`)

```typescript
{ [subId: string]: { customWords: string[], config?: object, fetchedAt: number } }
```

Kept separate from the user's manual `customWords` to avoid pollution and allow clean removal.

### 2.3 Feed schema (`subscription-sample.json` at repo root)

```json
{
  "schemaVersion": 1,
  "name": "Corporate PII Masking Rules",
  "description": "Enforces masking of internal project codes and server IPs.",
  "customWords": [
    "ProjectSecretName",
    "/\\b(?:CORP-SER-\\d+)\\b/i"
  ],
  "config": {
    "settings": { "usageProfile": "strict" },
    "modules": { "secret": true, "custom": true }
  }
}
```

- Unknown **fields** are ignored (forward compatibility).
- Unknown **schemaVersion** (> 1) is rejected with `"Please update AIgis"` message.
- Sample locks `usageProfile: "strict"` (the realistic enterprise case), not `debugMode`.

---

## 3. Config Override Resolution — Overlay, never overwrite

**The single most important design decision.** Overrides are NOT written into the user's
stored settings. Instead:

- User settings in `chrome.storage.sync` stay untouched at all times.
- New `StorageManager.getEffectiveSettings()` returns
  `merge(baseSettings, activeProvider.config)` resolved at read time.
- **Precedence rule:** overrides apply only while
  `enabled && applyConfig && cache present`. Otherwise base settings apply instantly.
- `piiDetector.init()` and all engine consumers switch from `getSettings()` to
  `getEffectiveSettings()`.

Why overlay:
1. Unsubscribe / disable is a clean no-op — original values reappear.
2. Sync storage never propagates a feed's overwrite to the user's other devices.
3. The lockout UI becomes trivial: a key is locked ⇔ it exists in the active provider's config.

**Single config provider:** only one subscription may have `applyConfig: true`. Switching
prompts the existing confirmation modal (unchanged from original plan).

**Stale config rule:** wordlists from cache stay valid indefinitely while offline (fail-safe:
still masking). Config overrides stay in effect while cached, but if the last successful sync
is older than 7 days the Options UI shows a staleness warning on the lock badges.

---

## 4. Sync Lifecycle (background.js)

- `chrome.alarms` (`aigis-subscription-sync`): every 24 h **with ±30 min jitter** so large
  orgs don't hammer the rules server simultaneously. Requires `alarms` permission.
- Alarm is created in **both** `onInstalled` and `onStartup` (onStartup does not fire on
  install/update).
- `chrome.runtime.onStartup`: immediate sync of all enabled subscriptions.
- **New-device cold start:** listener on `chrome.storage.onChanged` (`sync` namespace,
  `subscriptions` key) fetches immediately for any subscription that has no local cache
  entry — metadata syncs across devices, payloads do not.
- **Conditional fetch:** send `If-None-Match` with the stored `etag`; on `304` only bump
  `lastUpdated`.
- **Failure handling:** keep old cache, set `lastStatus: 'error'` + `lastError`,
  exponential backoff (1 h → 2 h → 4 h → cap 24 h) for the failing feed only.
- **"Update Now"** button: debounced, minimum 30 s between manual syncs per subscription.

---

## 5. UI (options.html / options.js / style.css)

Adopted unchanged from the original proposal:

- "🔔 Subscriptions" sidebar tab with Subscription Manager Card (toggles for Enabled /
  Apply Settings / Allow Regular Expressions + tooltip, Update Now, Delete) and Add
  Subscription Card (URL input, schema validation on submit).
- Unified dictionary view: subscription entries merged into the Data & Dictionaries table,
  badged with source name, read-only.
- Double-dropdown filter: `All Sources` / `Local Sources Only` / `Subscriptions`, with the
  conditional sub-dropdown (`All Subscriptions` / individual feeds).
- Deletion modal: `[Delete Entries]` (default) vs `[Keep Local Copy]` (merge into local
  customWords).
- Settings lockout: overridden inputs grayed out, `🔒 Managed by [name] (host)` badge.

Additions from review:

- Status dot per subscription driven by `lastStatus`, with `lastError` as tooltip.
- Rejected-pattern count shown on the subscription card when > 0 (see 1.2.4).
- Config-diff confirmation modal (see 1.1) — reuse the existing `Modal` helper.
- Staleness warning on lock badges when cache > 7 days old (see 3).
- Friendly error when `chrome.storage.sync` quota would be exceeded (8 KB/item,
  120 writes/min) instead of a silent `chrome.runtime.lastError`.

---

## 6. Engine Integration

- **piiDetector.js:** `init()` builds `CustomMask` from
  `userWords + validated words of all enabled subscriptions` (validation pipeline from 1.2
  applied per feed according to its `allowRegex` flag). Switch to `getEffectiveSettings()`.
- **content.js:** verify the `chrome.storage.onChanged` listener covers **both** namespaces —
  `subscriptionData` lives in `local`, and current listeners only watch `sync`. Background
  syncs must trigger the existing `detector.initialized = false` live-reload in open tabs.
- **CustomMask:** unchanged — it receives only pre-validated, pre-escaped words.

---

## 7. Debug Mode Instrumentation (required, per Logger conventions)

- `Logger.group("Subscription Sync")` per sync run: per-feed fetch status (HTTP code /
  304 / error), payload size, schema validation result, word count, config hash comparison.
- Pattern validation outcomes: each rejected pattern logged via `Logger.warn` with reason
  (compile error / length / backtracking heuristic).
- Config overlay resolution: which keys are overridden by which provider
  (`Logger.info("Overlay: usageProfile 'developer' -> 'strict' (Corp Rules)")`).
- Cold-start fetches, backoff scheduling, and alarm creation logged via `Logger.info`.

---

## 8. Implementation Phases & Verification

Each phase lands separately, with its tests green, before the next begins.

### Phase 1 — Data layer & schema (no UI)
`storage.js`: subscriptions CRUD, payload cache, `getEffectiveSettings()` overlay,
schema parser + validator (size cap, version check, unknown-field tolerance).
`subscription-sample.json` at repo root.
**Verify:** unit tests `tests/subscriptions-schema.test.js`, `tests/subscriptions-overlay.test.js` —
parsing, version rejection, overlay precedence, user value preserved after provider removal,
sample file validates against the parser.

### Phase 2 — Pattern validation pipeline
Validation module (`src/modules/subscriptionValidator.js`): compile check, length cap,
backtracking heuristic, literal-escape path for `allowRegex: false`.
**Verify:** unit tests `tests/subscriptions-patterns.test.js` — invalid regex skipped & counted,
`(a+)+` rejected, literal mode escapes delimiters, valid patterns pass through unmodified.

### Phase 3 — Sync engine (background.js)
Fetch with ETag, alarms + jitter, onStartup, cold-start listener, backoff, status fields,
HTTPS/permission gating at add time.
**Verify:** unit tests with mocked `fetch` + `chrome.alarms` — 304 handling, failure→cache
fallback + status, backoff progression. Manual: locally hosted feed JSON, observe debug logs.

### Phase 4 — Engine integration & live reload
piiDetector merge logic, content.js dual-namespace listener.
**Verify:** extend `tests/pii-custom.test.js` — merged multi-feed words mask correctly;
manual: word added to hosted feed appears masked in an open chat tab without refresh.

### Phase 5 — Options UI
Subscriptions tab, dictionary merge view + double-dropdown, lockout badges, all modals
(delete, config switch, config diff), status dots, quota error handling.
**Verify:** manual walkthrough of the full original plan's manual checklist, plus:
config-diff modal on changed remote config, staleness badge, rejected-pattern display.

### Phase 6 — Hardening pass & release prep
`npm run test -- --run`, `npm run build`, manifest review (alarms, optional_host_permissions),
README + privacy-policy update (one-way fetch disclosure), bump to v1.5.0.
**Verify:** full suite green, build green, fresh-profile manual install test.

---

## 9. Out of Scope (documented for later)

- **`chrome.storage.managed`** integration — the canonical Chrome Enterprise mechanism to
  pin a subscription URL via policy. The schema above is designed so this can be added
  without breaking changes (a managed entry would simply pre-populate `subscriptions`).
- Feed signing (Ed25519 / SHA-256 pinning) — revisit if real-world tampering reports appear;
  the config-diff confirmation (1.1) covers the realistic attack today.
- Per-feed placeholder prefixes (all subscription words share `[CUSTOM_n]`).
