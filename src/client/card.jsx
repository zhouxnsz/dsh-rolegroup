// dsh-rolegroup client — RolegroupCard (plans/v0.3-gui-panel.md §2.5, props contract §0.2 C7).
// Thin renderer over the controller projection (§2.4): zero business logic here; every
// user-visible string goes through props.t with keys from locales.js (no hardcoded copy).
// Styles: this repo has no dsh-css pipeline, so CSS ships as an inline string injected once
// via a <style data-plugin-css> tag (official convention, §0.2 C3). The injection is guarded
// so DOM-less environments (node probes executing the bundle) never touch it.
// NOTE: node cannot parse JSX — never import this file from node; index.js loads it lazily
// inside apply (which only ever runs in the browser shell).

const CSS = '.dsh-rg-card{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:12px;display:grid;gap:10px}'
  + '.dsh-rg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}'
  + '.dsh-rg-titles{display:grid;gap:4px;min-width:0}'
  + '.dsh-rg-title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-desc{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-dirty{font-size:11px;color:var(--dsw-alias-label-warning);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 6px;white-space:nowrap}'
  + '.dsh-rg-notice{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-alert{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}'
  + '.dsh-rg-catalogError{color:var(--dsw-alias-label-error);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px}'
  + '.dsh-rg-catalogError button{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:0;padding:0;font-size:12px}'
  + '.dsh-rg-rows{display:grid;gap:6px;max-height:320px;overflow:auto}'
  + '.dsh-rg-row{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:10px;display:grid;gap:8px}'
  + '.dsh-rg-rowHead{display:flex;align-items:center;gap:12px;min-width:0}'
  + '.dsh-rg-toolName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}'
  + 'input.dsh-rg-toolName{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px}'
  + '.dsh-rg-remove{color:var(--dsw-alias-label-error);cursor:pointer;background:none;border:0;padding:0;font-size:12px;white-space:nowrap}'
  + '.dsh-rg-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}'
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

const CSS_TAG_ID = 'dsh-rolegroup/card.jsx'
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-rolegroup'
  tag.dataset.pluginCss = CSS_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

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

  const head = (
    <div className="dsh-rg-head">
      <div className="dsh-rg-titles">
        <h3 className="dsh-rg-title">{t('title')}</h3>
        <p className="dsh-rg-desc">{t('description')}</p>
      </div>
      {state.dirty ? <span className="dsh-rg-dirty">{t('dirtyBadge')}</span> : null}
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

  const renderRow = (row) => (
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
        <label className="dsh-rg-field">
          <span>{t('fieldReasoningEffort')}</span>
          <input
            value={row.reasoningEffort}
            disabled={disabled}
            onChange={(event) => props.editRole(row.toolName, 'reasoningEffort', event.target.value)}
          />
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
      {state.takeover ? (
        // Taken over: state the LAYER semantics explicitly — the effective table is this override
        // table with the BUILT-IN table filling the gaps; rolegroup.jsonc yields entirely. Saying
        // only "the file table is overridden" makes users think unlisted roles still keep jsonc.
        <p className="dsh-rg-notice" role="status">{t('takeoverNote')}</p>
      ) : (
        // Not taken over yet: the table below is an EMPTY OVERRIDE table, not "no roles".
        // The effective table comes from rolegroup.jsonc / the built-in table, and any role
        // not listed here keeps using them.
        <p className="dsh-rg-notice" role="status">{t('notTakeover')}</p>
      )}
      {state.failed ? <p className="dsh-rg-alert" role="alert">{t('saveFailed')}</p> : null}
      {state.conflicted ? <p className="dsh-rg-alert" role="status">{t('conflicted')}</p> : null}
      <div className="dsh-rg-rows">{state.rows.map(renderRow)}</div>
      <button type="button" className="dsh-rg-add" disabled={disabled} onClick={props.addRole}>
        + {t('addRole')}
      </button>
      <div className="dsh-rg-actions">
        <button type="button" className="dsh-rg-save" disabled={disabled || !state.dirty} onClick={props.save}>
          {t('save')}
        </button>
        <button type="button" disabled={disabled || !state.dirty} onClick={props.discard}>
          {t('discard')}
        </button>
        <button type="button" disabled={disabled} onClick={props.resetToBase}>
          {t('resetToBase')}
        </button>
      </div>
      <p className="dsh-rg-liveHint">{t('liveHint')}</p>
    </div>
  )
}
