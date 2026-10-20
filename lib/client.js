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

// src/client/card.jsx
var card_exports = {};
__export(card_exports, {
  RolegroupCard: () => RolegroupCard
});
function RolegroupCard(props) {
  const { t } = props;
  const state = props.useRolegroupCard((snapshot) => snapshot);
  if (props.view === "summary") return t("description");
  const disabled = !state.writable || state.saving;
  const head = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-titles", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "dsh-rg-title", children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-desc", children: t("description") })
    ] }),
    state.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-rg-dirty", children: t("dirtyBadge") }) : null
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
  const renderRow = (row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-row", children: [
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsh-rg-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("fieldReasoningEffort") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            value: row.reasoningEffort,
            disabled,
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-card", children: [
    head,
    state.catalog.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("catalogLoading") }) : null,
    state.catalog.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-rg-catalogError", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("catalogError") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: state.saving, onClick: props.retryCatalog, children: t("retryCatalog") })
    ] }) : null,
    state.catalog.partial ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", children: t("catalogPartial") }) : null,
    state.takeover ? (
      // Taken over: state the LAYER semantics explicitly — the effective table is this override
      // table with the BUILT-IN table filling the gaps; rolegroup.jsonc yields entirely. Saying
      // only "the file table is overridden" makes users think unlisted roles still keep jsonc.
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("takeoverNote") })
    ) : (
      // Not taken over yet: the table below is an EMPTY OVERRIDE table, not "no roles".
      // The effective table comes from rolegroup.jsonc / the built-in table, and any role
      // not listed here keeps using them.
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-notice", role: "status", children: t("notTakeover") })
    ),
    state.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-alert", role: "alert", children: t("saveFailed") }) : null,
    state.conflicted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-rg-alert", role: "status", children: t("conflicted") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-rg-rows", children: state.rows.map(renderRow) }),
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
    import_jsx_runtime = require("react/jsx-runtime");
    CSS = ".dsh-rg-card{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:12px;display:grid;gap:10px}.dsh-rg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.dsh-rg-titles{display:grid;gap:4px;min-width:0}.dsh-rg-title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}.dsh-rg-desc{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-dirty{font-size:11px;color:var(--dsw-alias-label-warning);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:2px 6px;white-space:nowrap}.dsh-rg-notice{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dsh-rg-alert{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}.dsh-rg-catalogError{color:var(--dsw-alias-label-error);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px}.dsh-rg-catalogError button{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:0;padding:0;font-size:12px}.dsh-rg-rows{display:grid;gap:6px;max-height:320px;overflow:auto}.dsh-rg-row{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:10px;display:grid;gap:8px}.dsh-rg-rowHead{display:flex;align-items:center;gap:12px;min-width:0}.dsh-rg-toolName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}input.dsh-rg-toolName{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:3px 8px}.dsh-rg-remove{color:var(--dsw-alias-label-error);cursor:pointer;background:none;border:0;padding:0;font-size:12px;white-space:nowrap}.dsh-rg-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.dsh-rg-field{display:grid;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:0}.dsh-rg-field input,.dsh-rg-field select,.dsh-rg-field textarea{font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-width:0}.dsh-rg-field textarea{min-height:64px;resize:vertical}.dsh-rg-invalid input,.dsh-rg-invalid select,input.dsh-rg-invalid{border-color:var(--dsw-alias-label-error)}.dsh-rg-persona summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsh-rg-persona textarea{margin-top:6px;width:100%;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;min-height:64px;resize:vertical}.dsh-rg-add{justify-self:start;color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 10px;font-size:12px}.dsh-rg-actions{display:flex;gap:8px}.dsh-rg-actions button{cursor:pointer;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:4px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.dsh-rg-actions button.dsh-rg-save{background:var(--dsw-alias-brand-primary);color:#fff}.dsh-rg-actions button:disabled,.dsh-rg-add:disabled,.dsh-rg-remove:disabled,.dsh-rg-catalogError button:disabled{opacity:.5;cursor:default}.dsh-rg-liveHint{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}";
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
    summary: "\u6587\u6863\u56DE\u586B\u3001\u62A5\u544A\u3001spec \u7EF4\u62A4",
    persona: [
      "\u4F60\u662F scribe\u2014\u2014\u6587\u6863\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u6587\u6863\u56DE\u586B\u3001\u62A5\u544A\u64B0\u5199\u3001spec \u7EF4\u62A4\uFF0C\u8BED\u8A00\u4E0E\u65E2\u6709\u6587\u6863\u98CE\u683C\u4E00\u81F4\u3002",
      "\u7EA6\u5B9A\uFF1A\u5199\u5165\u8303\u56F4\u4EC5\u9650\u6587\u6863\u7C7B\u6587\u4EF6\uFF08docs/\u3001plans/\u3001README\u3001openspec/\uFF0C\u8F6F\u7EA6\u5B9A\uFF09\uFF1B\u4E0D\u6539\u52A8\u4EE3\u7801\u903B\u8F91\uFF1B",
      "\u4E8B\u5B9E\u6027\u5185\u5BB9\u5FC5\u987B\u6709\u51FA\u5904\uFF0C\u4E0D\u7F16\u9020\u547D\u4EE4\u8F93\u51FA\u3002"
    ].join("\n")
  },
  fallback: {
    // 选它的两条理由（2026-09-30 定）：① **兜底角色的可用性优先**——`deepseek-official` 是 dsh
    // 唯一**保证注册**的 provider（连无凭据的空 DSH_HOME 都注册它），而被剪枝的 fallback 等于
    // 不存在，一条不可用的兜底路由没有意义（doctor 里的 ❌ 就是这种形态）。② **有评测数据**：
    // `docs/model-pairings.md` 结论 3 的备选 `deepseek-flash` 得 **9/10**，且与订阅限额故障域无关。
    provider: "deepseek-official",
    model: "deepseek-flash",
    summary: "\u672A\u5206\u7C7B\u8F7B\u91CF\u4EFB\u52A1\u515C\u5E95",
    persona: [
      "\u4F60\u662F fallback\u2014\u2014\u8F7B\u91CF\u4EFB\u52A1\u515C\u5E95\u89D2\u8272\u3002",
      "\u804C\u8D23\uFF1A\u5904\u7406\u672A\u5206\u7C7B\u7684\u5C0F\u4EFB\u52A1\uFF08\u67E5\u4E00\u4E2A\u4E8B\u5B9E\u3001\u89E3\u91CA\u4E00\u6BB5\u4EE3\u7801\u3001\u505A\u4E00\u6B21\u5C0F\u641C\u7D22\uFF09\u3002",
      "\u94C1\u5F8B\uFF1A\u4F60\u53EA\u8BFB\u4E0D\u5199\uFF1B\u4EFB\u52A1\u82E5\u5B9E\u9645\u9700\u8981\u6DF1\u5EA6\u5206\u6790\u6216\u7F16\u7801\uFF0C\u660E\u786E\u5EFA\u8BAE\u6539\u7528\u5BF9\u5E94\u89D2\u8272\uFF08analyst/coder \u7B49\uFF09\uFF0C\u4E0D\u786C\u625B\u3002"
    ].join("\n")
  }
};

