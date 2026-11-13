window.__ModuleLoader__.load({
	id: "dsh-rolegroup",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/meta.js
var PLUGIN_VERSION, PLUGIN_REPO_URL;
var init_meta = __esm({
  "src/client/meta.js"() {
    PLUGIN_VERSION = true ? "0.8.2" : "dev";
    PLUGIN_REPO_URL = "https://github.com/zhouxnsz/dsh-rolegroup";
  }
});

// src/client/card.jsx
var card_exports = {};
__export(card_exports, {
  RolegroupCard: () => RolegroupCard
});
function GitHubMark() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      fill: "currentColor",
      d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    }
  ) });
}
function FileMark() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L9.5 1.5Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.5 1.5v3h3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.5 8h5M5.5 10.5h5" })
  ] });
}
function RolegroupCard(props) {
  const { t } = props;
  const state = props.useRolegroupCard((snapshot) => snapshot);
  if (props.view === "summary") return t("description");
  const needsPrefill = state.effective?.required === true;
  const disabled = !state.writable || state.saving || needsPrefill && state.effective.status !== "ready" && state.effective.status !== "error";
  const head = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-headBlock", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-titleRow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "dsh-rg-title", children: t("title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-rg-version", children: `v${PLUGIN_VERSION}` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-headActions", children: [
        state.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-rg-dirty", children: t("dirtyBadge") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-rg-action",
            disabled: state.config?.status === "loading",
            "aria-label": t("configFileAria"),
            title: t("configFileAria"),
            onClick: () => {
              void props.openConfig().then((opened) => {
                if (opened === true && typeof props.close === "function") props.close();
              });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileMark, {}),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("configFile") })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "a",
          {
            className: "dsh-rg-action",
            href: PLUGIN_REPO_URL,
            target: "_blank",
            rel: "noreferrer",
            "aria-label": t("githubAria"),
            title: t("githubAria"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GitHubMark, {}),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("github") })
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-desc", children: t("description") })
  ] });
  if (!state.available) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-card", children: [
      head,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("scopeUnavailable") })
    ] });
  }
  const catalogReady = state.catalog.status === "ready";
  const groups = state.catalog.groups;
  const modelsOf = (provider) => groups.find((group) => group.id === provider)?.models ?? [];
  const renderRow = (row) => {
    const modelInfo = modelsOf(row.provider).find((model) => model.id === row.model);
    const efforts = Array.isArray(modelInfo?.reasoning?.efforts) ? modelInfo.reasoning.efforts : [];
    const defaultEffort = modelInfo?.reasoning?.defaultEffort;
    const defaultLabel = defaultEffort === void 0 || defaultEffort === "" ? t("reasoningEffortDefault") : `${t("reasoningEffortDefault")} (${defaultEffort})`;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-rowHead", children: [
        row.isCustom ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: `dsh-rg-toolName${row.invalidFields.includes("toolName") ? " dsh-rg-invalid" : ""}`,
            "aria-label": t("fieldToolName"),
            value: row.toolName,
            disabled,
            onChange: (event) => props.editRole(row.toolName, "toolName", event.target.value)
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-rg-toolName", children: row.toolName }),
        row.isCustom ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-rg-remove",
            disabled,
            onClick: () => props.removeRole(row.toolName),
            children: t("removeRole")
          }
        ) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-fields", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `dsh-rg-field${row.invalidFields.includes("provider") ? " dsh-rg-invalid" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("fieldProvider") }),
          catalogReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              value: row.provider,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "provider", event.target.value),
              children: [
                row.provider === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("selectProvider") }) : null,
                groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: group.id, children: group.name ?? group.id }, group.id))
              ]
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: row.provider,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "provider", event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `dsh-rg-field${row.invalidFields.includes("model") ? " dsh-rg-invalid" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("fieldModel") }),
          catalogReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              value: row.model,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "model", event.target.value),
              children: [
                row.model === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("selectModel") }) : null,
                modelsOf(row.provider).map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: model.id, children: model.available === false ? `${model.name ?? model.id} (${t("routeUnavailable")})` : model.name ?? model.id }, model.id))
              ]
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: row.model,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "model", event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `dsh-rg-field${row.invalidFields.includes("reasoningEffort") ? " dsh-rg-invalid" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("fieldReasoningEffort") }),
          catalogReady && modelInfo !== void 0 && efforts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              value: row.reasoningEffort,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "reasoningEffort", event.target.value),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: defaultLabel }),
                efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: effort.id, children: effort.name ?? effort.id }, effort.id)),
                row.reasoningEffort !== "" && !efforts.some((effort) => effort.id === row.reasoningEffort) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: row.reasoningEffort, children: row.reasoningEffort }) : null
              ]
            }
          ) : catalogReady && modelInfo !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: row.reasoningEffort, disabled: true, placeholder: t("reasoningEffortUnsupported") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: row.reasoningEffort,
              disabled,
              placeholder: defaultLabel,
              onChange: (event) => props.editRole(row.toolName, "reasoningEffort", event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsh-rg-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("fieldSummary") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: row.summary,
              disabled,
              onChange: (event) => props.editRole(row.toolName, "summary", event.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "dsh-rg-persona", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("fieldPersona") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: row.persona,
            disabled,
            onChange: (event) => props.editRole(row.toolName, "persona", event.target.value)
          }
        )
      ] })
    ] }, row.toolName);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-card", children: [
    head,
    state.catalog.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("catalogLoading") }) : null,
    state.catalog.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-catalogError", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("catalogError") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: state.saving, onClick: props.retryCatalog, children: t("retryCatalog") })
    ] }) : null,
    state.catalog.partial ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", children: t("catalogPartial") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-statusBlock", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: `dsh-rg-status${state.takeover ? " dsh-rg-statusOn" : ""}`, role: "status", children: state.takeover ? t("statusTakeover") : t("statusNotTakeover") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "dsh-rg-layer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("layerSummary") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("layerNote") })
      ] })
    ] }),
    (state.routeGaps ?? []).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-gapNotice", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        state.routeGaps.length,
        " ",
        t("routeGapNotice")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled, onClick: props.fillUnavailableRoutes, children: t("fillRoutes") })
    ] }) : null,
    state.effective?.status === "loading" || state.effective?.status === "idle" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("effectiveLoading") }) : null,
    state.effective?.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsh-rg-alert", role: "alert", children: [
        t("effectiveError"),
        state.effective.error ? ` (${state.effective.error})` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-configHint", children: t("effectiveErrorHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-rg-retry", disabled: state.saving, onClick: props.retryEffective, children: t("retryEffective") })
    ] }) : null,
    state.effective?.prefilled && state.rows.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-configHint", children: t("prefillHint") }) : null,
    state.config?.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("configOpening") }) : null,
    state.config?.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsh-rg-alert", role: "alert", children: [
        t("configOpenFailed"),
        state.config.error ? ` (${state.config.error})` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-configHint", children: t("configRestartHint") })
    ] }) : null,
    state.config?.notice === "noFile" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("configFileMissing") }) : null,
    state.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-alert", role: "alert", children: t("saveFailed") }) : null,
    state.conflicted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-alert", role: "status", children: t("conflicted") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-rg-rows", children: state.rows.length === 0 ? state.effective?.status === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-empty", children: state.takeover ? t("emptyTakeover") : t("emptyNotTakeover") }) : null : state.rows.map(renderRow) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "dsh-rg-add", disabled, onClick: props.addRole, children: [
      "+ ",
      t("addRole")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-rg-save", disabled: disabled || !state.dirty, onClick: props.save, children: t("save") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: disabled || !state.dirty, onClick: props.discard, children: t("discard") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled, onClick: props.resetToBase, children: t("resetToBase") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-liveHint", children: t("liveHint") })
  ] });
}
var import_jsx_runtime, CSS, CSS_TAG_ID;
var init_card = __esm({
  "src/client/card.jsx"() {
    init_meta();
    import_jsx_runtime = require("react/jsx-runtime");
    CSS = '.dsh-rg-card{display:grid;gap:10px}.dsh-rg-headBlock{min-width:0}.dsh-rg-head{display:flex;justify-content:space-between;align-items:center;gap:8px 16px;flex-wrap:wrap}.dsh-rg-titleRow{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}.dsh-rg-title{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)}.dsh-rg-version{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}.dsh-rg-desc{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-statusBlock{display:grid;gap:4px;justify-items:start;min-width:0}.dsh-rg-status{margin:0;display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.dsh-rg-status::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.dsh-rg-statusOn::before{background:var(--dsw-alias-state-success-primary)}.dsh-rg-layer{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-layer summary{cursor:pointer}.dsh-rg-layer p{margin:4px 0 0;max-width:62em}.dsh-rg-empty{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-headActions{display:flex;align-items:center;gap:8px;flex-shrink:0}.dsh-rg-action{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);text-decoration:none;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px;white-space:nowrap;cursor:pointer}.dsh-rg-action:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}.dsh-rg-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.dsh-rg-action svg{flex:none}.dsh-rg-dirty{font-size:11px;color:var(--dsw-alias-state-warn-label);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 6px;white-space:nowrap}.dsh-rg-notice{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-alert{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}.dsh-rg-catalogError{color:var(--dsw-alias-label-error);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px}.dsh-rg-catalogError button{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:0;padding:0;font-size:12px}.dsh-rg-gapNotice{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-label)}.dsh-rg-gapNotice button{flex:none;color:var(--dsw-alias-state-warn-label);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 8px;font-size:12px}.dsh-rg-gapNotice button:disabled{opacity:.5;cursor:default}.dsh-rg-rows{display:grid;gap:6px}.dsh-rg-row{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:10px;display:grid;gap:8px}.dsh-rg-rowHead{display:flex;align-items:center;gap:12px;min-width:0}.dsh-rg-toolName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}input.dsh-rg-toolName{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px}.dsh-rg-remove{color:var(--dsw-alias-label-error);cursor:pointer;background:none;border:0;padding:0;font-size:12px;white-space:nowrap}.dsh-rg-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.dsh-rg-field{display:grid;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:0}.dsh-rg-field input,.dsh-rg-field select,.dsh-rg-field textarea{font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-width:0}.dsh-rg-field textarea{min-height:64px;resize:vertical}.dsh-rg-invalid input,.dsh-rg-invalid select,input.dsh-rg-invalid{border-color:var(--dsw-alias-label-error)}.dsh-rg-persona summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsh-rg-persona textarea{margin-top:6px;width:100%;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-height:64px;resize:vertical}.dsh-rg-add{justify-self:start;color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 10px;font-size:12px}.dsh-rg-actions{display:flex;gap:8px}.dsh-rg-actions button{cursor:pointer;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.dsh-rg-actions button.dsh-rg-save{background:var(--dsw-alias-brand-primary);color:#fff}.dsh-rg-actions button:disabled,.dsh-rg-add:disabled,.dsh-rg-remove:disabled,.dsh-rg-catalogError button:disabled{opacity:.5;cursor:default}.dsh-rg-liveHint{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-configHint{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-retry{justify-self:start;font-family:inherit;font-size:12px;color:var(--dsw-alias-brand-primary);background:none;border:0;padding:0;cursor:pointer}';
    CSS_TAG_ID = "dsh-rolegroup/card.jsx";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-rolegroup";
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
  }
});

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// lib/roles.js
var TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
var DEFAULT_ROLES = {
  analyst: {
    provider: "qwen-token-plan-cn",
    model: "qwen3.8-max",
    fallbackModels: ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"],
    summary: "\u9700\u6C42\u6F84\u6E05\u3001\u8DEF\u5F84\u5206\u7C7B\u3001\u65B9\u6848\u8BC4\u5BA1\uFF08\u505A\u4E0D\u505A/\u600E\u4E48\u505A\uFF09\u3001\u67B6\u6784\u51B3\u7B56",
    persona: [
      "\u4F60\u662F analyst\u2014\u2014\u9700\u6C42\u6F84\u6E05\u4E0E\u65B9\u6848\u8BC4\u5BA1\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u628A\u6A21\u7CCA\u9700\u6C42\u5148\u5206\u7C7B\u8DEF\u5F84\uFF08\u63A2\u7D22/\u53D8\u66F4/\u4FEE\u590D\uFF09\uFF0C\u63D0\u51FA\u5173\u952E\u95EE\u9898\uFF0C\u8BC4\u5BA1\u300C\u505A\u4E0D\u505A\u3001\u600E\u4E48\u505A\u300D\uFF0C\u7ED9\u51FA\u67B6\u6784\u51B3\u7B56\u5EFA\u8BAE\u3002",
      "\u94C1\u5F8B\uFF1A\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF0C\u4E0D\u52A8\u624B\u5B9E\u73B0\uFF1B\u8F93\u51FA\u5FC5\u987B\u662F\u7ED3\u8BBA + \u4F9D\u636E\uFF08\u6587\u4EF6:\u884C\u53F7 \u6216\u5B98\u65B9\u6765\u6E90\uFF09\uFF1B",
      "\u53D1\u73B0\u9700\u6C42\u6B67\u4E49\u65F6\u5148\u5217\u5206\u652F\u518D\u63D0\u95EE\uFF0C\u4E0D\u66FF\u7528\u6237\u62CD\u677F\u3002"
    ].join("\n")
  },
  planner: {
    provider: "kimi-coding",
    model: "k3",
    fallbackModels: ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"],
    summary: "\u8BA1\u5212\u8BBE\u8BA1\uFF1A\u6587\u4EF6\u7ED3\u6784\u3001\u4EFB\u52A1\u62C6\u5206\u3001\u63A5\u53E3\u5951\u7EA6\u3001plans.md \u843D\u7B14",
    persona: [
      "\u4F60\u662F planner\u2014\u2014\u8BA1\u5212\u8BBE\u8BA1\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u628A\u6279\u51C6\u540E\u7684\u65B9\u6848\u843D\u6210\u53EF\u6267\u884C\u8BA1\u5212\uFF1A\u6587\u4EF6\u7ED3\u6784\u3001\u4EFB\u52A1\u62C6\u5206\uFF08\u6BCF\u4EFB\u52A1\u5E26\u9A8C\u6536\u6807\u51C6\u3001\u6D89\u53CA\u6587\u4EF6\u3001\u6D4B\u8BD5\u5148\u884C\u3001\u8BC1\u636E\uFF09\u3001\u63A5\u53E3\u5951\u7EA6\u3002",
      "\u7EA6\u5B9A\uFF1A\u4F60\u7684\u5199\u5165\u8303\u56F4\u4EC5\u9650 plans/ \u76EE\u5F55\u4E0E\u8BA1\u5212\u6587\u6863\uFF08\u8F6F\u7EA6\u5B9A\uFF09\uFF1B\u4E0D\u5199\u751F\u4EA7\u4EE3\u7801\uFF1B",
      "\u4EFB\u52A1\u7C92\u5EA6\u4EE5\u300C\u4E00\u4E2A coder \u4E00\u8F6E\u80FD\u95ED\u73AF\u300D\u4E3A\u51C6\u3002"
    ].join("\n")
  },
  coder: {
    provider: "kimi-coding",
    model: "k3",
    fallbackModels: ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"],
    summary: "\u7F16\u7801\u6267\u884C\uFF1A\u6309 plans.md \u6B65\u9AA4 TDD \u7EA2-\u7EFF-\u91CD\u6784",
    persona: [
      "\u4F60\u662F coder\u2014\u2014\u7F16\u7801\u6267\u884C\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u4E25\u683C\u6309 plans.md \u7684\u4EFB\u52A1\u6B65\u9AA4\u6267\u884C TDD\uFF1A\u5148\u5199\u5931\u8D25\u6D4B\u8BD5\uFF08\u7EA2\uFF09\u2192 \u6700\u5C0F\u5B9E\u73B0\u901A\u8FC7\uFF08\u7EFF\uFF09\u2192 \u91CD\u6784\uFF1B",
      "\u6BCF\u6B65\u56DE\u586B\u8BC1\u636E\uFF08\u8DD1\u4E86\u4EC0\u4E48\u547D\u4EE4\u3001\u770B\u5230\u4EC0\u4E48\u8F93\u51FA\uFF09\u3002",
      "\u94C1\u5F8B\uFF1A\u4E0D\u504F\u79BB\u8BA1\u5212\u64C5\u81EA\u6269\u5927\u8303\u56F4\uFF1B\u9047\u5230\u8BA1\u5212\u7F3A\u9677\uFF0C\u505C\u4E0B\u6765\u62A5\u544A\uFF0C\u4E0D\u7ED5\u9053\u3002"
    ].join("\n")
  },
  reviewer: {
    provider: "qwen-token-plan-cn",
    model: "qwen3.8-max",
    fallbackModels: ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"],
    summary: "\u6536\u53E3\u5BA1\u67E5\uFF1A\u9010\u9879\u6838\u5BF9\u9A8C\u6536\u6807\u51C6\u4E0E\u8BC1\u636E\uFF08\u505A\u6CA1\u505A\u5230\uFF09",
    persona: [
      "\u4F60\u662F reviewer\u2014\u2014\u6536\u53E3\u5BA1\u67E5\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u9010\u9879\u6838\u5BF9\u9A8C\u6536\u6807\u51C6\u4E0E\u5B9E\u9645\u4EA7\u7269\uFF0C\u53EA\u8BA4\u8BC1\u636E\uFF08\u547D\u4EE4\u8F93\u51FA\u3001\u6D4B\u8BD5\u8BB0\u5F55\u3001\u6587\u4EF6:\u884C\u53F7\uFF09\uFF0C\u4E0D\u63A5\u53D7\u300C\u6211\u89C9\u5F97\u597D\u4E86\u300D\uFF1B",
      "\u6309\u4E25\u91CD\u5EA6\u5217\u51FA\u95EE\u9898\uFF08\u963B\u585E/\u5EFA\u8BAE\uFF09\u3002",
      "\u94C1\u5F8B\uFF1A\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF1B\u5BA1\u67E5\u8303\u56F4\u9650\u4E8E\u9A8C\u6536\u6807\u51C6\u3001\u8BC1\u636E\u771F\u5B9E\u6027\u3001\u8BA1\u5212\u7B26\u5408\u5EA6\uFF0C\u4E0D\u505A\u98CE\u683C\u8B66\u5BDF\uFF1B",
      "\u7ED3\u8BBA\u5FC5\u987B\u660E\u786E\uFF1A\u901A\u8FC7 / \u6709\u6761\u4EF6\u901A\u8FC7 / \u6253\u56DE\u3002"
    ].join("\n")
  },
  scout: {
    provider: "deepseek-official",
    model: "deepseek-flash",
    fallbackModels: ["deepseek-official/deepseek-v4-pro"],
    summary: "\u63A2\u7D22\u5B9A\u4F4D\u3001\u6279\u91CF\u641C\u7D22",
    persona: [
      "\u4F60\u662F scout\u2014\u2014\u63A2\u7D22\u5B9A\u4F4D\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u5728\u4EE3\u7801\u5E93\u4E2D\u5FEB\u901F\u5B9A\u4F4D\uFF08\u6279\u91CF\u641C\u7D22\u3001\u4EA4\u53C9\u5F15\u7528\uFF09\uFF0C\u8FD4\u56DE \u6587\u4EF6:\u884C\u53F7 \u7EA7\u522B\u7684\u8BC1\u636E\u6E05\u5355\u4E0E\u4E00\u53E5\u8BDD\u7ED3\u8BBA\u3002",
      "\u94C1\u5F8B\uFF1A\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF1B\u4E0D\u505A\u957F\u7BC7\u5206\u6790\uFF0C\u5B9A\u4F4D\u5373\u4EA4\u4ED8\uFF1B",
      "\u627E\u4E0D\u5230\u5C31\u660E\u8BF4\u627E\u4E0D\u5230\uFF0C\u5E76\u7ED9\u51FA\u5DF2\u6392\u9664\u7684\u8DEF\u5F84\u3002"
    ].join("\n")
  },
  scribe: {
    provider: "qwen-token-plan-cn",
    model: "qwen3.8-flash",
    fallbackModels: ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"],
    summary: "\u6587\u6863\u56DE\u586B\u3001\u62A5\u544A\u3001spec \u7EF4\u62A4",
    persona: [
      "\u4F60\u662F scribe\u2014\u2014\u6587\u6863\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u6587\u6863\u56DE\u586B\u3001\u62A5\u544A\u64B0\u5199\u3001spec \u7EF4\u62A4\uFF0C\u8BED\u8A00\u4E0E\u65E2\u6709\u6587\u6863\u98CE\u683C\u4E00\u81F4\u3002",
      "\u7EA6\u5B9A\uFF1A\u5199\u5165\u8303\u56F4\u4EC5\u9650\u6587\u6863\u7C7B\u6587\u4EF6\uFF08docs/\u3001plans/\u3001README\u3001openspec/\uFF0C\u8F6F\u7EA6\u5B9A\uFF09\uFF1B\u4E0D\u6539\u52A8\u4EE3\u7801\u903B\u8F91\uFF1B",
      "\u4E8B\u5B9E\u6027\u5185\u5BB9\u5FC5\u987B\u6709\u51FA\u5904\uFF0C\u4E0D\u7F16\u9020\u547D\u4EE4\u8F93\u51FA\u3002"
    ].join("\n")
  },
  vision: {
    // 多模态角色（0.8.0）。选型依据**两条独立证据**（不是推断）：
    //   ① 用户长期实践：omo 的 `multimodal-looker`（图片分析/UI 评审/原型识别）长期跑 qwen3.8-flash；
    //   ② 本项目委托链路探针：`evals/results/*/scout-02`（像素字体 OCR，**子会话**跑的）
    //      qwen3.8-flash **10/10**；同批 MiniMax-M3 仅 4/10 且**编造候选字符串**。
    // 备用链**只放 deepseek-official**：内置表有硬约束「备用链必须兜到唯一保证注册的 provider」
    // （tests: roles 跨 provider 备用链断言），故 k3 虽同样 10/10 也不能进链。
    // 只取 `deepseek-flash`（scout-02 **10/10**）——`deepseek-v4-pro` **视觉未测**，不放进视觉角色的链。
    // 上游 `dsh-llm` 没有"视觉能力位"，插件无法在启动期校验，失败发生在运行期——
    // 故 persona 里写死"看不清就说不清"，README 给出自测方法。
    provider: "qwen-token-plan-cn",
    model: "qwen3.8-flash",
    fallbackModels: ["deepseek-official/deepseek-flash"],
    summary: "\u770B\u56FE\uFF1A\u56FE\u7247\u5206\u6790\u3001UI \u8BC4\u5BA1\u3001\u539F\u578B\u8BC6\u522B\uFF08\u8981\u6C42\u7ED1\u5B9A\u6A21\u578B\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF09",
    persona: [
      "\u4F60\u662F vision\u2014\u2014\u56FE\u50CF\u7406\u89E3\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u7528 read_image \u8BFB\u53D6\u8C03\u7528\u65B9\u7ED9\u51FA\u7684\u56FE\u7247\u8DEF\u5F84\uFF08PNG/JPEG/WebP/GIF\uFF09\uFF0C\u505A\u56FE\u7247\u5206\u6790\u3001UI \u8BC4\u5BA1\u3001\u539F\u578B\u8BC6\u522B\u4E0E OCR\u3002",
      "\u94C1\u5F8B\uFF1A\u53EA\u63CF\u8FF0\u4F60**\u771F\u5B9E\u770B\u5230**\u7684\u5185\u5BB9\uFF0C\u9010\u9879\u7ED9\u51FA\u4F9D\u636E\uFF08\u533A\u57DF/\u5750\u6807/\u539F\u6587\u6587\u5B57\uFF09\uFF1B",
      "\u770B\u4E0D\u6E05\u3001\u88AB\u88C1\u526A\u3001\u5206\u8FA8\u7387\u4E0D\u8DB3\u65F6**\u76F4\u63A5\u8BF4\u770B\u4E0D\u6E05**\u5E76\u6307\u51FA\u7F3A\u4EC0\u4E48\uFF0C\u7EDD\u4E0D\u731C\u6D4B\u6216\u7F16\u9020\u5185\u5BB9\uFF08\u8FD9\u6761\u6700\u91CD\u8981\uFF09\uFF1B",
      "\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF1B\u4EA7\u51FA\u4EE5\u300C\u7ED3\u8BBA + \u8BC1\u636E\u300D\u4E24\u6BB5\u5F0F\u4EA4\u4ED8\u3002"
    ].join("\n")
  },
  fallback: {
    // 选它的两条理由（2026-09-30 定）：① **兜底角色的可用性优先**——`deepseek-official` 是 dsh
    // 唯一**保证注册**的 provider（连无凭据的空 DSH_HOME 都注册它），而被剪枝的 fallback 等于
    // 不存在，一条不可用的兜底路由没有意义（doctor 里的 ❌ 就是这种形态）。② **有评测数据**：
    // `docs/model-pairings.md` 结论 3 的备选 `deepseek-flash` 得 **9/10**，且与订阅限额故障域无关。
    provider: "deepseek-official",
    model: "deepseek-flash",
    fallbackModels: ["deepseek-official/deepseek-v4-pro"],
    summary: "\u672A\u5206\u7C7B\u8F7B\u91CF\u4EFB\u52A1\u515C\u5E95",
    persona: [
      "\u4F60\u662F fallback\u2014\u2014\u8F7B\u91CF\u4EFB\u52A1\u515C\u5E95\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u5904\u7406\u672A\u5206\u7C7B\u7684\u5C0F\u4EFB\u52A1\uFF08\u67E5\u4E00\u4E2A\u4E8B\u5B9E\u3001\u89E3\u91CA\u4E00\u6BB5\u4EE3\u7801\u3001\u505A\u4E00\u6B21\u5C0F\u641C\u7D22\uFF09\u3002",
      "\u94C1\u5F8B\uFF1A\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF1B\u4EFB\u52A1\u82E5\u5B9E\u9645\u9700\u8981\u6DF1\u5EA6\u5206\u6790\u6216\u7F16\u7801\uFF0C\u660E\u786E\u5EFA\u8BAE\u6539\u7528\u5BF9\u5E94\u89D2\u8272\uFF08analyst/coder \u7B49\uFF09\uFF0C\u4E0D\u786C\u625B\u3002"
    ].join("\n")
  }
};

