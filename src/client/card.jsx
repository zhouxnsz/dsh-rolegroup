// dsh-rolegroup client — RolegroupCard (plans/v0.3-gui-panel.md §2.5, props contract §0.2 C7).
// Thin renderer over the controller projection (§2.4): zero business logic here; every
// user-visible string goes through props.t with keys from locales.js (no hardcoded copy).
// Styles: this repo has no dsh-css pipeline, so CSS ships as an inline string injected once
// via a <style data-plugin-css> tag (official convention, §0.2 C3). The injection is guarded
// so DOM-less environments (node probes executing the bundle) never touch it.
// NOTE: node cannot parse JSX — never import this file from node; index.js loads it lazily
// inside apply (which only ever runs in the browser shell).

import { PLUGIN_REPO_URL, PLUGIN_VERSION } from './meta.js'

const CSS = '.dsh-rg-card{display:flex;flex-direction:column;height:100%;min-height:0;gap:10px}'
  // Header and status line stay put; the list scrolls on its own. Same shape as the official
  // settings pages (agent-preset etc.) — otherwise a long list scrolls the status line away
  // (user screenshot feedback, 2026-11-13).
  + '.dsh-rg-scroll{flex:1;min-height:0;overflow-y:auto;display:grid;gap:10px;align-content:start;padding-right:4px}'
  + '.dsh-rg-footer{display:grid;gap:6px;flex:none}'
  + '.dsh-rg-headBlock{min-width:0}'
  + '.dsh-rg-head{display:flex;justify-content:space-between;align-items:center;gap:8px 16px;flex-wrap:wrap}'
  + '.dsh-rg-titleRow{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}'
  + '.dsh-rg-title{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-version{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}'
  + '.dsh-rg-desc{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-statusBlock{display:grid;gap:4px;justify-items:start;min-width:0}'
  + '.dsh-rg-status{margin:0;display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-status::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-statusOn::before{background:var(--dsw-alias-state-success-primary)}'
  + '.dsh-rg-layer{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-layer summary{cursor:pointer}'
  + '.dsh-rg-layer p{margin:4px 0 0;max-width:62em}'
  + '.dsh-rg-empty{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-headActions{display:flex;align-items:center;gap:8px;flex-shrink:0}'
  + '.dsh-rg-action{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);text-decoration:none;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px;white-space:nowrap;cursor:pointer}'
  + '.dsh-rg-action:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}'
  + '.dsh-rg-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}'
  + '.dsh-rg-action svg{flex:none}'
  + '.dsh-rg-dirty{font-size:11px;color:var(--dsw-alias-state-warn-label);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 6px;white-space:nowrap}'
  + '.dsh-rg-notice{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-alert{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}'
  + '.dsh-rg-catalogError{color:var(--dsw-alias-label-error);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px}'
  + '.dsh-rg-catalogError button{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:0;padding:0;font-size:12px}'
  + '.dsh-rg-gapNotice{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-label)}'
  + '.dsh-rg-gapNotice button{flex:none;color:var(--dsw-alias-state-warn-label);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 8px;font-size:12px}'
  + '.dsh-rg-gapNotice button:disabled{opacity:.5;cursor:default}'
  + '.dsh-rg-rows{display:grid;gap:6px}'
  + '.dsh-rg-row{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:10px;display:grid;gap:8px}'
  + '.dsh-rg-rowHead{display:flex;align-items:center;gap:12px;min-width:0}'
  + '.dsh-rg-toolName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}'
  + 'input.dsh-rg-toolName{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px}'
  + '.dsh-rg-remove{color:var(--dsw-alias-label-error);cursor:pointer;background:none;border:0;padding:0;font-size:12px;white-space:nowrap}'
  + '.dsh-rg-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}'
  + '.dsh-rg-field{display:grid;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:0}'
  + '.dsh-rg-field input,.dsh-rg-field select,.dsh-rg-field textarea{font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-width:0}'
  + '.dsh-rg-field textarea{min-height:64px;resize:vertical}'
  + '.dsh-rg-invalid input,.dsh-rg-invalid select,input.dsh-rg-invalid{border-color:var(--dsw-alias-label-error)}'
  + '.dsh-rg-persona summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-persona textarea{margin-top:6px;width:100%;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-height:64px;resize:vertical}'
  + '.dsh-rg-add{justify-self:start;color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 10px;font-size:12px}'
  + '.dsh-rg-actions{display:flex;gap:8px}'
  + '.dsh-rg-actions button{cursor:pointer;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-actions button.dsh-rg-save{background:var(--dsw-alias-brand-primary);color:#fff}'
  + '.dsh-rg-actions button:disabled,.dsh-rg-add:disabled,.dsh-rg-remove:disabled,.dsh-rg-catalogError button:disabled{opacity:.5;cursor:default}'
  + '.dsh-rg-liveHint{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-configHint{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-retry{justify-self:start;font-family:inherit;font-size:12px;color:var(--dsw-alias-brand-primary);background:none;border:0;padding:0;cursor:pointer}'