// src/client/controller.js
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
  return out;
}
var serializeRows = (rows) => JSON.stringify(rows.map(normalizeRow));
function invalidFieldsOf(row) {
  const fields = [];
  if (!TOOL_NAME_RE.test(row.toolName ?? "")) fields.push("toolName");
  if (String(row.provider ?? "").trim() === "") fields.push("provider");
  if (String(row.model ?? "").trim() === "") fields.push("model");
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
  constructor(scope, ctx) {
    this.scope = scope;
    this.ctx = ctx;
    this.drafts = void 0;
    this.draftRevision = void 0;
    this.saving = false;
    this.failed = false;
    this.conflicted = false;
    this.catalogGroups = [];
    this.catalogPartial = false;
    this.catalogStatus = "idle";
    this.saveGeneration = 0;
    this.catalogGeneration = 0;
    this.disposed = false;
    this.store = createSnapshotStore(() => this.projection(), () => {
      if (this.catalogStatus === "idle") this.loadCatalog();
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
      retryCatalog: () => this.retryCatalog()
    };
  }
  /** 停止观察 scope 并压制迟到的写/目录结算。 */
  dispose() {
    this.disposed = true;
    this.saveGeneration += 1;
    this.catalogGeneration += 1;
    this.unsubscribeScope?.();
    this.store.clear();
  }
  // --- 读取面 ---
  effectiveRows() {
    return this.scope.getSnapshot().value?.roles ?? [];
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
    return !this.disposed && !this.saving && snapshot.status === "ready" && snapshot.writable === true;
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
    if (this.draftRows().some((row) => invalidFieldsOf(row).length > 0)) {
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
    this.publish();
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
    const baseNames = new Set((snapshot.base?.roles ?? []).map((row) => row.toolName));
    const source = this.drafts !== void 0 ? this.draftRows() : this.effectiveRows();
    const rows = source.map((row) => ({
      toolName: row.toolName,
      provider: row.provider ?? "",
      model: row.model ?? "",
      reasoningEffort: row.reasoningEffort ?? "",
      persona: row.persona ?? "",
      summary: row.summary ?? "",
      isCustom: !baseNames.has(row.toolName),
      invalidFields: invalidFieldsOf(row)
    }));
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable === true,
      /** 面板是否已接管生效表（host 侧 Config.enabled）。未接管时下面这行表是**空的覆盖表**，
       *  生效表来自 rolegroup.jsonc / 内置表——卡片须据此给出说明，否则用户会以为"角色没了"。 */
      takeover: snapshot.value?.enabled === true,
      dirty: this.isDirty(),
      saving: this.saving,
      failed: this.failed,
      conflicted: this.conflicted,
      rows,
      catalog: { status: this.catalogStatus, groups: this.mergedGroups(rows), partial: this.catalogPartial },
      basePresent: Array.isArray(snapshot.base?.roles)
    };
  }
};

// src/client/locales.js
var zh = {
  title: "\u89D2\u8272\u914D\u7F6E",
  description: "\u53EF\u89C6\u5316\u7F16\u8F91\u89D2\u8272 \u2194 \u6A21\u578B\u8DEF\u7531\u3002\u751F\u6548\u4F18\u5148\u7EA7\uFF1A\u672C\u9762\u677F > \u9879\u76EE rolegroup.jsonc > \u7528\u6237 rolegroup.jsonc > \u5185\u7F6E\u8868\u3002",
  dirtyBadge: "\u672A\u4FDD\u5B58",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03",
  resetToBase: "\u91CD\u7F6E\u4E3A\u6587\u4EF6\u914D\u7F6E",
  addRole: "\u65B0\u589E\u89D2\u8272",
  removeRole: "\u5220\u9664",
  retryCatalog: "\u91CD\u8BD5",
  fieldToolName: "\u5DE5\u5177\u540D",
  fieldProvider: "\u63D0\u4F9B\u65B9",
  fieldModel: "\u6A21\u578B",
  fieldReasoningEffort: "\u63A8\u7406\u6863\u4F4D",
  fieldPersona: "\u4EBA\u683C\u8BBE\u5B9A",
  fieldSummary: "\u804C\u8D23\u6458\u8981",
  liveHint: "\u4FDD\u5B58\u540E\u65B0\u4F1A\u8BDD\u751F\u6548\uFF0C\u8FDB\u884C\u4E2D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD",
  conflicted: "\u914D\u7F6E\u5DF2\u5728\u522B\u5904\u88AB\u4FEE\u6539\uFF0C\u8349\u7A3F\u4FDD\u7559\u4E2D\uFF1B\u8BF7\u653E\u5F03\u6216\u91CD\u7F6E\u540E\u91CD\u8BD5",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF08\u672C\u5730\u6821\u9A8C\u672A\u901A\u8FC7\u6216\u5BBF\u4E3B\u62D2\u7EDD\uFF09\uFF0C\u8BF7\u68C0\u67E5\u6807\u7EA2\u5B57\u6BB5\u540E\u91CD\u8BD5",
  catalogLoading: "\u6B63\u5728\u62C9\u53D6\u6A21\u578B\u76EE\u5F55\u2026",
  catalogError: "\u6A21\u578B\u76EE\u5F55\u62C9\u53D6\u5931\u8D25",
  catalogPartial: "\u90E8\u5206\u63D0\u4F9B\u65B9\u76EE\u5F55\u62C9\u53D6\u5931\u8D25\uFF0C\u5019\u9009\u53EF\u80FD\u4E0D\u5B8C\u6574",
  routeUnavailable: "\u5F53\u524D\u8DEF\u7531\u4E0D\u5728\u6A21\u578B\u76EE\u5F55\u4E2D\uFF08\u4FDD\u7559\u4EE5\u9632\u4E22\u914D\u7F6E\uFF09",
  selectProvider: "\u9009\u62E9\u63D0\u4F9B\u65B9",
  selectModel: "\u9009\u62E9\u6A21\u578B",
  scopeUnavailable: "rolegroup \u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u518C\u6216\u4E0D\u53EF\u5199\uFF09\uFF0C\u9762\u677F\u6682\u4E0D\u53EF\u7F16\u8F91",
  notTakeover: "\u672C\u9762\u677F\u5C1A\u672A\u63A5\u7BA1\uFF1A\u5F53\u524D\u751F\u6548\u7684\u662F rolegroup.jsonc / \u5185\u7F6E\u8868\uFF0C\u672A\u5728\u4E0B\u9762\u5217\u51FA\u7684\u89D2\u8272\u4E00\u5F8B\u6CBF\u7528\u5B83\u4EEC\u3002\u7A7A\u767D \u2260 \u6CA1\u6709\u89D2\u8272\u2014\u2014\u70B9\u300C\u65B0\u589E\u89D2\u8272\u300D\u52A0\u4E00\u884C\uFF08\u53EA\u9700\u52A0\u4F60\u60F3\u6539\u7684\u90A3\u4E9B\uFF09\u5E76\u300C\u4FDD\u5B58\u300D\u540E\uFF0C\u7531\u672C\u9762\u677F\u63A5\u7BA1\uFF1B\u6CE8\u610F\u63A5\u7BA1\u662F\u300C\u6574\u5C42\u300D\u7684\uFF1Arolegroup.jsonc \u968F\u540E\u6574\u5C42\u8BA9\u4F4D\uFF0C\u53EA\u5199\u5728 jsonc \u91CC\u7684\u89D2\u8272\u4F1A\u56DE\u843D\u5185\u7F6E\u8868\uFF0C\u6545\u8BF7\u628A\u60F3\u4FDD\u7559\u7684 jsonc \u884C\u4E00\u5E76\u52A0\u8FDB\u6765\u3002\u300C\u91CD\u7F6E\u4E3A\u6587\u4EF6\u914D\u7F6E\u300D\u53EF\u9000\u51FA\u63A5\u7BA1\u3002\u5B8C\u6574\u751F\u6548\u8868\u89C1 /rolegroup doctor\u3002",
  takeoverNote: "\u672C\u9762\u677F\u5DF2\u63A5\u7BA1\uFF1A\u751F\u6548\u8868 = \u672C\u8868 + \u5185\u7F6E\u8868\u8865\u5E95\uFF1Brolegroup.jsonc \u6574\u5C42\u8BA9\u4F4D\uFF08\u672A\u5217\u51FA\u7684\u89D2\u8272\u56DE\u843D\u5185\u7F6E\u8868\uFF0C\u4E0D\u4F1A\u6CBF\u7528 jsonc\uFF09\u3002\u5B8C\u6574\u751F\u6548\u8868\u89C1 /rolegroup doctor\u3002"
};
var en = {
  title: "Role Routing",
  description: "Edit role \u2194 model routes visually. Precedence: this panel > project rolegroup.jsonc > user rolegroup.jsonc > built-in table.",
  dirtyBadge: "Unsaved",
  save: "Save",
  discard: "Discard",
  resetToBase: "Reset to file config",
  addRole: "Add role",
  removeRole: "Remove",
  retryCatalog: "Retry",
  fieldToolName: "Tool name",
  fieldProvider: "Provider",
  fieldModel: "Model",
  fieldReasoningEffort: "Reasoning effort",
  fieldPersona: "Persona",
  fieldSummary: "Summary",
  liveHint: "Saved routes apply to new sessions; in-flight sessions are unaffected",
  conflicted: "Settings changed elsewhere; your draft is kept \u2014 discard or reset, then retry",
  saveFailed: "Save failed (local validation or host rejection); fix the flagged fields and retry",
  catalogLoading: "Loading model catalog\u2026",
  catalogError: "Failed to load the model catalog",
  catalogPartial: "Some providers failed to respond; candidates may be incomplete",
  routeUnavailable: "Current route is not in the catalog (kept to avoid silent config loss)",
  selectProvider: "Select provider",
  selectModel: "Select model",
  scopeUnavailable: "The rolegroup settings namespace is unavailable (not served by the host or not writable); editing is disabled",
  notTakeover: 'This panel has not taken over yet: the effective table comes from rolegroup.jsonc / the built-in table, and any role not listed below keeps using them. An empty list does not mean "no roles" \u2014 add a row (only for the roles you want to change) and Save to take over; Reset to file config exits takeover. Note that takeover is all-or-nothing: rolegroup.jsonc then yields entirely, so roles you only defined in jsonc fall back to the built-in table \u2014 add the jsonc rows you want to keep here as well. See /rolegroup doctor for the full table.',
  takeoverNote: "This panel has taken over: the effective table is this table with the built-in table filling the gaps; rolegroup.jsonc yields entirely (roles not listed here fall back to the built-in table, not to jsonc). See /rolegroup doctor for the full table."
};

// src/client/index.js
var ROLEGROUP_CLIENT_NS = "dsh-rolegroup";
var inject = ["slots", "locale", "remote", "remote.session", "configForms"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("rolegroup", { zh, en }), "dsh-rolegroup: dictionaries");
  const t = ctx.locale.bind("rolegroup");
  const controller = new RolegroupCardController(ctx.configForms.get(ROLEGROUP_CLIENT_NS), ctx);
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