// src/client/controller.js
var CONFIG_ENDPOINT = "/api/dsh-rolegroup/config";
var TEXT_FIELDS = ["provider", "model", "reasoningEffort", "persona", "summary"];
function normalizeRow(row) {
  const out = {
    toolName: row.toolName,
    provider: String(row.provider ?? "").trim(),
    model: String(row.model ?? "").trim()
  };
  for (const field of ["reasoningEffort", "persona", "summary"]) {
    const value = row[field];
    if (typeof value === "string" && value.trim() !== "") out[field] = value.trim();
  }
  if (Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0) {
    out.fallbackModels = [...row.fallbackModels];
  }
  return out;
}
function fillBuiltinRows(panelRows) {
  const remaining = new Map(panelRows.map((row) => [row.toolName, row]));
  const out = [];
  for (const [toolName, role] of Object.entries(DEFAULT_ROLES)) {
    const existing = remaining.get(toolName);
    if (existing !== void 0) {
      remaining.delete(toolName);
      const hasChain = Array.isArray(existing.fallbackModels) && existing.fallbackModels.length > 0;
      const builtinChain = Array.isArray(role.fallbackModels) ? role.fallbackModels : [];
      out.push(!hasChain && builtinChain.length > 0 ? { ...existing, fallbackModels: [...builtinChain] } : existing);
      continue;
    }
    out.push({
      toolName,
      provider: role.provider,
      model: role.model,
      ...Array.isArray(role.fallbackModels) && role.fallbackModels.length > 0 ? { fallbackModels: [...role.fallbackModels] } : {},
      persona: role.persona,
      summary: role.summary
    });
  }
  for (const extra of remaining.values()) out.push(extra);
  return out;
}
var serializeRows = (rows) => JSON.stringify(rows.map(normalizeRow));
function invalidFieldsOf(row, allowedEfforts) {
  const fields = [];
  if (!TOOL_NAME_RE.test(row.toolName ?? "")) fields.push("toolName");
  if (String(row.provider ?? "").trim() === "") fields.push("provider");
  if (String(row.model ?? "").trim() === "") fields.push("model");
  const effort = String(row.reasoningEffort ?? "").trim();
  if (effort !== "" && allowedEfforts !== void 0 && !allowedEfforts.includes(effort)) fields.push("reasoningEffort");
  return fields;
}
function createSnapshotStore(getProjection, onFirstSubscribe) {
  let snapshot = getProjection();
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => snapshot,
    publish() {
      snapshot = getProjection();
      for (const cb of [...listeners]) cb();
    },
    subscribe(cb) {
      const wasEmpty = listeners.size === 0;
      listeners.add(cb);
      if (wasEmpty) onFirstSubscribe();
      return () => listeners.delete(cb);
    },
    clear() {
      listeners.clear();
    }
  };
}
var RolegroupCardController = class {
  /** @param scope `ctx.configForms.get('dsh-rolegroup')`（面：getSnapshot/subscribe/mutate/unset）  @param ctx 浏览器插件 ctx（remote.session） */
  constructor(scope, ctx, options = {}) {
    this.scope = scope;
    this.ctx = ctx;
    this.options = options;
    this.drafts = void 0;
    this.draftRevision = void 0;
    this.saving = false;
    this.failed = false;
    this.conflicted = false;
    this.catalogGroups = [];
    this.catalogDefault = void 0;
    this.catalogPartial = false;
    this.catalogStatus = "idle";
    this.config = { status: "idle", error: void 0, notice: void 0 };
    this.effective = { status: "idle", roles: [], error: void 0 };
    this.lastTakeover = this.scope.getSnapshot().value?.enabled === true;
    this.saveGeneration = 0;
    this.catalogGeneration = 0;
    this.configGeneration = 0;
    this.effectiveGeneration = 0;
    this.disposed = false;
    this.store = createSnapshotStore(() => this.projection(), () => {
      if (this.catalogStatus === "idle") this.loadCatalog();
      if (!this.isTakeover() && this.effective.status === "idle") void this.loadEffective();
    });
    this.unsubscribeScope = scope.subscribe(() => this.onScopeChange());
  }
  /** 组件面：快照 store + 全部动作（§2.4 逐字签名）。 */
  inject() {
    return {
      hooks: { rolegroupCard: { getSnapshot: () => this.store.getSnapshot(), subscribe: (cb) => this.store.subscribe(cb) } },
      editRole: (toolName, field, text) => this.editRole(toolName, field, text),
      addRole: () => this.addRole(),
      removeRole: (toolName) => this.removeRole(toolName),
      save: () => {
        this.save();
      },
      discard: () => this.discard(),
      resetToBase: () => {
        this.resetToBase();
      },
      retryCatalog: () => this.retryCatalog(),
      fillUnavailableRoutes: () => this.fillUnavailableRoutes(),
      retryEffective: () => this.retryEffective(),
      openConfig: () => this.openConfig()
    };
  }
  /** 停止观察 scope 并压制迟到的写/目录/配置结算。 */
  dispose() {
    this.disposed = true;
    this.saveGeneration += 1;
    this.catalogGeneration += 1;
    this.configGeneration += 1;
    this.effectiveGeneration += 1;
    this.unsubscribeScope?.();
    this.store.clear();
  }
  // --- 读取面 ---
  /** host 侧 `enabled` 位：true = 本面板接管生效表。 */
  isTakeover() {
    return this.scope.getSnapshot().value?.enabled === true;
  }
  /**
   * 当前生效行（未被草稿覆盖时的基准）。
   * 面板已接管（或面板层已存了行）时用 settings 层的 roles；否则用 host 快照预填的
   * jsonc / 内置生效表。这样未接管时页面默认就有内容，而不是一张空表。
   */
  effectiveRows() {
    const snapshot = this.scope.getSnapshot();
    const panelRows = Array.isArray(snapshot.value?.roles) ? snapshot.value.roles : [];
    if (snapshot.value?.enabled === true) return fillBuiltinRows(panelRows);
    if (panelRows.length > 0) return panelRows;
    return this.effective.status === "ready" ? this.effective.roles : [];
  }
  draftRows() {
    return [...this.drafts?.values() ?? []];
  }
  isDirty() {
    return this.drafts !== void 0 && serializeRows(this.draftRows()) !== serializeRows(this.effectiveRows());
  }
  beginDraft() {
    if (this.drafts === void 0) {
      const snapshot = this.scope.getSnapshot();
      this.drafts = new Map(this.effectiveRows().map((row) => [row.toolName, { ...row }]));
      this.draftRevision = snapshot.revision;
    }
    return this.drafts;
  }
  clearDraft() {
    this.drafts = void 0;
    this.draftRevision = void 0;
    this.failed = false;
    this.conflicted = false;
  }
  editable() {
    const snapshot = this.scope.getSnapshot();
    if (this.disposed || this.saving || snapshot.status !== "ready" || snapshot.writable !== true) return false;
    const panelRows = Array.isArray(snapshot.value?.roles) ? snapshot.value.roles : [];
    const needsPrefill = !this.isTakeover() && panelRows.length === 0;
    if (needsPrefill && this.effective.status !== "ready" && this.effective.status !== "error") return false;
    return true;
  }
  publish() {
    this.store.publish();
  }
  onScopeChange() {
    if (this.disposed) return;
    if (!this.saving && this.drafts !== void 0 && this.scope.getSnapshot().revision !== this.draftRevision) {
      if (serializeRows(this.effectiveRows()) === serializeRows(this.draftRows())) this.clearDraft();
      else this.conflicted = true;
    }
    const takeover = this.isTakeover();
    if (takeover !== this.lastTakeover) {
      this.lastTakeover = takeover;
      if (!takeover && this.effective.status !== "loading") void this.loadEffective();
    }
    this.publish();
  }
  /**
   * 模型目录里该路由声明的推理档位 id 列表。
   * @returns {string[] | undefined} undefined = 目录未就绪 / 模型未知（不校验）；
   *   [] = 模型明确声明不支持推理档位。
   */
  effortsOf(provider, model) {
    if (this.catalogStatus !== "ready") return void 0;
    const group = this.catalogGroups.find((candidate) => candidate.id === provider);
    const entry = group?.models?.find((candidate) => candidate.id === model);
    if (entry === void 0) return void 0;
    const efforts = entry.reasoning?.efforts;
    return Array.isArray(efforts) ? efforts.map((effort) => effort.id) : [];
  }
  /** 目录就绪时，provider 不在已注册清单里的角色行（「按可用模型补齐」的作用对象）。 */
  routeGapsOf(rows) {
    if (this.catalogStatus !== "ready") return [];
    const registered = new Set(this.catalogGroups.map((group) => group.id));
    return rows.filter((row) => typeof row.provider === "string" && row.provider.trim() !== "" && !registered.has(row.provider)).map((row) => ({ toolName: row.toolName, provider: row.provider }));
  }
  /**
   * 一键补齐：把 provider 未注册的行改成当前可用路由。
   * 优先用部署默认路由（modelCatalog.default），否则取第一个可用 provider 的第一个模型。
   * 只改草稿，用户仍需点「保存」才生效。
   */
  fillUnavailableRoutes() {
    if (!this.editable() || this.catalogStatus !== "ready") return;
    const gaps = this.routeGapsOf(this.drafts !== void 0 ? this.draftRows() : this.effectiveRows());
    if (gaps.length === 0) return;
    const registered = new Set(this.catalogGroups.map((group) => group.id));
    let target = this.catalogDefault;
    if (target === void 0 || !registered.has(target.provider)) {
      const group = this.catalogGroups.find((candidate) => (candidate.models ?? []).length > 0);
      const model = group?.models?.[0];
      target = group === void 0 || model === void 0 ? void 0 : { provider: group.id, model: model.id };
    }
    if (target === void 0) return;
    const drafts = this.beginDraft();
    for (const gap of gaps) {
      const row = drafts.get(gap.toolName);
      if (row === void 0) continue;
      row.provider = target.provider;
      row.model = target.model;
      delete row.reasoningEffort;
    }
    this.failed = false;
    this.publish();
  }
  // --- 编辑动作 ---
  editRole(toolName, field, text) {
    if (!this.editable()) return;
    if (field === "toolName") return this.renameRole(toolName, text);
    if (!TEXT_FIELDS.includes(field)) return;
    const row = this.beginDraft().get(toolName);
    if (row === void 0) return;
    row[field] = text;
    if (field === "provider" || field === "model") {
      const efforts = this.effortsOf(row.provider, row.model);
      if (efforts !== void 0 && row.reasoningEffort !== void 0 && row.reasoningEffort !== "" && !efforts.includes(row.reasoningEffort)) {
        delete row.reasoningEffort;
      }
    }
    this.failed = false;
    this.publish();
  }
  renameRole(toolName, text) {
    const name = String(text ?? "").trim();
    if (name === toolName) return;
    if (!TOOL_NAME_RE.test(name)) return;
    const drafts = this.beginDraft();
    const row = drafts.get(toolName);
    if (row === void 0 || drafts.has(name)) return;
    drafts.delete(toolName);
    row.toolName = name;
    drafts.set(name, row);
    this.failed = false;
    this.publish();
  }
  addRole() {
    if (!this.editable()) return;
    const drafts = this.beginDraft();
    let index = 1;
    while (drafts.has(`role_${index}`)) index += 1;
    const toolName = `role_${index}`;
    drafts.set(toolName, { toolName, provider: "", model: "" });
    this.failed = false;
    this.publish();
  }
  removeRole(toolName) {
    if (!this.editable()) return;
    const exists = this.drafts !== void 0 ? this.drafts.has(toolName) : this.effectiveRows().some((row) => row.toolName === toolName);
    if (!exists) return;
    this.beginDraft().delete(toolName);
    this.failed = false;
    this.publish();
  }
  discard() {
    if (this.saving || this.disposed) return;
    this.clearDraft();
    this.publish();
  }
  // --- 写路径 ---
  async save() {
    const snapshot = this.scope.getSnapshot();
    if (this.disposed || this.saving || snapshot.status !== "ready" || snapshot.writable !== true) return;
    if (this.drafts === void 0 || !this.isDirty()) return;
    if (this.draftRows().some((row) => invalidFieldsOf(row, this.effortsOf(row.provider, row.model)).length > 0)) {
      this.failed = true;
      this.publish();
      return;
    }
    if (snapshot.revision !== this.draftRevision) {
      this.conflicted = true;
      this.publish();
      return;
    }
    const generation = this.saveGeneration;
    this.saving = true;
    this.failed = false;
    this.conflicted = false;
    this.publish();
    await this.scope.mutate([
      { op: "set", path: ["enabled"], value: true },
      { op: "set", path: ["roles"], value: this.draftRows().map(normalizeRow) }
    ], this.draftRevision);
    if (generation !== this.saveGeneration || this.disposed) return;
    const landed = serializeRows(this.effectiveRows()) === serializeRows(this.draftRows());
    this.saving = false;
    this.failed = !landed;
    if (landed) this.clearDraft();
    this.publish();
  }
  /** 重置为文件配置：清用户层的 enabled + roles → 真正退出接管，回落 jsonc 链。 */
  async resetToBase() {
    if (this.disposed || this.saving) return;
    if (this.scope.getSnapshot().writable !== true) return;
    this.clearDraft();
    this.publish();
    await this.scope.mutate([
      { op: "unset", path: ["enabled"] },
      { op: "unset", path: ["roles"] }
    ]);
    if (this.disposed) return;
    if (!this.isTakeover() && this.effective.status !== "loading") void this.loadEffective();
    this.publish();
  }
  // --- 配置文件按钮 ---
  /**
   * 拉取当前配置快照，取 host 给出的配置文件绝对路径，交给右侧栏文档预览打开。
   * 成功返回 true（卡片随后关闭设置弹窗以露出右侧栏）；无文件/右侧栏不可用/接口失败返回 false，
   * 并把可显示的 notice/error 留在投影里。渲染全部在设置页内联，不弹窗。
   */
  async openConfig() {
    if (this.disposed || this.config.status === "loading") return false;
    const generation = ++this.configGeneration;
    this.config.status = "loading";
    this.config.error = void 0;
    this.config.notice = void 0;
    this.publish();
    try {
      const payload = await this.fetchConfigInfo();
      if (generation !== this.configGeneration || this.disposed) return false;
      if (payload?.ok !== true) throw new Error(payload?.error?.message ?? "config info unavailable");
      const path = payload?.file?.path;
      if (typeof path !== "string" || path === "") {
        this.config.status = "idle";
        this.config.notice = "noFile";
        this.publish();
        return false;
      }
      const opened = this.options?.openConfigFile?.(path) === true;
      if (!opened) throw new Error("sidebar unavailable");
      this.config.status = "idle";
      this.publish();
      return true;
    } catch (error) {
      if (generation !== this.configGeneration || this.disposed) return false;
      this.config.status = "error";
      this.config.error = String(error?.message ?? error);
      this.publish();
      return false;
    }
  }
  /**
   * 同源 fetch；测试可经 options.fetch 注入。
   * 注意：绝不能读 `ctx.fetch`——cordis 对未 inject 的服务属性会抛
   * “cannot get property \"fetch\" without inject”（真机实测）。fetch 不是 cordis 服务。
   */
  async fetchConfigInfo() {
    const fetchImpl = this.options?.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
    const response = await fetchImpl(CONFIG_ENDPOINT, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "?"}`);
    return await response.json();
  }
  // --- 当前生效表预填 ---
  /** 拉取 host 快照里的当前生效表（未接管时预填编辑表）；迟到响应按 generation 丢弃。 */
  async loadEffective() {
    if (this.disposed || this.effective.status === "loading") return;
    const generation = ++this.effectiveGeneration;
    this.effective.status = "loading";
    this.effective.error = void 0;
    this.publish();
    try {
      const payload = await this.fetchConfigInfo();
      if (generation !== this.effectiveGeneration || this.disposed) return;
      if (payload?.ok !== true) throw new Error(payload?.error?.message ?? "config info unavailable");
      const roles = payload?.effective?.roles;
      this.effective.roles = Array.isArray(roles) ? roles : [];
      this.effective.status = "ready";
    } catch (error) {
      if (generation !== this.effectiveGeneration || this.disposed) return;
      this.effective.status = "error";
      this.effective.error = String(error?.message ?? error);
    }
    this.publish();
  }
  retryEffective() {
    if (this.disposed || this.effective.status === "loading") return;
    void this.loadEffective();
  }
  // --- catalog ---
  retryCatalog() {
    if (this.disposed || this.catalogStatus === "loading") return;
    this.loadCatalog();
  }
  async loadCatalog() {
    if (this.disposed || this.catalogStatus === "loading") return;
    const generation = this.catalogGeneration;
    this.catalogStatus = "loading";
    this.catalogPartial = false;
    this.publish();
    try {
      const response = await this.ctx.remote.session.modelCatalog();
      if (generation !== this.catalogGeneration || this.disposed) return;
      if (response && response.ok) {
        this.catalogGroups = response.value?.groups ?? [];
        this.catalogDefault = response.value?.default;
        this.catalogPartial = (response.value?.failures ?? []).length > 0;
        this.catalogStatus = "ready";
      } else {
        this.catalogStatus = "error";
      }
    } catch {
      if (generation !== this.catalogGeneration || this.disposed) return;
      this.catalogStatus = "error";
    }
    this.publish();
  }
  /**
   * 目录合并（对齐 C8 subagentModelCandidates）：目录内路由标 available:true；
   * 已存/草稿路由不在目录 → 保留为 available:false 的选项（不静默丢配置）。
   */
  mergedGroups(rows) {
    if (this.catalogStatus !== "ready") return [];
    const seen = /* @__PURE__ */ new Set();
    const keyOf = (provider, model) => `${provider}\0${model}`;
    const groups = this.catalogGroups.map((group) => ({
      ...group,
      models: (group.models ?? []).map((model) => {
        seen.add(keyOf(group.id, model.id));
        return { ...model, available: true };
      })
    }));
    const byProvider = new Map(groups.map((group) => [group.id, group]));
    for (const row of rows) {
      const provider = String(row.provider ?? "").trim();
      const model = String(row.model ?? "").trim();
      if (provider === "" || model === "" || seen.has(keyOf(provider, model))) continue;
      seen.add(keyOf(provider, model));
      let group = byProvider.get(provider);
      if (group === void 0) {
        group = { id: provider, name: provider, models: [] };
        byProvider.set(provider, group);
        groups.push(group);
      }
      group.models.push({ id: model, name: model, available: false });
    }
    return groups;
  }
  projection() {
    const snapshot = this.scope.getSnapshot();
    const takeover = snapshot.value?.enabled === true;
    const source = this.drafts !== void 0 ? this.draftRows() : this.effectiveRows();
    const rows = source.map((row) => ({
      toolName: row.toolName,
      provider: row.provider ?? "",
      model: row.model ?? "",
      reasoningEffort: row.reasoningEffort ?? "",
      persona: row.persona ?? "",
      summary: row.summary ?? "",
      // 备用链随行暴露（面板不编辑它，但保存必须原样带回，见 normalizeRow）
      ...Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0 ? { fallbackModels: [...row.fallbackModels] } : {},
      isCustom: !Object.hasOwn(DEFAULT_ROLES, row.toolName),
      invalidFields: invalidFieldsOf(row, this.effortsOf(row.provider, row.model))
    }));
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable === true,
      /** 面板是否已接管生效表（host 侧 Config.enabled）。未接管时 rows 来自 host 快照预填，
       *  不是空表；saving 后由本面板接管。 */
      takeover,
      dirty: this.isDirty(),
      saving: this.saving,
      failed: this.failed,
      conflicted: this.conflicted,
      rows,
      catalog: { status: this.catalogStatus, groups: this.mergedGroups(rows), partial: this.catalogPartial },
      /** provider 未注册的行（catalog 就绪才计算）。 */
      routeGaps: this.routeGapsOf(this.drafts !== void 0 ? this.draftRows() : rows),
      /** 预填状态：未接管时由 host 快照提供 jsonc / 内置生效表。 */
      effective: {
        /** 未接管且面板层还没有行：编辑必须先等 host 生效表预填到达（否则草稿基准是空表）。 */
        required: !takeover && (snapshot.value?.roles ?? []).length === 0,
        status: takeover ? "ready" : this.effective.status,
        error: takeover ? void 0 : this.effective.error,
        prefilled: !takeover && this.effective.status === "ready"
      },
      /** 「配置文件」按钮的瞬时状态：loading / error / noFile notice。 */
      config: { ...this.config },
      basePresent: Array.isArray(snapshot.base?.roles)
    };
  }
};

// src/client/config-file.js
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}
function configFileAddress(sessionId, path) {
  const normalized = String(path).replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(String(sessionId))}/${normalized.split("/").map(encodeSegment).join("/")}`;
}
function openConfigFileInSidebar(sidebarRight, path) {
  if (sidebarRight === void 0 || sidebarRight === null || typeof sidebarRight.openResource !== "function") return false;
  const sessionId = sidebarRight.mounted?.getSnapshot?.();
  if (sessionId === void 0 || sessionId === null || sessionId === "") return false;
  try {
    sidebarRight.openResource(configFileAddress(sessionId, path));
    return true;
  } catch {
    return false;
  }
}

// src/client/settings-nav-icon.js
var NAV_GLYPH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.7 13.4 4.8v6.4L8 14.3 2.6 11.2V4.8Z" fill="none" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.35" fill="#000"/><path d="M8 6.4V4.7M6.7 8.7 5.3 9.5M9.3 8.7 10.7 9.5" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>';
var NAV_GLYPH_URI = `data:image/svg+xml,${encodeURIComponent(NAV_GLYPH)}`;
var NAV_ICON_CSS = `@supports ((mask-image: linear-gradient(#000, #000)) or (-webkit-mask-image: linear-gradient(#000, #000))) {
button[data-dsh-rg-nav] > svg { display: none !important; }
button[data-dsh-rg-nav]::before { content: ""; width: 16px; height: 16px; flex: none; display: inline-block; background-color: currentColor; -webkit-mask: url("${NAV_GLYPH_URI}") center / 16px 16px no-repeat; mask: url("${NAV_GLYPH_URI}") center / 16px 16px no-repeat; }
}`;
function markSettingsNavButton(buttons, label) {
  const wanted = String(label ?? "").trim();
  if (wanted === "") return void 0;
  for (const button of buttons ?? []) {
    if (button?.dataset?.dshRgNav !== void 0) return button;
    if (String(button?.textContent ?? "").trim() !== wanted) continue;
    if (String(button?.firstElementChild?.tagName ?? "").toLowerCase() !== "svg") continue;
    if (button.dataset !== void 0) button.dataset.dshRgNav = "";
    else button.setAttribute?.("data-dsh-rg-nav", "");
    return button;
  }
  return void 0;
}
function installSettingsNavIcon(labelOf, options = {}) {
  const doc = options.document ?? (typeof document === "undefined" ? void 0 : document);
  if (doc === void 0 || doc === null || doc.body === void 0 || doc.body === null) return () => {
  };
  const root = doc.head ?? doc.documentElement;
  if (typeof root?.append !== "function") return () => {
  };
  const style = doc.createElement("style");
  style.setAttribute("data-dsh-rg-nav-style", "");
  style.textContent = NAV_ICON_CSS;
  try {
    root.append(style);
  } catch {
    return () => {
    };
  }
  const Observer = options.MutationObserver ?? globalThis.MutationObserver;
  const raf = options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  let scheduled = false;
  let disposed = false;
  const apply2 = () => {
    scheduled = false;
    if (disposed) return;
    try {
      markSettingsNavButton(doc.querySelectorAll?.("button") ?? [], labelOf?.());
    } catch {
    }
  };
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    if (typeof raf === "function") raf(apply2);
    else Promise.resolve().then(apply2);
  };
  let observer;
  if (typeof Observer === "function") {
    try {
      observer = new Observer(schedule);
      observer.observe(doc.body, { childList: true, subtree: true });
    } catch {
      observer = void 0;
    }
  }
  apply2();
  return () => {
    disposed = true;
    observer?.disconnect?.();
    style.remove?.();
    for (const button of doc.querySelectorAll?.("[data-dsh-rg-nav]") ?? []) button.removeAttribute?.("data-dsh-rg-nav");
  };
}

