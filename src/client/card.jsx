// dsh-rolegroup client — RolegroupCard (plans/v0.3-gui-panel.md §2.5, props contract §0.2 C7).
// Thin renderer over the controller projection: selection and drafts belong to the controller.
// Every user-visible string goes through props.t with keys from locales.js.
// Styles use the existing inline style-tag convention; node render probes never touch the DOM.

import { PLUGIN_REPO_URL, PLUGIN_VERSION } from './meta.js'

const CSS = '.dsh-rg-card{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;gap:10px;container-type:inline-size}'
  + '.dsh-rg-headBlock,.dsh-rg-statusBlock,.dsh-rg-globalNotices{min-width:0;flex:none}'
  + '.dsh-rg-head{display:flex;justify-content:space-between;align-items:center;gap:8px 16px;flex-wrap:wrap}'
  + '.dsh-rg-titleRow{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}'
  + '.dsh-rg-title{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-version{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}'
  + '.dsh-rg-desc{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-headActions{display:flex;align-items:center;gap:8px;flex-shrink:0}'
  + '.dsh-rg-action{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);text-decoration:none;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px;white-space:nowrap;cursor:pointer}'
  + '.dsh-rg-action:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}'
  + '.dsh-rg-action svg{flex:none}'
  + '.dsh-rg-statusBlock{display:grid;gap:4px;justify-items:start}'
  + '.dsh-rg-status,.dsh-rg-sourceDirty{margin:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-status::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-statusOn::before{background:var(--dsw-alias-state-success-primary)}'
  + '.dsh-rg-layer{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary);max-width:100%}'
  + '.dsh-rg-layer summary{cursor:pointer}'
  + '.dsh-rg-layer p{margin:4px 0 0;max-width:62em;overflow-wrap:anywhere}'
  + '.dsh-rg-dirty,.dsh-rg-chip{display:inline-flex;align-items:center;border:.5px solid var(--dsw-alias-border-l3);border-radius:5px;padding:1px 5px;font-size:11px;line-height:16px;font-weight:500;white-space:nowrap}'
  + '.dsh-rg-dirty,.dsh-rg-modified{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-warn-label)}'
  + '.dsh-rg-chip{color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-globalNotices{display:grid;gap:6px}'
  + '.dsh-rg-notice,.dsh-rg-empty{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}'
  + '.dsh-rg-catalogError{color:var(--dsw-alias-state-error-primary);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px}'
  + '.dsh-rg-catalogError button,.dsh-rg-retry{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:0;padding:0;font:inherit}'
  + '.dsh-rg-gapNotice{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-label)}'
  + '.dsh-rg-gapNotice button{flex:none;color:var(--dsw-alias-state-warn-label);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 8px;font-size:12px}'
  + '.dsh-rg-workspace{display:grid;grid-template-columns:minmax(220px,264px) minmax(0,1fr);gap:12px;flex:1;min-height:0;min-width:0}'
  + '.dsh-rg-sidebar{display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}'
  + '.dsh-rg-sideHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-width:0}'
  + '.dsh-rg-sideTitle{display:flex;align-items:baseline;gap:6px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}'
  + '.dsh-rg-count{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-add{justify-self:start;color:var(--dsw-alias-brand-primary);cursor:pointer;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 9px;font-family:inherit;font-size:11px}'
  + '.dsh-rg-roleListScroll{flex:1;min-height:0;min-width:0;overflow-y:auto;padding-right:4px}'
  + '.dsh-rg-roleList{list-style:none;margin:0;padding:0;display:grid;gap:6px}'
  + '.dsh-rg-roleItem{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;gap:3px;min-width:0}'
  + '.dsh-rg-roleSelect{display:grid;gap:5px;width:100%;max-width:100%;min-width:0;text-align:left;font-family:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid transparent;border-radius:8px;padding:9px;cursor:pointer}'
  + '.dsh-rg-roleSelect:hover{background:var(--dsw-alias-bg-layer-2)}'
  + '.dsh-rg-roleSelect.dsh-rg-selected{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}'
  + '.dsh-rg-roleNameRow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}'
  + '.dsh-rg-roleName{font-size:12px;font-weight:600;overflow-wrap:anywhere}'
  + '.dsh-rg-routeSummary{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}'
  + '.dsh-rg-remove{align-self:center;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:none;border:.5px solid transparent;border-radius:5px;padding:3px 6px;font-family:inherit;font-size:12px;white-space:nowrap}'
  + '.dsh-rg-remove:hover{border-color:var(--dsw-alias-state-error-primary)}'
  + '.dsh-rg-detail{display:flex;flex-direction:column;min-height:0;min-width:0;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px}'
  + '.dsh-rg-editorHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;flex:none;min-width:0;padding:12px;border-bottom:.5px solid var(--dsw-alias-border-l4)}'
  + '.dsh-rg-editorTitle{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;margin:0;font-size:15px;line-height:22px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}'
  + '.dsh-rg-editorScroll{flex:1;min-height:0;min-width:0;overflow-y:auto;padding:12px}'
  + '.dsh-rg-editor{display:grid;gap:16px;min-width:0}'
  + '.dsh-rg-formSection{display:grid;gap:9px;min-width:0}'
  + '.dsh-rg-sectionHead{display:flex;align-items:baseline;gap:8px;margin:0;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-sectionNumber{font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-brand-primary)}'
  + '.dsh-rg-basicFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}'
  + '.dsh-rg-routeFields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:10px;min-width:0}'
  + '.dsh-rg-field{display:grid;align-content:start;gap:4px;min-width:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-field input,.dsh-rg-field select,.dsh-rg-field textarea{box-sizing:border-box;width:100%;max-width:100%;min-width:0;font-family:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px}'
  + '.dsh-rg-field textarea{min-height:76px;resize:vertical;scrollbar-gutter:stable}'
  + '.dsh-rg-field textarea.dsh-rg-summaryInput{min-height:140px}'
  // Summary sizes to its content: a one-line summary must not reserve 140px (that pushed the
  // fallback/persona sections below the fold), and a multi-line one must not clip like the old
  // fixed 76px box. Kernels without field-sizing keep the 140px fallback above.
  + '@supports (field-sizing: content){.dsh-rg-field textarea.dsh-rg-summaryInput{field-sizing:content;min-height:64px;max-height:220px}}'
  + '.dsh-rg-field textarea.dsh-rg-personaInput{min-height:150px}'
  + '.dsh-rg-field input[readonly]{opacity:.8;cursor:default}'
  + '.dsh-rg-field .dsh-rg-invalid{border-color:var(--dsw-alias-state-error-primary)}'
  + '.dsh-rg-help{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}'
  + '.dsh-rg-fieldError{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}'
  + '.dsh-rg-fallbackSection{min-width:0}'
  + '.dsh-rg-fallbackList{margin:0;padding-left:24px;display:grid;gap:6px;color:var(--dsw-alias-label-primary);font-size:12px}'
  + '.dsh-rg-fallbackList li{min-width:0;overflow-wrap:anywhere}'
  + '.dsh-rg-fallbackList code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}'
  + '.dsh-rg-savebar{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;flex:none;min-width:0;border-top:.5px solid var(--dsw-alias-border-l4);padding-top:10px}'
  + '.dsh-rg-saveFeedback{margin:0;flex:1;min-width:180px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}'
  + '.dsh-rg-saveFeedback[role=alert]{color:var(--dsw-alias-state-error-primary)}'
  + '.dsh-rg-actions{display:flex;gap:8px;flex-wrap:wrap;min-width:0}'
  + '.dsh-rg-actions button{cursor:pointer;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 12px;font-family:inherit;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}'
  + '.dsh-rg-actions button.dsh-rg-save{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-2)}'
  + '.dsh-rg-card .dsh-rg-actions button:disabled{background:transparent;color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);cursor:not-allowed}'
  + '.dsh-rg-liveHint{margin:0;flex-basis:100%;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}'
  + '.dsh-rg-card button:disabled{cursor:default;border-color:var(--dsw-alias-border-l4)}'
  + '.dsh-rg-card input:disabled,.dsh-rg-card select:disabled,.dsh-rg-card textarea:disabled{opacity:.5;cursor:default}'
  + '.dsh-rg-card :is(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}'
  // The settings modal is only ~600px wide inside a ~1400px viewport, so breakpoints must key on the
  // CARD's width, not the viewport: @media never fired here and the editor was squeezed to ~290px
  // (2026-11-26 user screenshot). Container queries: wide = list+editor side by side, narrow = a
  // compact role strip above a full-width editor.
  + '@container (max-width: 720px){.dsh-rg-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:10px}.dsh-rg-sidebar{gap:6px}.dsh-rg-roleListScroll{overflow-x:hidden;overflow-y:auto;max-height:104px;padding-right:0;padding-bottom:2px}.dsh-rg-roleList{display:flex;flex-wrap:wrap;gap:6px}.dsh-rg-roleItem{grid-template-columns:auto auto}.dsh-rg-roleSelect{width:auto;padding:5px 8px;white-space:nowrap}.dsh-rg-roleNameRow{flex-wrap:nowrap}.dsh-rg-roleSelect .dsh-rg-chip{display:none}.dsh-rg-routeSummary{display:none}.dsh-rg-basicFields{grid-template-columns:minmax(0,1fr)}.dsh-rg-routeFields{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-rg-editorScroll{padding:10px}}'
  + '@container (max-width: 430px){.dsh-rg-head,.dsh-rg-status,.dsh-rg-sourceDirty,.dsh-rg-savebar{align-items:flex-start}.dsh-rg-saveFeedback{min-width:0;flex-basis:100%}.dsh-rg-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.dsh-rg-actions button{width:100%;min-width:0;padding:5px 7px;overflow-wrap:anywhere}.dsh-rg-actions button.dsh-rg-restore{grid-column:1/-1}.dsh-rg-editorHead{padding:10px}.dsh-rg-gapNotice{align-items:flex-start}}'