const CSS_TAG_ID = 'dsh-rolegroup/card.jsx'
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-rolegroup'
  tag.dataset.pluginCss = CSS_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/**
 * GitHub mark (official 16×16 inline SVG; currentColor follows the link text colour).
 * No icon package: this plugin has no extra runtime dependency — one path is enough.
 */
function GitHubMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  )
}

/** Small file mark for the config-viewer button. */
/**
 * Render the rolegroup settings card: header (title / description / dirty badge),
 * one row per role (provider+model dropdowns fed by the projected catalog groups,
 * removable custom rows), an add-role button, the bottom action
 * row (save / discard / reset to file config) and the permanent live hint.
 * @param props locale copy (t), the bound snapshot hook, and controller actions.
 */
export function RolegroupCard(props) {
  const { t } = props
  // hooks must run before any early return (React rule)
  const state = props.useRolegroupCard((snapshot) => snapshot)

  // slots contract (dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts):
  //   `summary` renders the one-liner ALONE (the list row and the detail page's description
  //   area both take this contribution); `page` renders the form with its save control.
  // 0.2.0's plugin page renders one card id THREE times (list/summary, detail-desc/summary,
  // detail-section/page); without honouring `view` the detail page stacks several full cards.
  // Same shape as the official cards: `if (props.view === "summary") return t("...")`.
  if (props.view === 'summary') return t('description')

  const disabled = !state.writable || state.saving

  // Header, following the settings-page convention: plugin name + version + GitHub entry,
  // description on the next line. The version comes from package.json via a build-time
  // injection (see meta.js) — single source of truth, never hardcoded here.
  const head = (
    <div className="dsh-rg-headBlock">
      <div className="dsh-rg-head">
        <div className="dsh-rg-titleRow">
          <h2 className="dsh-rg-title">{t('title')}</h2>
          <span className="dsh-rg-version">{`v${PLUGIN_VERSION}`}</span>
        </div>
        <div className="dsh-rg-headActions">
          {state.dirty ? <span className="dsh-rg-dirty">{t('dirtyBadge')}</span> : null}
          <a
            className="dsh-rg-action"
            href={PLUGIN_REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={t('githubAria')}
            title={t('githubAria')}
          >
            <GitHubMark />
            <span>{t('github')}</span>
          </a>
        </div>
      </div>
      <p className="dsh-rg-desc">{t('description')}</p>
    </div>
  )

  if (!state.available) {
    return (
      <div className="dsh-rg-card">
        {head}
        <p className="dsh-rg-notice" role="status">{t('scopeUnavailable')}</p>
      </div>
    )
  }

  const catalogReady = state.catalog.status === 'ready'
  const groups = state.catalog.groups
  const modelsOf = (provider) => groups.find((group) => group.id === provider)?.models ?? []

  const renderRow = (row) => {
    const modelInfo = modelsOf(row.provider).find((model) => model.id === row.model)
    const efforts = Array.isArray(modelInfo?.reasoning?.efforts) ? modelInfo.reasoning.efforts : []
    const defaultEffort = modelInfo?.reasoning?.defaultEffort
    const defaultLabel = defaultEffort === undefined || defaultEffort === ''
      ? t('reasoningEffortDefault')
      : `${t('reasoningEffortDefault')} (${defaultEffort})`
    return (
    <div className="dsh-rg-row" key={row.toolName}>
      <div className="dsh-rg-rowHead">
        {row.isCustom ? (
          <input
            className={`dsh-rg-toolName${row.invalidFields.includes('toolName') ? ' dsh-rg-invalid' : ''}`}
            aria-label={t('fieldToolName')}
            value={row.toolName}
            disabled={disabled}
            onChange={(event) => props.editRole(row.toolName, 'toolName', event.target.value)}
          />
        ) : (
          <span className="dsh-rg-toolName">{row.toolName}</span>
        )}
        {row.isCustom ? (
          <button
            type="button"
            className="dsh-rg-remove"
            disabled={disabled}
            onClick={() => props.removeRole(row.toolName)}
          >
            {t('removeRole')}
          </button>
        ) : null}
      </div>
      <div className="dsh-rg-fields">
        <label className={`dsh-rg-field${row.invalidFields.includes('provider') ? ' dsh-rg-invalid' : ''}`}>
          <span>{t('fieldProvider')}</span>
          {catalogReady ? (
            <select
              value={row.provider}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'provider', event.target.value)}
            >
              {row.provider === '' ? <option value="">{t('selectProvider')}</option> : null}
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name ?? group.id}</option>)}
            </select>
          ) : (
            <input
              value={row.provider}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'provider', event.target.value)}
            />
          )}
        </label>
        <label className={`dsh-rg-field${row.invalidFields.includes('model') ? ' dsh-rg-invalid' : ''}`}>
          <span>{t('fieldModel')}</span>
          {catalogReady ? (
            <select
              value={row.model}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'model', event.target.value)}
            >
              {row.model === '' ? <option value="">{t('selectModel')}</option> : null}
              {modelsOf(row.provider).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.available === false ? `${model.name ?? model.id} (${t('routeUnavailable')})` : (model.name ?? model.id)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={row.model}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'model', event.target.value)}
            />
          )}
        </label>
        <label className={`dsh-rg-field${row.invalidFields.includes('reasoningEffort') ? ' dsh-rg-invalid' : ''}`}>
          <span>{t('fieldReasoningEffort')}</span>
          {catalogReady && modelInfo !== undefined && efforts.length > 0 ? (
            <select
              value={row.reasoningEffort}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'reasoningEffort', event.target.value)}
            >
              <option value="">{defaultLabel}</option>
              {efforts.map((effort) => (
                <option key={effort.id} value={effort.id}>{effort.name ?? effort.id}</option>
              ))}
              {row.reasoningEffort !== '' && !efforts.some((effort) => effort.id === row.reasoningEffort)
                ? <option value={row.reasoningEffort}>{row.reasoningEffort}</option>
                : null}
            </select>
          ) : catalogReady && modelInfo !== undefined ? (
            // available === false means the model is missing from the catalog (missing credentials or
            // an unregistered provider); its effort levels are unknown, so do not claim "unsupported".
            <input
              value={row.reasoningEffort}
              disabled
              placeholder={modelInfo.available === false ? t('modelUnavailable') : t('reasoningEffortUnsupported')}
            />
          ) : (
            <input
              value={row.reasoningEffort}
              disabled={disabled}
              placeholder={defaultLabel}
              onChange={(event) => props.editRole(row.toolName, 'reasoningEffort', event.target.value)}
            />
          )}
        </label>
        <label className="dsh-rg-field">
          <span>{t('fieldSummary')}</span>
          <input
            value={row.summary}
            disabled={disabled}
            onChange={(event) => props.editRole(row.toolName, 'summary', event.target.value)}
          />
        </label>
      </div>
      <details className="dsh-rg-persona">
        <summary>{t('fieldPersona')}</summary>
        <textarea
          value={row.persona}
          disabled={disabled}
          onChange={(event) => props.editRole(row.toolName, 'persona', event.target.value)}
        />
      </details>
    </div>
    )
  }

  return (
    <div className="dsh-rg-card">
      {head}
      {state.catalog.status === 'loading' ? (
        <p className="dsh-rg-notice" role="status">{t('catalogLoading')}</p>
      ) : null}
      {state.catalog.status === 'error' ? (
        <div className="dsh-rg-catalogError" role="alert">
          <span>{t('catalogError')}</span>
          <button type="button" disabled={state.saving} onClick={props.retryCatalog}>{t('retryCatalog')}</button>
        </div>
      ) : null}
      {state.catalog.partial ? <p className="dsh-rg-notice">{t('catalogPartial')}</p> : null}
      {/* One visible line says which layer is active; the long layer semantics (precedence,
          all-or-nothing takeover, doctor) sit in a collapsed <details> so they never dominate
          the page. Direct users skip paragraphs — 2026-10-21 user feedback. */}
      <div className="dsh-rg-statusBlock">
        <p className={`dsh-rg-status${state.mode === 'custom' ? ' dsh-rg-statusOn' : ''}`} role="status">
          {state.mode === 'custom'
            ? `${t('statusCustom')}（${state.overrides ?? 0} ${t('overridesCount')}）`
            : t('statusOfficial')}
        </p>
        <details className="dsh-rg-layer">
          <summary>{t('layerSummary')}</summary>
          <p>{t('layerNote')}</p>
          {/* The factory table is a read-only reference, not a restore target: link it so
              users do not have to dig through the repo. */}
          <p>
            {t('modelsDocHint')}{' '}
            <a href={`${PLUGIN_REPO_URL}/blob/main/MODELS.md`} target="_blank" rel="noreferrer">MODELS.md</a>
          </p>
        </details>
      </div>
      <div className="dsh-rg-scroll">
        {(state.routeGaps ?? []).length > 0 ? (
          <div className="dsh-rg-gapNotice" role="status">
            <span>{state.routeGaps.length} {t('routeGapNotice')}</span>
            <button type="button" disabled={disabled} onClick={props.fillUnavailableRoutes}>
              {t('fillRoutes')}
            </button>
          </div>
        ) : null}
        {state.failed ? <p className="dsh-rg-alert" role="alert">{t('saveFailed')}</p> : null}
        {state.conflicted ? <p className="dsh-rg-alert" role="status">{t('conflicted')}</p> : null}
        <div className="dsh-rg-rows">
          {state.rows.length === 0
            ? <p className="dsh-rg-empty">{state.takeover ? t('emptyTakeover') : t('emptyNotTakeover')}</p>
            : state.rows.map(renderRow)}
        </div>

        <button type="button" className="dsh-rg-add" disabled={disabled} onClick={props.addRole}>
          + {t('addRole')}
        </button>
      </div>
      <div className="dsh-rg-footer">
      <div className="dsh-rg-actions">
        <button type="button" className="dsh-rg-save" disabled={disabled || !state.dirty} onClick={props.save}>
          {t('save')}
        </button>
        <button type="button" disabled={disabled || !state.dirty} onClick={props.discard}>
          {t('discard')}
        </button>
        {/* Official defaults = zero-override takeover: no model names are written, so future
            built-in default changes are followed automatically. Hidden when already official —
            a greyed button with nothing to do reads as broken (same rule as the fill button). */}
        {state.mode === 'custom' ? (
          <button type="button" disabled={disabled} onClick={props.restoreOfficial}>
            {t('restoreOfficial')}
          </button>
        ) : null}
      </div>
      <p className="dsh-rg-liveHint">{t('liveHint')}</p>
      </div>
    </div>
  )
}