// src/client/locales.js
var zh = {
  title: "\u89D2\u8272\u914D\u7F6E",
  description: "\u53EF\u89C6\u5316\u7F16\u8F91\u89D2\u8272 \u2194 \u6A21\u578B\u8DEF\u7531\u3002",
  dirtyBadge: "\u672A\u4FDD\u5B58",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03",
  resetToBase: "\u91CD\u7F6E\u4E3A\u6587\u4EF6\u914D\u7F6E",
  addRole: "\u65B0\u589E\u89D2\u8272",
  removeRole: "\u5220\u9664",
  retryCatalog: "\u91CD\u8BD5",
  routeGapNotice: "\u4E2A\u89D2\u8272\u7684 provider \u5728\u672C\u673A\u672A\u6CE8\u518C\uFF0C\u4FDD\u5B58\u540E\u4E0D\u4F1A\u751F\u6548",
  fillRoutes: "\u6309\u5F53\u524D\u53EF\u7528\u6A21\u578B\u8865\u9F50",
  fieldToolName: "\u5DE5\u5177\u540D",
  fieldProvider: "\u63D0\u4F9B\u65B9",
  fieldModel: "\u6A21\u578B",
  fieldReasoningEffort: "\u63A8\u7406\u6863\u4F4D",
  reasoningEffortDefault: "\u9ED8\u8BA4",
  reasoningEffortUnsupported: "\u8BE5\u6A21\u578B\u4E0D\u652F\u6301",
  fieldPersona: "\u4EBA\u683C\u8BBE\u5B9A",
  fieldSummary: "\u804C\u8D23\u6458\u8981",
  github: "GitHub",
  githubAria: "\u5728 GitHub \u4E0A\u6253\u5F00 dsh-rolegroup \u4ED3\u5E93",
  configFile: "\u914D\u7F6E\u6587\u4EF6",
  configFileAria: "\u5728\u53F3\u4FA7\u680F\u6253\u5F00\u5F53\u524D\u914D\u7F6E\u6587\u4EF6",
  configOpening: "\u6B63\u5728\u6253\u5F00\u914D\u7F6E\u6587\u4EF6\u2026",
  configOpenFailed: "\u65E0\u6CD5\u6253\u5F00\u914D\u7F6E\u6587\u4EF6",
  configRestartHint: "\u82E5\u521A\u66F4\u65B0\u63D2\u4EF6\uFF0C\u8BF7\u91CD\u542F dsh web \u540E\u91CD\u8BD5\u3002",
  configFileMissing: "\u672A\u627E\u5230 rolegroup.jsonc\u3002",
  liveHint: "\u4FDD\u5B58\u540E\u65B0\u4F1A\u8BDD\u751F\u6548\uFF0C\u8FDB\u884C\u4E2D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD",
  conflicted: "\u914D\u7F6E\u5DF2\u5728\u522B\u5904\u4FEE\u6539\uFF1B\u8349\u7A3F\u4FDD\u7559\uFF0C\u8BF7\u653E\u5F03\u6216\u91CD\u7F6E\u540E\u91CD\u8BD5",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF1A\u8BF7\u68C0\u67E5\u6807\u7EA2\u5B57\u6BB5\u540E\u91CD\u8BD5",
  catalogLoading: "\u6B63\u5728\u62C9\u53D6\u6A21\u578B\u76EE\u5F55\u2026",
  catalogError: "\u6A21\u578B\u76EE\u5F55\u62C9\u53D6\u5931\u8D25",
  catalogPartial: "\u90E8\u5206\u63D0\u4F9B\u65B9\u4E0D\u53EF\u7528\uFF0C\u5019\u9009\u53EF\u80FD\u4E0D\u5B8C\u6574",
  routeUnavailable: "\u4E0D\u53EF\u7528",
  selectProvider: "\u9009\u62E9\u63D0\u4F9B\u65B9",
  selectModel: "\u9009\u62E9\u6A21\u578B",
  scopeUnavailable: "\u9762\u677F\u6682\u4E0D\u53EF\u7528\uFF1A\u8BBE\u7F6E\u670D\u52A1\u672A\u5C31\u7EEA\u6216\u4E0D\u53EF\u5199",
  // 页面只保留一行状态；层级语义收进 <details> 折叠块（2026-10-21 用户：说明文字太长，直接用户不会看）。
  statusNotTakeover: "\u5F53\u524D\u751F\u6548\uFF1Arolegroup.jsonc / \u5185\u7F6E\u8868\uFF08\u672A\u63A5\u7BA1\uFF09",
  statusTakeover: "\u5F53\u524D\u751F\u6548\uFF1A\u672C\u9762\u677F\uFF08\u5185\u7F6E\u8868\u8865\u5E95\uFF09",
  emptyNotTakeover: "\u6CA1\u6709\u53EF\u7F16\u8F91\u7684\u89D2\u8272\uFF1B\u70B9\u300C\u65B0\u589E\u89D2\u8272\u300D\u624B\u52A8\u6DFB\u52A0\u3002",
  emptyTakeover: "\u6CA1\u6709\u8986\u76D6\u9879\uFF1A\u5168\u90E8\u89D2\u8272\u4F7F\u7528\u5185\u7F6E\u8868\u3002",
  effectiveLoading: "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u751F\u6548\u914D\u7F6E\u2026",
  effectiveError: "\u8BFB\u53D6\u5F53\u524D\u751F\u6548\u914D\u7F6E\u5931\u8D25",
  effectiveErrorHint: "\u53EF\u70B9\u300C\u91CD\u8BD5\u300D\u91CD\u65B0\u8BFB\u53D6\uFF1B\u8BFB\u53D6\u6210\u529F\u524D\u8BF7\u52FF\u4FDD\u5B58\uFF0C\u907F\u514D\u8986\u76D6\u6587\u4EF6\u914D\u7F6E\u3002",
  retryEffective: "\u91CD\u8BD5",
  prefillHint: "\u4EE5\u4E0B\u5DF2\u586B\u5165\u5F53\u524D\u751F\u6548\u914D\u7F6E\uFF1B\u4FEE\u6539\u540E\u4FDD\u5B58\uFF0C\u7531\u672C\u9762\u677F\u63A5\u7BA1\u3002",
  layerSummary: "\u914D\u7F6E\u5C42\u7EA7\u8BF4\u660E",
  // 这里是 UI 文案（React 按**纯文本**渲染，不解析 markdown）——强调只能用「」，
  // 写 **xxx** 会被原样显示成星号（2026-10-20 真机截图发现）。默认折叠，不占版面。
  layerNote: "\u4F18\u5148\u7EA7\uFF1A\u672C\u9762\u677F > \u9879\u76EE rolegroup.jsonc > \u7528\u6237 rolegroup.jsonc > \u5185\u7F6E\u8868\u3002\u4FDD\u5B58\u4F1A\u628A\u5F53\u524D\u751F\u6548\u8868\u6574\u5C42\u5199\u5165\u9762\u677F\u5E76\u63A5\u7BA1\uFF1B\u300C\u91CD\u7F6E\u4E3A\u6587\u4EF6\u914D\u7F6E\u300D\u53EF\u9000\u51FA\u63A5\u7BA1\u3002\u5B8C\u6574\u751F\u6548\u8868\u89C1 /rolegroup doctor\u3002"
};
var en = {
  title: "Role Routing",
  description: "Edit role \u2194 model routes visually.",
  dirtyBadge: "Unsaved",
  save: "Save",
  discard: "Discard",
  resetToBase: "Reset to file config",
  addRole: "Add role",
  removeRole: "Remove",
  retryCatalog: "Retry",
  routeGapNotice: "roles use a provider that is not registered on this machine and will not take effect after saving",
  fillRoutes: "Fill with available models",
  fieldToolName: "Tool name",
  fieldProvider: "Provider",
  fieldModel: "Model",
  fieldReasoningEffort: "Reasoning effort",
  reasoningEffortDefault: "Default",
  reasoningEffortUnsupported: "Not supported by this model",
  fieldPersona: "Persona",
  fieldSummary: "Summary",
  github: "GitHub",
  githubAria: "Open the dsh-rolegroup repository on GitHub",
  configFile: "Config file",
  configFileAria: "Open the current config file in the right sidebar",
  configOpening: "Opening the config file\u2026",
  configOpenFailed: "Could not open the config file",
  configRestartHint: "If you just updated the plugin, restart dsh web and retry.",
  configFileMissing: "No rolegroup.jsonc found.",
  liveHint: "Saved routes apply to new sessions; in-flight sessions are unaffected",
  conflicted: "Settings changed elsewhere; your draft is kept \u2014 discard or reset, then retry",
  saveFailed: "Save failed: fix the flagged fields and retry",
  catalogLoading: "Loading model catalog\u2026",
  catalogError: "Failed to load the model catalog",
  catalogPartial: "Some providers failed; candidates may be incomplete",
  routeUnavailable: "unavailable",
  selectProvider: "Select provider",
  selectModel: "Select model",
  scopeUnavailable: "Panel unavailable: the settings service is not ready or not writable",
  // One status line stays visible; the layer semantics live in a collapsed <details> block.
  statusNotTakeover: "Active: rolegroup.jsonc / built-in table (not taken over)",
  statusTakeover: "Active: this panel (built-in table fills gaps)",
  emptyNotTakeover: "No editable roles; add one manually.",
  emptyTakeover: "No overrides: every role uses the built-in table.",
  effectiveLoading: "Loading the active configuration\u2026",
  effectiveError: "Failed to load the active configuration",
  effectiveErrorHint: "Retry to load it; avoid saving before it loads, or the file configuration would be overwritten.",
  retryEffective: "Retry",
  prefillHint: "The active configuration is pre-filled below; saving your changes makes this panel take over.",
  layerSummary: "How the layers work",
  layerNote: "Precedence: this panel > project rolegroup.jsonc > user rolegroup.jsonc > built-in table. Saving writes the active table into this panel and takes over the whole layer; Reset to file config exits takeover. See /rolegroup doctor for the effective table."
};