const CSS_TAG_ID = 'dsh-rolegroup/card.jsx'
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-rolegroup'
  tag.dataset.pluginCss = CSS_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

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

const ERROR_KEYS = {
  toolName: 'fieldToolNameError',
  provider: 'fieldProviderError',
  model: 'fieldModelError',
  reasoningEffort: 'fieldReasoningEffortError',
}

/** Render the settings section as one role list, one editor, and a persistent save bar. */
export function RolegroupCard(props) {
  const { t } = props
  const state = props.useRolegroupCard((snapshot) => snapshot)

  if (props.view === 'summary') return t('description')

  const disabled = !state.available || !state.writable || state.saving
  const head = (
    <div className="dsh-rg-headBlock">
      <div className="dsh-rg-head">
        <div className="dsh-rg-titleRow">
          <h2 className="dsh-rg-title">{t('title')}</h2>
          <span className="dsh-rg-version">{`v${PLUGIN_VERSION}`}</span>
        </div>
        <div className="dsh-rg-headActions">
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

  if (!state.available && !state.hasDrafts) {
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
  const dirtySummary = state.dirtyRoleCount === 1
    ? t('dirtyRoleOne')
    : `${state.dirtyRoleCount ?? 0} ${t('dirtyRoles')}`
  const feedbackCopy = {
    saving: t('statusSaving'),
    success: t('statusSuccess'),
    'validation-error': t('validationFailed'),
    'write-error': t('writeFailed'),
    'restore-error': t('restoreFailed'),
    conflict: t('conflicted'),
    dirty: state.dirtyRoleCount > 0 ? dirtySummary : t('statusDirty'),
    clean: t('statusClean'),
  }[state.saveFeedback] ?? (state.dirty ? t('statusDirty') : t('statusClean'))
  const feedbackIsAlert = ['validation-error', 'write-error', 'restore-error', 'conflict'].includes(state.saveFeedback)

  const renderFieldError = (row, field) => row.invalidFields.includes(field) ? (
    <span className="dsh-rg-fieldError" id={`dsh-rg-${row.toolName}-${field}-error`}>{t(ERROR_KEYS[field])}</span>
  ) : null

  const describedBy = (row, field, helpId) => [
    helpId,
    row.invalidFields.includes(field) ? `dsh-rg-${row.toolName}-${field}-error` : null,
  ].filter(Boolean).join(' ') || undefined

  const invalidProps = (row, field, helpId) => ({
    'aria-invalid': row.invalidFields.includes(field) ? 'true' : undefined,
    'aria-describedby': describedBy(row, field, helpId),
  })

  const sectionHead = (number, key) => (
    <h4 className="dsh-rg-sectionHead">
      <span className="dsh-rg-sectionNumber">{number}</span>
      <span>{t(key)}</span>
    </h4>
  )

  const renderEditor = (row) => {
    const prefix = `dsh-rg-${row.toolName}`
    const routeHelpId = `${prefix}-route-help`
    const toolNameHelpId = `${prefix}-toolName-help`
    const modelInfo = modelsOf(row.provider).find((model) => model.id === row.model)
    const efforts = Array.isArray(modelInfo?.reasoning?.efforts) ? modelInfo.reasoning.efforts : []
    const defaultEffort = modelInfo?.reasoning?.defaultEffort
    const defaultLabel = defaultEffort === undefined || defaultEffort === ''
      ? t('reasoningEffortDefault')
      : `${t('reasoningEffortDefault')} (${defaultEffort})`
    const providerOptions = [
      ...(row.provider === '' ? [<option key="empty" value="">{t('selectProvider')}</option>] : []),
      ...groups.map((group) => <option key={group.id} value={group.id}>{group.name ?? group.id}</option>),
    ]
    const modelOptions = [
      ...(row.model === '' ? [<option key="empty" value="">{t('selectModel')}</option>] : []),
      ...modelsOf(row.provider).map((model) => (
        <option key={model.id} value={model.id}>
          {model.available === false ? `${model.name ?? model.id} (${t('routeUnavailable')})` : (model.name ?? model.id)}
        </option>
      )),
    ]
    const effortOptions = [
      <option key="default" value="">{defaultLabel}</option>,
      ...efforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.name ?? effort.id}</option>),
      ...(row.reasoningEffort !== '' && !efforts.some((effort) => effort.id === row.reasoningEffort)
        ? [<option key="legacy" value={row.reasoningEffort}>{row.reasoningEffort}</option>] : []),
    ]
    return (
      <div className="dsh-rg-editor" key={row.toolName}>
        <section className="dsh-rg-formSection">
          {sectionHead('01', 'sectionIdentity')}
          <div className="dsh-rg-basicFields">
            <div className="dsh-rg-field">
              <label htmlFor={`${prefix}-toolName`}>{t('fieldToolName')}</label>
              <input
                id={`${prefix}-toolName`}
                className={row.invalidFields.includes('toolName') ? 'dsh-rg-invalid' : ''}
                value={row.toolName}
                readOnly={!row.isCustom}
                autoFocus={row.isCustom && state.focusToolName === row.toolName}
                disabled={disabled}
                onChange={(event) => props.editRole(row.toolName, 'toolName', event.target.value)}
                {...invalidProps(row, 'toolName', toolNameHelpId)}
              />
              <span className="dsh-rg-help" id={toolNameHelpId}>{t('toolNameHelp')}</span>
              {renderFieldError(row, 'toolName')}
            </div>
            <div className="dsh-rg-field">
              <label htmlFor={`${prefix}-summary`}>{t('fieldSummary')}</label>
              <textarea
                id={`${prefix}-summary`}
                className="dsh-rg-summaryInput"
                value={row.summary}
                disabled={disabled}
                onChange={(event) => props.editRole(row.toolName, 'summary', event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="dsh-rg-formSection">
          {sectionHead('02', 'sectionRouting')}
          <div className="dsh-rg-routeFields">
            <div className="dsh-rg-field">
              <label htmlFor={`${prefix}-provider`}>{t('fieldProvider')}</label>
              {catalogReady ? (
                <select
                  id={`${prefix}-provider`}
                  className={row.invalidFields.includes('provider') ? 'dsh-rg-invalid' : ''}
                  value={row.provider}
                  disabled={disabled}
                  onChange={(event) => props.editRole(row.toolName, 'provider', event.target.value)}
                  {...invalidProps(row, 'provider', routeHelpId)}
                >{providerOptions}</select>
              ) : (
                <input
                  id={`${prefix}-provider`}
                  className={row.invalidFields.includes('provider') ? 'dsh-rg-invalid' : ''}
                  value={row.provider}
                  disabled={disabled}
                  onChange={(event) => props.editRole(row.toolName, 'provider', event.target.value)}
                  {...invalidProps(row, 'provider', routeHelpId)}
                />
              )}
              {renderFieldError(row, 'provider')}
            </div>
            <div className="dsh-rg-field">
              <label htmlFor={`${prefix}-model`}>{t('fieldModel')}</label>
              {catalogReady ? (
                <select
                  id={`${prefix}-model`}
                  className={row.invalidFields.includes('model') ? 'dsh-rg-invalid' : ''}
                  value={row.model}
                  disabled={disabled}
                  onChange={(event) => props.editRole(row.toolName, 'model', event.target.value)}
                  {...invalidProps(row, 'model', routeHelpId)}
                >{modelOptions}</select>
              ) : (
                <input
                  id={`${prefix}-model`}
                  className={row.invalidFields.includes('model') ? 'dsh-rg-invalid' : ''}
                  value={row.model}
                  disabled={disabled}
                  onChange={(event) => props.editRole(row.toolName, 'model', event.target.value)}
                  {...invalidProps(row, 'model', routeHelpId)}
                />
              )}
              {renderFieldError(row, 'model')}
            </div>
            <div className="dsh-rg-field">
              <label htmlFor={`${prefix}-reasoningEffort`}>{t('fieldReasoningEffort')}</label>
              {catalogReady && modelInfo !== undefined && efforts.length > 0 ? (
                <select
                  id={`${prefix}-reasoningEffort`}
                  className={row.invalidFields.includes('reasoningEffort') ? 'dsh-rg-invalid' : ''}
                  value={row.reasoningEffort}
                  disabled={disabled}
                  onChange={(event) => props.editRole(row.toolName, 'reasoningEffort', event.target.value)}
                  {...invalidProps(row, 'reasoningEffort', routeHelpId)}
                >{effortOptions}</select>
              ) : catalogReady && modelInfo !== undefined ? (
                <input
                  id={`${prefix}-reasoningEffort`}
                  className={row.invalidFields.includes('reasoningEffort') ? 'dsh-rg-invalid' : ''}
                  value={row.reasoningEffort}
                  disabled
                  placeholder={modelInfo.available === false ? t('modelUnavailable') : t('reasoningEffortUnsupported')}
                  {...invalidProps(row, 'reasoningEffort', routeHelpId)}
                />
              ) : (
                <input
                  id={`${prefix}-reasoningEffort`}
                  className={row.invalidFields.includes('reasoningEffort') ? 'dsh-rg-invalid' : ''}
                  value={row.reasoningEffort}
                  disabled={disabled}
                  placeholder={defaultLabel}
                  onChange={(event) => props.editRole(row.toolName, 'reasoningEffort', event.target.value)}
                  {...invalidProps(row, 'reasoningEffort', routeHelpId)}
                />
              )}
              {renderFieldError(row, 'reasoningEffort')}
            </div>
          </div>
          <p className="dsh-rg-help" id={routeHelpId}>{t(catalogReady ? 'catalogReadyRoute' : 'catalogTextRoute')}</p>
        </section>

        <section className="dsh-rg-formSection dsh-rg-fallbackSection">
          {sectionHead('03', 'sectionFallback')}
          <p className="dsh-rg-help">{t('fallbackReadOnly')}</p>
          {Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0 ? (
            <ol className="dsh-rg-fallbackList">
              {row.fallbackModels.map((route, index) => <li key={`${index}:${route}`}><code>{route}</code></li>)}
            </ol>
          ) : <p className="dsh-rg-empty">{t('fallbackEmpty')}</p>}
        </section>

        <section className="dsh-rg-formSection">
          {sectionHead('04', 'sectionPersona')}
          <div className="dsh-rg-field">
            <label htmlFor={`${prefix}-persona`}>{t('fieldPersona')}</label>
            <textarea
              id={`${prefix}-persona`}
              className="dsh-rg-personaInput"
              value={row.persona}
              disabled={disabled}
              onChange={(event) => props.editRole(row.toolName, 'persona', event.target.value)}
            />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="dsh-rg-card">
      {head}
      <div className="dsh-rg-statusBlock">
        <p className={`dsh-rg-status${state.mode === 'custom' ? ' dsh-rg-statusOn' : ''}`} role="status">
          {state.mode === 'custom'
            ? `${t('statusCustom')}（${state.overrides ?? 0} ${t('overridesCount')}）`
            : t('statusOfficial')}
        </p>
        {state.dirty ? (
          <p className="dsh-rg-sourceDirty">
            <span className="dsh-rg-dirty">{t('dirtyBadge')}</span>
            <span>{dirtySummary}</span>
          </p>
        ) : null}
        <details className="dsh-rg-layer">
          <summary>{t('layerSummary')}</summary>
          <p>{t('layerNote')}</p>
          <p>
            {t('modelsDocHint')}{' '}
            <a href={`${PLUGIN_REPO_URL}/blob/main/MODELS.md`} target="_blank" rel="noreferrer">MODELS.md</a>
          </p>
        </details>
      </div>

      <div className="dsh-rg-globalNotices">
        {!state.writable ? <p className="dsh-rg-notice" role="status">{t('notWritable')}</p> : null}
        {state.catalog.status === 'loading' ? <p className="dsh-rg-notice" role="status">{t('catalogLoading')}</p> : null}
        {state.catalog.status === 'error' ? (
          <div className="dsh-rg-catalogError" role="alert">
            <span>{t('catalogError')}</span>
            <button type="button" disabled={state.saving} onClick={props.retryCatalog}>{t('retryCatalog')}</button>
          </div>
        ) : null}
        {state.catalog.partial ? <p className="dsh-rg-notice">{t('catalogPartial')}</p> : null}
        {(state.routeGaps ?? []).length > 0 ? (
          <div className="dsh-rg-gapNotice" role="status">
            <span>{state.routeGaps.length} {t('routeGapNotice')}</span>
            <button type="button" disabled={disabled} onClick={props.fillUnavailableRoutes}>{t('fillRoutes')}</button>
          </div>
        ) : null}
      </div>

      <div className="dsh-rg-workspace">
        <aside className="dsh-rg-sidebar">
          <div className="dsh-rg-sideHead">
            <div className="dsh-rg-sideTitle">
              <span>{t('rolesHeading')}</span>
              <span className="dsh-rg-count">{`${state.rows.length} ${t('roleCount')}`}</span>
            </div>
            <button type="button" className="dsh-rg-add" disabled={disabled} onClick={props.addRole}>+ {t('addRole')}</button>
          </div>
          <div className="dsh-rg-roleListScroll">
            <ul className="dsh-rg-roleList" aria-label={t('roleListAria')}>
              {state.rows.map((row) => {
                const selected = row.toolName === state.selectedToolName
                return (
                  <li className="dsh-rg-roleItem" key={row.toolName}>
                    <button
                      type="button"
                      className={`dsh-rg-roleSelect${selected ? ' dsh-rg-selected' : ''}`}
                      data-tool-name={row.toolName}
                      aria-current={selected ? 'true' : undefined}
                      aria-label={`${t('selectRole')}: ${row.toolName}`}
                      disabled={state.saving}
                      onClick={() => props.selectRole(row.toolName)}
                    >
                      <span className="dsh-rg-roleNameRow">
                        <span className="dsh-rg-roleName">{row.toolName}</span>
                        <span className="dsh-rg-chip">{row.isCustom ? t('roleCustom') : t('roleBuiltin')}</span>
                        {row.modified ? <span className="dsh-rg-dirty dsh-rg-modified">{t('modifiedBadge')}</span> : null}
                      </span>
                      <span className="dsh-rg-routeSummary">{`${row.provider}/${row.model}`}</span>
                    </button>
                    {row.isCustom ? (
                      <button
                        type="button"
                        className="dsh-rg-remove dsh-rg-removeList"
                        data-tool-name={row.toolName}
                        aria-label={`${t('removeRole')}: ${row.toolName}`}
                        title={t('removeRole')}
                        disabled={disabled}
                        onClick={() => props.removeRole(row.toolName)}
                      ><span aria-hidden="true">×</span></button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <section className="dsh-rg-detail">
          {state.selectedRow ? (
            <>
              <div className="dsh-rg-editorHead">
                <h3 className="dsh-rg-editorTitle">
                  <span>{state.selectedRow.toolName}</span>
                  <span className="dsh-rg-chip">{state.selectedRow.isCustom ? t('roleCustom') : t('roleBuiltin')}</span>
                  {state.selectedRow.modified ? <span className="dsh-rg-dirty dsh-rg-modified">{t('modifiedBadge')}</span> : null}
                </h3>
                {state.selectedRow.isCustom ? (
                  <button
                    type="button"
                    className="dsh-rg-remove dsh-rg-removeEditor"
                    disabled={disabled}
                    onClick={() => props.removeRole(state.selectedRow.toolName)}
                  >{t('removeRole')}</button>
                ) : null}
              </div>
              <div className="dsh-rg-editorScroll" key={state.selectedToolName}>{renderEditor(state.selectedRow)}</div>
            </>
          ) : (
            <div className="dsh-rg-editorScroll">
              <p className="dsh-rg-empty">{state.takeover ? t('emptyTakeover') : t('emptyNotTakeover')}</p>
            </div>
          )}
        </section>
      </div>

      <footer className="dsh-rg-savebar">
        <p
          className="dsh-rg-saveFeedback"
          role={feedbackIsAlert ? 'alert' : 'status'}
          aria-live={feedbackIsAlert ? 'assertive' : 'polite'}
        >{feedbackCopy}</p>
        <div className="dsh-rg-actions">
          <button type="button" className="dsh-rg-save" disabled={disabled || !state.dirty} title={!state.dirty ? t('statusClean') : undefined} onClick={props.save}>{t('save')}</button>
          <button type="button" disabled={disabled || !state.dirty} title={!state.dirty ? t('statusClean') : undefined} onClick={props.discard}>{t('discard')}</button>
          {state.mode === 'custom' ? (
            <button type="button" className="dsh-rg-restore" disabled={disabled} onClick={props.restoreOfficial}>
              {t('restoreOfficial')}
            </button>
          ) : null}
        </div>
        <p className="dsh-rg-liveHint">{t('liveHint')}</p>
      </footer>
    </div>
  )
}