// src/client/index.js
var ROLEGROUP_CLIENT_NS = "dsh-rolegroup";
var inject = ["slots", "locale", "remote", "remote.session", "configForms"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("rolegroup", { zh, en }), "dsh-rolegroup: dictionaries");
  const t = ctx.locale.bind("rolegroup");
  ctx.effect(() => installSettingsNavIcon(() => t("title")), "dsh-rolegroup: settings nav icon");
  let sidebarRight;
  try {
    ctx.inject?.(["sidebarRight"], (injectedCtx) => {
      sidebarRight = injectedCtx.sidebarRight;
    });
  } catch (error) {
    console.warn("[dsh-rolegroup] sidebarRight \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u300C\u914D\u7F6E\u6587\u4EF6\u300D\u6309\u94AE\u5C06\u65E0\u6CD5\u6253\u5F00\u53F3\u4FA7\u680F", error);
  }
  const controller = new RolegroupCardController(ctx.configForms.get(ROLEGROUP_CLIENT_NS), ctx, {
    openConfigFile: (path) => openConfigFileInSidebar(sidebarRight, path)
  });
  ctx.effect(() => ctx.configForms.whileServed([ROLEGROUP_CLIENT_NS], () => ctx.slots.inject("settings.section", async () => {
    try {
      const { RolegroupCard: RolegroupCard2 } = await Promise.resolve().then(() => (init_card(), card_exports));
      return ctx.slots.register({
        name: "settings.section",
        id: "rolegroup",
        order: 30,
        // 紧随 agent-presets(20)，排在第三方功能区(110+)之前
        label: () => t("title"),
        // ← 设置页导航条目名；缺了它这一节没有名字
        locale: "rolegroup",
        inject: () => controller.inject()
      }, RolegroupCard2);
    } catch (err) {
      console.warn("[dsh-rolegroup] card \u52A0\u8F7D\u5931\u8D25", err);
    }
  })), "dsh-rolegroup: settings.section");
}
		return module.exports;
	}
});
