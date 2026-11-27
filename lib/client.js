window.__ModuleLoader__.load({
  id: 'dsh-worklog-topics',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-worklog'
    const TAB_ID = 'dsh-worklog'
    const TAB_KIND = 'worklog'
    const VERSION = '0.1.10'
    const PANEL_ROUTE = '/dsh-worklog/panel'
    const DAILY_ROUTE = '/dsh-worklog/daily'
    const DAYS_ROUTE = '/dsh-worklog/days'
    const TOGGLE_ROUTE = '/dsh-worklog/toggle'
    const SETTINGS_ROUTE = '/dsh-worklog/settings'
    const POLL_MS = 20000

    const COPY = {
      zh: {
        'tab.title': '工作日志',
        'tab.desc': '每次对话结束自动记一行，按天存文件。',
        'date.today': '今日',
        'date.prev': '前一天',
        'date.next': '后一天',
        'date.range': '日期范围',
        'date.pick': '点击选择日期范围',
        'date.from': '从',
        'date.to': '到',
        'date.apply': '查看',
        'date.cancel': '取消',
        'head.countOne': '{n} 条',
        'head.count': '{n} 条',
        'switch.label': '自动记录',
        'switch.hintOn': '每轮对话结束时写一行，不写对话正文。',
        'switch.hintOff': '已暂停，不会写入任何记录。',
        'list.empty': '今天还没有记录。聊一轮、等这一轮结束，这里就会自动出现一行。',
        'list.emptyHint': '不用手动确认，也不用点任何按钮。',
        'foot.path': '存放',
        'foot.last': '最后写入',
        'foot.size': '磁盘占用',
        'action.refresh': '刷新',
        'action.refreshing': '刷新中…',
        'status.loading': '正在读日志…',
        'status.error': '读不到日志',
        'status.retry': '重试',
        'status.offline': 'Host 侧没有响应。确认「工作日志」插件还在运行。',
        'toast.saved': '已更新，立即生效',
        'meta.tools': '{n} 个工具',
        'meta.files': '{n} 个文件',
        'meta.noTools': '未调用工具',
        'meta.agent': '预设',
        'action.expand': '点击展开全文',
        'gantt.empty': '还没有带主题的记录，主题累积起来后这里会出现时间轴。',
        'gantt.time': '时间',
        'gantt.now': '进行中',
        'gantt.nowLine': '现在',
        'gantt.topicCount': '{n} 个主题',
        'gantt.latest': '最近：',
        'gantt.underMinute': '<1m',
        'gantt.foot': '{n} 个主题 · 覆盖 {covered}，占今天已过时段 {share}%',
        'action.collapse': '点击收起',
        'ai.label': '摘要',
        'settings.open': '设置',
        'settings.close': '收起',
        'settings.title': '摘要模型与提示词',
        'settings.loading': '正在读可用模型…',
        'settings.primary': '主摘要',
        'settings.secondary': '对比摘要',
        'settings.hostDefault': '跟随宿主默认',
        'settings.effective': '当前生效：',
        'settings.effectiveUnknown': '开启一轮对话后就知道宿主用的是哪个模型了',
        'settings.off': '关闭对比',
        'settings.local': '本地',
        'settings.promptPrimary': '主摘要提示词',
        'settings.promptSecondary': '对比摘要提示词',
        'settings.promptPlaceholder': '留空使用内置提示词',
        'settings.hint': '上面是当前实际使用的提示词，可以直接改；保存后即为你的自定义版本，点「恢复内置」可还原。',
        'settings.restore': '恢复内置',
        'settings.save': '保存',
        'settings.saving': '保存中…',
        'settings.error': '保存失败',
        'ai.primary': '主',
        'ai.secondary': '对比',
        'ai.hostDefault': '宿主默认',
        'ai.off': '零成本截断',
        'ai.answer': '答',
        'list.notes': '手记',
        'list.end': '— 共 {n} 条，到底了 —',
        'meta.turns': '{n} 条',
        'group.workspace': '工作区',
        'group.sessionFile': '会话文件',
        'view.session': '按会话',
        'view.topic': '按主题',
        'view.date': '按日期',
        'daily.button': '日总结',
        'daily.title': '{date} · 日总结',
        'daily.empty': '这一天还没有总结，点「生成」让摘要模型写一段。',
        'daily.generate': '生成总结',
        'daily.regenerate': '重新生成',
        'daily.busy': '正在总结…',
        'daily.stale': '这一天新增了记录，建议重新生成。',
        'daily.both': '两个模型各写一份',
        'daily.primary': '主摘要',
        'daily.secondary': '对比摘要',
        'daily.turns': '{n} 轮',
        'daily.error': '生成失败：{message}',
        'daily.coverage': '覆盖不足：漏了 {missing}',
        'view.gantt': '甘特',
        'view.label': '分组方式',
        'group.session': '会话',
        'group.topicCount': '{n} 个主题',
        'group.sessionCount': '{n} 个会话',
        'topic.hint': '主题从开启后开始记录；之前的记录会留在「未归主题」里。',
        'topic.untagged': '未归主题',
        'topic.untaggedWhy': '主题开启前的记录',
        'kind.turn': '对话',
        'kind.note': '手记',
        'kind.tool': '工具',
      },
      en: {
        'tab.title': 'Worklog',
        'tab.desc': 'One line per finished turn, one file per day.',
        'date.today': 'Today',
        'date.prev': 'Previous day',
        'date.next': 'Next day',
        'date.range': 'Range',
        'date.pick': 'Pick a date range',
        'date.from': 'From',
        'date.to': 'To',
        'date.apply': 'Show',
        'date.cancel': 'Cancel',
        'head.countOne': '{n}',
        'head.count': '{n}',
        'switch.label': 'Auto capture',
        'switch.hintOn': 'One line when a turn ends. The conversation body is never stored.',
        'switch.hintOff': 'Paused. Nothing is written.',
        'list.empty': 'Nothing logged today yet. Finish a turn and a line appears here on its own.',
        'list.emptyHint': 'No confirmation, no button to press.',
        'foot.path': 'Store',
        'foot.last': 'Last write',
        'foot.size': 'On disk',
        'action.refresh': 'Refresh',
        'action.refreshing': 'Refreshing…',
        'status.loading': 'Reading the log…',
        'status.error': 'Cannot read the log',
        'status.retry': 'Retry',
        'status.offline': 'The Host side did not answer. Check that the Worklog plugin is still running.',
        'toast.saved': 'Updated, effective now',
        'meta.tools': '{n} tools',
        'meta.files': '{n} files',
        'meta.noTools': 'no tools',
        'meta.agent': 'preset',
        'action.expand': 'Click to read it all',
        'gantt.empty': 'No topics yet. Once topics accumulate, the timeline appears here.',
        'gantt.time': 'Time',
        'gantt.now': 'now',
        'gantt.nowLine': 'now',
        'gantt.topicCount': '{n} topics',
        'gantt.latest': 'latest:',
        'gantt.underMinute': '<1m',
        'gantt.foot': '{n} topics · {covered} covered, {share}% of today so far',
        'action.collapse': 'Click to collapse',
        'ai.label': 'Summary',
        'settings.open': 'Settings',
        'settings.close': 'Close',
        'settings.title': 'Summary models and prompts',
        'settings.loading': 'Reading available models…',
        'settings.primary': 'Primary',
        'settings.secondary': 'Comparison',
        'settings.hostDefault': 'Follow the host default',
        'settings.effective': 'Currently: ',
        'settings.effectiveUnknown': 'The model appears after the next turn',
        'settings.off': 'Off',
        'settings.local': 'Local',
        'settings.promptPrimary': 'Primary prompt',
        'settings.promptSecondary': 'Comparison prompt',
        'settings.promptPlaceholder': 'Empty keeps the built-in prompt',
        'settings.hint': 'These are the prompts actually in use; edit them and save to keep your own version. "Restore" brings back the built-in text.',
        'settings.restore': 'Restore built-in',
        'settings.save': 'Save',
        'settings.saving': 'Saving…',
        'settings.error': 'Save failed',
        'ai.primary': 'A',
        'ai.secondary': 'B',
        'ai.hostDefault': 'host default',
        'ai.off': 'zero-cost digest',
        'ai.answer': 'A',
        'list.notes': 'Notes',
        'list.end': '— {n} entries, end —',
        'meta.turns': '{n}',
        'group.workspace': 'Workspace',
        'group.sessionFile': 'Session file',
        'view.session': 'Session',
        'view.topic': 'Topic',
        'view.date': 'By date',
        'daily.button': 'Daily',
        'daily.title': '{date} · daily summary',
        'daily.empty': 'No summary for this day yet — press Generate.',
        'daily.generate': 'Generate',
        'daily.regenerate': 'Regenerate',
        'daily.busy': 'Summarising…',
        'daily.stale': 'New records were added; consider regenerating.',
        'daily.both': 'One summary per model',
        'daily.primary': 'Primary',
        'daily.secondary': 'Comparison',
        'daily.turns': '{n} turns',
        'daily.error': 'Failed: {message}',
        'daily.coverage': 'Thin coverage: missed {missing}',
        'view.gantt': 'Timeline',
        'view.label': 'Group by',
        'group.session': 'Session',
        'group.topicCount': '{n} topics',
        'group.sessionCount': '{n} sessions',
        'topic.hint': 'Topics are recorded from the moment this was enabled; earlier entries stay under "No topic".',
        'topic.untagged': 'No topic',
        'topic.untaggedWhy': 'recorded before topics existed',
        'kind.turn': 'Turn',
        'kind.note': 'Note',
        'kind.tool': 'Tool',
      },
    }

    const CSS = `
.wl-root, .wl-root *, .wl-root *::before, .wl-root *::after { box-sizing: border-box; }
.wl-root { display: flex; flex-direction: column; height: 100%; padding-bottom: 2px; min-height: 0; color: var(--dsw-alias-label-primary); font-size: var(--wl-fs-md); line-height: 1.5; }
.wl-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px; flex: none; }
.wl-title { font-size: var(--wl-fs-lg); font-weight: 600; letter-spacing: 0.01em; }
.wl-count { margin-left: auto; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.wl-switch { position: relative; flex: none; width: 34px; height: 20px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-2); cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.wl-switch[aria-checked="true"] { background: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.wl-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: transform 120ms ease, background 120ms ease; }
.wl-switch[aria-checked="true"]::after { transform: translateX(14px); background: var(--dsw-alias-label-on-color); }
.wl-switch:disabled { opacity: 0.5; cursor: default; }
.wl-switch:focus-visible, .wl-btn:focus-visible, .wl-view:focus-visible, .wl-input:focus-visible,
.wl-date:focus-visible, .wl-nav:focus-visible, .wl-select:focus-visible, .wl-textarea:focus-visible,
.wl-day-date:focus-visible, .wl-gantt-topic:focus-visible, .wl-day:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.wl-bar { display: flex; align-items: center; gap: 8px; margin: 0 12px 10px; }
.wl-bar-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.wl-btn { flex: none; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: inherit; font-size: var(--wl-fs-xs); cursor: pointer; }
.wl-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.wl-btn:disabled { opacity: 0.55; cursor: default; }
.wl-views { flex: none; display: flex; gap: 2px; margin-right: auto; padding: 2px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-1); }
.wl-view { padding: 2px 8px; border: 0; border-radius: calc(var(--wl-radius-chip) - 2px); background: transparent; color: var(--dsw-alias-label-secondary); font-family: inherit; font-size: var(--wl-fs-xs); cursor: pointer; }
.wl-view[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
.wl-view:disabled { opacity: 0.55; cursor: default; }
.wl-list { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.wl-group { display: flex; flex-direction: column; gap: 8px; }
.wl-group-head { display: flex; align-items: baseline; gap: 8px; padding: 0 2px; }
.wl-group-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--wl-fs-md); font-weight: 600; color: var(--dsw-alias-label-primary); }
.wl-group-meta { flex: none; margin-left: auto; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.wl-group-sub { display: flex; gap: 6px; align-items: baseline; min-width: 0; padding: 0 2px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-group-k { flex: none; }
.wl-group-v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.wl-group + .wl-group { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 10px; }
.wl-daily { margin: 0 12px 10px; padding: 10px 12px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-inner); background: var(--dsw-alias-bg-layer-2); }
.wl-daily-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wl-daily-head h3 { margin: 0; font-size: var(--wl-fs-md); font-weight: 650; }
.wl-daily-body { display: grid; gap: 8px; margin-top: 8px; }
.wl-daily-slot { padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-1); }
.wl-daily-label { margin-bottom: 3px; color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-daily-flag { margin: 0 0 6px; padding: 2px 8px; border-radius: var(--wl-radius-chip); display: inline-block; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); color: var(--dsw-alias-state-warn-label); font-size: var(--wl-fs-xs); }
.wl-daily-slot p { margin: 0; white-space: pre-wrap; line-height: 1.65; }
.wl-daily-empty { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-daily-stale { margin: 6px 0 0; color: var(--dsw-alias-state-warn-label); font-size: var(--wl-fs-xs); }
.wl-btn-primary { border-color: var(--dsw-alias-label-primary); }
.wl-days { flex: 1; min-height: 0; overflow: auto; display: grid; align-content: start; gap: 10px; padding: 0 12px 12px; }
.wl-day { padding: 10px 12px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-inner); background: var(--dsw-alias-bg-layer-1); }
.wl-day-head { display: flex; align-items: center; gap: 10px; }
.wl-day-date { padding: 0; border: 0; background: none; color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--wl-fs-md); font-weight: 650; cursor: pointer; }
.wl-day-date:hover { text-decoration: underline; }
.wl-day-meta { flex: 1; color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-gantt { flex: 1; min-height: 0; overflow: auto; padding: 0 0 6px; }
.wl-gantt-canvas { position: relative; padding-bottom: 18px; }
.wl-gantt-row { display: flex; align-items: stretch; height: 28px; }
.wl-gantt-session { height: 30px; background: var(--dsw-alias-bg-layer-2); align-items: center; cursor: pointer; }
.wl-gantt-session:hover { background: var(--dsw-alias-bg-layer-1); }
.wl-gantt-session .wl-gantt-name { font-size: var(--wl-fs-xs); font-weight: 700; letter-spacing: 0.01em; }
.wl-gantt-session .wl-gantt-meta { opacity: 0.75; }
.wl-gantt-band { position: absolute; top: 50%; height: 5px; transform: translateY(-50%); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-label-secondary); opacity: 0.32; }
.wl-gantt-topic .wl-gantt-label { padding-left: 22px; position: sticky; }
.wl-gantt-topic .wl-gantt-label::before { content: ""; position: absolute; left: 12px; top: 4px; bottom: 4px; width: 1px; background: var(--dsw-alias-border-l2); }
.wl-gantt-extra { flex: none; padding: 0 4px; border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-gantt-subtopic .wl-gantt-label { padding-left: 40px; opacity: 0.92; position: sticky; left: 0; }.wl-gantt-single .wl-gantt-name { font-size: var(--wl-fs-md); }
.wl-gantt-subtopic .wl-gantt-name { color: var(--dsw-alias-label-secondary); }
.wl-gantt-subtopic .wl-gantt-label::before { content: ""; position: absolute; left: 26px; top: 2px; bottom: 2px; width: 1px; background: var(--dsw-alias-border-l2); }

.wl-gantt-subtopic { height: 24px; }
.wl-gantt-bar[data-sub="true"] { height: 10px; opacity: 0.55; }
.wl-gantt-topic .wl-gantt-name { font-size: var(--wl-fs-md); }
.wl-gantt-axis { height: 20px; position: sticky; top: 0; z-index: 4; background: var(--dsw-alias-bg-layer-1); }
.wl-gantt-label { position: sticky; left: 0; z-index: 3; flex: none; width: 210px; padding: 0 8px 0 12px; display: flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-1); border-right: 1px solid var(--dsw-alias-border-l1); }
.wl-gantt-axis .wl-gantt-label { font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-gantt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--wl-fs-md); color: var(--dsw-alias-label-primary); }
.wl-gantt-meta { flex: none; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.wl-gantt-track { position: relative; flex: none; height: 100%; background-image: repeating-linear-gradient(to right, var(--dsw-alias-border-l1) 0 1px, transparent 1px 100%); background-size: 360px 100%; }
.wl-gantt-axis .wl-gantt-track { background-image: none; }
.wl-gantt-tick { position: absolute; top: 3px; transform: translateX(-50%); font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.wl-gantt-tick[data-major="false"] { opacity: 0.45; }
.wl-gantt-tick::after { content: ""; position: absolute; top: 14px; left: 50%; width: 1px; height: 4px; background: var(--dsw-alias-border-l2); }
/* Chart marks follow the spec: quiet by default, saturated only when you point at one. */
.wl-gantt-bar { position: absolute; top: 50%; height: 16px; transform: translateY(-50%); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-state-business-tertiary); }
.wl-gantt-bar:hover, .wl-gantt-bar[data-active="true"] { background: var(--dsw-alias-state-business-primary); }
.wl-gantt-bar[data-ongoing="true"] { box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-primary); }
.wl-gantt-tip[data-below="true"] { transform: translate(-50%, 8px); }
.wl-gantt-tip { position: fixed; z-index: 8; transform: translate(-50%, calc(-100% - 8px)); max-width: 340px; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: var(--wl-fs-xs); line-height: 1.5; white-space: pre-wrap; box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent); pointer-events: none; }
.wl-gantt-now { position: absolute; top: 20px; width: 0; height: calc(100% - 38px); border-left: 1px solid var(--dsw-alias-label-secondary); opacity: 0.45; }
.wl-gantt-now-label { position: absolute; top: -1px; left: 4px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.wl-gantt-foot { flex: none; padding: 4px 12px 0; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-dates { display: flex; align-items: center; gap: 4px; margin-left: 8px; }
.wl-nav { width: 20px; height: 20px; padding: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: var(--wl-fs-md); line-height: 1; cursor: pointer; }
.wl-nav:hover { background: var(--dsw-alias-bg-layer-2); }
.wl-date { padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: inherit; font-size: var(--wl-fs-xs); font-variant-numeric: tabular-nums; cursor: pointer; }
.wl-range { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 12px 10px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-inner); background: var(--dsw-alias-bg-layer-1); font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-range-row { display: flex; align-items: center; gap: 6px; }
.wl-input { font-family: inherit; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); padding: 3px 6px; }
.wl-settings { margin: 0 12px 12px; flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-inner); background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 8px; }
.wl-settings-head { display: flex; align-items: center; gap: 8px; }
.wl-settings-title { font-size: var(--wl-fs-md); font-weight: 600; }
.wl-settings-head .wl-btn { margin-left: auto; }
.wl-settings-row { display: flex; align-items: center; gap: 8px; font-size: var(--wl-fs-xs); }
.wl-settings-row.wl-settings-col { flex-direction: column; align-items: stretch; gap: 4px; }
.wl-settings-k { flex: none; width: 88px; color: var(--dsw-alias-label-secondary); }
.wl-settings-col .wl-settings-k { width: auto; }
.wl-select, .wl-textarea { font-family: inherit; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); padding: 4px 6px; }
.wl-select { flex: 1; min-width: 0; }
.wl-textarea { resize: none; overflow: hidden; line-height: 1.6; }
.wl-hint-sm { margin: 0; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-settings-actions { display: flex; justify-content: flex-end; gap: 8px; }
.wl-end { padding: 6px 0 2px; text-align: center; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); opacity: 0.75; }
.wl-group-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.wl-item { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--wl-radius-inner); background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.wl-item-head { display: flex; align-items: center; gap: 8px; }
.wl-topic { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-time { font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.wl-kind { flex: none; margin-left: auto; padding: 1px 7px; border-radius: var(--wl-radius-chip); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-kind[data-kind="turn"] { color: var(--dsw-alias-state-business-primary); }
.wl-kind[data-kind="note"] { color: var(--dsw-alias-state-warn-label); }
.wl-summary { margin: 0; color: var(--dsw-alias-label-primary); font-size: var(--wl-fs-md); overflow-wrap: anywhere; }
.wl-ai { display: flex; gap: 6px; align-items: baseline; margin: 0; }
.wl-ai-tag { flex: none; width: 58px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.02em; }
.wl-ai-text[data-expandable="true"] { cursor: pointer; }
.wl-ai-text[data-open="true"] { display: block; -webkit-line-clamp: unset; }
.wl-ai-text { min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--dsw-alias-label-primary); font-size: var(--wl-fs-md); overflow-wrap: anywhere; }
.wl-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-chip { padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--wl-radius-chip); color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-empty { margin: 4px 0 0; border-radius: var(--wl-radius-inner); padding: 16px 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-md); }
.wl-empty-hint { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: var(--wl-fs-xs); }
.wl-note { margin: 0 12px 8px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-note[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.wl-note[data-tone="err"] { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; }
.wl-foot { position: sticky; bottom: 0; z-index: 5; flex: none; margin-top: auto; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 -6px 12px -8px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); padding: 10px 12px 12px; border-top: 1px solid var(--dsw-alias-border-l1); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font-size: var(--wl-fs-xs); color: var(--dsw-alias-label-secondary); }
.wl-foot-k { white-space: nowrap; }
.wl-foot-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`

    const VARS = {
      '--wl-fs-xs': '11px',
      '--wl-fs-sm': '12px',
      '--wl-fs-md': '13px',
      '--wl-fs-lg': '14px',
      '--wl-radius-card': '16px',
      '--wl-radius-inner': '12px',
      '--wl-radius-chip': '10px',
    }

    function fmt(t, key, params) {
      let text = t(key)
      if (params) {
        for (const name of Object.keys(params)) text = text.split(`{${name}}`).join(String(params[name]))
      }
      return text
    }

    function tail(text, max) {
      const value = String(text ?? '')
      return value.length <= max ? value : `…${value.slice(-(max - 1))}`
    }

    function clock(ts) {
      if (typeof ts !== 'string' || ts.length < 16) return '--:--'
      const date = new Date(ts)
      if (Number.isNaN(date.getTime())) return '--:--'
      const hh = String(date.getHours()).padStart(2, '0')
      const mm = String(date.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }

    function size(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / 1024 / 1024).toFixed(1)} MB`
    }

    function groupEntries(entries) {
      const groups = new Map()
      for (const entry of entries) {
        const key = typeof entry.sessionId === 'string' ? entry.sessionId : ''
        let group = groups.get(key)
        if (group === undefined) {
          group = { key, title: '', workspace: '', sessionPath: '', count: 0, from: entry.ts, to: entry.ts, entries: [] }
          groups.set(key, group)
        }
        group.count += 1
        group.entries.push(entry)
        if (!group.title && entry.sessionTitle) group.title = entry.sessionTitle
        if (!group.workspace && entry.workspace) group.workspace = entry.workspace
        if (!group.sessionPath && entry.sessionPath) group.sessionPath = entry.sessionPath
        if (typeof entry.ts === 'string' && entry.ts) {
          if (!group.from || entry.ts < group.from) group.from = entry.ts
          if (!group.to || entry.ts > group.to) group.to = entry.ts
        }
      }
      return [...groups.values()]
    }

    /**
     * Group by topic label, mirroring the host: a topic id is per session, so
     * ids cannot be the key; untagged entries stay per session instead of
     * collapsing every older record into one anonymous group.
     */
    function groupByTopic(entries, t) {
      const keyOf = (entry) => {
        const label = typeof entry.topic === 'string' ? entry.topic : ''
        if (label) return `#${label.toLowerCase().replace(/[\s，。、,.:：;；!！?？"'“”‘’（）()【】\[\]<>《》\-—_/\\|]+/g, '')}`
        return `#untagged#${entry.sessionId || ''}`
      }
      const groups = new Map()
      for (const entry of entries) {
        const key = keyOf(entry)
        const topic = typeof entry.topic === 'string' ? entry.topic : ''
        let group = groups.get(key)
        if (group === undefined) {
          group = { key, topic, title: topic || t('topic.untagged'), count: 0, from: entry.ts, to: entry.ts, sessions: [], entries: [] }
          groups.set(key, group)
        }
        group.count += 1
        group.entries.push(entry)
        if (!group.topic && topic) group.topic = topic
        const sessionId = entry.sessionId || ''
        let session = group.sessions.find((item) => item.sessionId === sessionId)
        if (session === undefined) {
          session = { sessionId, sessionTitle: '', count: 0 }
          group.sessions.push(session)
        }
        session.count += 1
        if (!session.sessionTitle && entry.sessionTitle) session.sessionTitle = entry.sessionTitle
        if (typeof entry.ts === 'string' && entry.ts) {
          if (!group.from || entry.ts < group.from) group.from = entry.ts
          if (!group.to || entry.ts > group.to) group.to = entry.ts
        }
      }
      return [...groups.values()].sort((left, right) => {
        if (!left.topic !== !right.topic) return left.topic ? -1 : 1
        return String(right.to).localeCompare(String(left.to))
      })
    }

    /**
     * Model and prompt settings. The host lists the routes it knows; nothing here
     * carries a credential, only provider/model ids the host already has.
     */
    function SettingsPanel(props) {
      const t = props.t
      const settings = props.settings
      const [primary, setPrimary] = React.useState('')
      const [secondary, setSecondary] = React.useState('')
      const [promptPrimary, setPromptPrimary] = React.useState('')
      const [promptSecondary, setPromptSecondary] = React.useState('')
      const [hydrated, setHydrated] = React.useState(false)

      React.useEffect(() => {
        if (settings === null || hydrated) return
        const selected = settings.selected || {}
        setPrimary(selected.provider && selected.model ? `${selected.provider}::${selected.model}` : '')
        setSecondary(
          selected.compareProvider && selected.compareModel
            ? `${selected.compareProvider}::${selected.compareModel}`
            : (settings.local && settings.local.enabled ? 'local' : ''),
        )
        const builtin = settings.builtinPrompts || {}
        setPromptPrimary((settings.prompts && settings.prompts.primary) || builtin.primary || '')
        setPromptSecondary((settings.prompts && settings.prompts.secondary) || builtin.secondary || '')
        setHydrated(true)
      }, [settings, hydrated])

      const routes = []
      for (const provider of settings ? settings.providers || [] : []) {
        for (const model of (settings.models && settings.models[provider.id]) || []) {
          routes.push({ key: `${provider.id}::${model.id}`, label: `${provider.name || provider.id} · ${model.name || model.id}` })
        }
      }

      const builtin = (settings && settings.builtinPrompts) || {}
      /** Grow the box to the text instead of hiding it behind an inner scrollbar. */
      const rowsFor = (text, min) => Math.min(40, Math.max(min, String(text).split('\n').length))
      const save = () => {
        // Saving the untouched built-in keeps following future improvements; an
        // edited prompt is stored as the user's own.
        const patch = {
          promptPrimary: promptPrimary.trim() === (builtin.primary || '').trim() ? '' : promptPrimary,
          promptSecondary: promptSecondary.trim() === (builtin.secondary || '').trim() ? '' : promptSecondary,
        }
        if (primary === '') {
          patch.provider = ''
          patch.model = ''
        } else {
          const [provider, model] = primary.split('::')
          patch.provider = provider
          patch.model = model
        }
        if (secondary === 'local') {
          patch.compareProvider = ''
          patch.compareModel = ''
          patch.ollama = true
        } else if (secondary === '') {
          patch.compareProvider = ''
          patch.compareModel = ''
          patch.ollama = false
        } else {
          const [provider, model] = secondary.split('::')
          patch.compareProvider = provider
          patch.compareModel = model
          patch.ollama = false
        }
        props.onSave(patch)
      }

      return h('div', { className: 'wl-settings' },
        h('div', { className: 'wl-settings-head' },
          h('span', { className: 'wl-settings-title' }, t('settings.title')),
          h('button', { type: 'button', className: 'wl-btn', onClick: props.onClose }, t('settings.close'))),
        settings === null
          ? h('p', { className: 'wl-hint-sm' }, props.error || t('settings.loading'))
          : h(React.Fragment, null,
            h('label', { className: 'wl-settings-row' },
              h('span', { className: 'wl-settings-k' }, t('settings.primary')),
              h('select', {
                className: 'wl-select',
                value: primary,
                onChange: (event) => setPrimary(event.target.value),
              },
              h('option', { value: '' }, t('settings.hostDefault')),
              routes.map((route) => h('option', { key: route.key, value: route.key }, route.label))),
            h('span', { className: 'wl-hint-sm' },
              settings.effective && settings.effective.model
                ? `${t('settings.effective')} ${settings.effective.model}`
                : t('settings.effectiveUnknown'))),
            h('label', { className: 'wl-settings-row' },
              h('span', { className: 'wl-settings-k' }, t('settings.secondary')),
              h('select', {
                className: 'wl-select',
                value: secondary,
                onChange: (event) => setSecondary(event.target.value),
              },
              h('option', { value: '' }, t('settings.off')),
              settings.local ? h('option', { value: 'local' }, `${t('settings.local')} ${settings.local.model || ''}`.trim()) : null,
              routes.map((route) => h('option', { key: route.key, value: route.key }, route.label)))),
            h('label', { className: 'wl-settings-row wl-settings-col' },
              h('span', { className: 'wl-settings-k' }, t('settings.promptPrimary')),
              h('textarea', {
                className: 'wl-textarea',
                rows: rowsFor(promptPrimary, 4),
                value: promptPrimary,
                placeholder: t('settings.promptPlaceholder'),
                onChange: (event) => setPromptPrimary(event.target.value),
              })),
            h('label', { className: 'wl-settings-row wl-settings-col' },
              h('span', { className: 'wl-settings-k' }, t('settings.promptSecondary')),
              h('textarea', {
                className: 'wl-textarea',
                rows: rowsFor(promptSecondary, 4),
                value: promptSecondary,
                placeholder: t('settings.promptPlaceholder'),
                onChange: (event) => setPromptSecondary(event.target.value),
              })),
            h('p', { className: 'wl-hint-sm' }, t('settings.hint')),
            props.error ? h('p', { className: 'wl-note', 'data-tone': 'err' }, props.error) : null,
            h('div', { className: 'wl-settings-actions' },
              h('button', {
                type: 'button',
                className: 'wl-btn',
                onClick: () => { setPromptPrimary(builtin.primary || ''); setPromptSecondary(builtin.secondary || '') },
              }, t('settings.restore')),
              h('button', { type: 'button', className: 'wl-btn', disabled: props.busy, onClick: save }, props.busy ? t('settings.saving') : t('settings.save')))),
      )
    }

    /**
     * Topic timeline for one day.
     *
     * A bar spans a topic's first to last record, which is the only honest
     * measure available: between two records of one topic the session may have
     * been doing something else, or nothing at all. The footer reports the union
     * of all spans so overlapping sessions do not double count.
     */
    /**
     * Topic timeline for one day.
     *
     * A turn owns the time from its own record until the next one in the same
     * session — that is the only span the log can actually justify, and it makes
     * a topic read as a block instead of a pin. Gaps longer than GAP_CAP are
     * treated as leaving the topic, otherwise an idle afternoon would be charged
     * to whatever was last touched. A topic that is revisited shows as several
     * segments on one row, because merging them into one bar would claim time it
     * did not have.
     */
  /** A day-summary slot: label, optional coverage warning, body. */
  const daySlot = (t, slot, value) => h('div', { className: 'wl-daily-slot', key: slot },
    h('div', { className: 'wl-daily-label' },
      `${slot === 'secondary' ? t('daily.secondary') : t('daily.primary')} · ${value.model ?? ''}`),
    value.coverage && value.coverage.covered < value.coverage.required
      ? h('div', { className: 'wl-daily-flag' }, fmt(t, 'daily.coverage', { missing: value.coverage.missing.join('、') }))
      : null,
    h('p', null, value.text))

    function Gantt(props) {
      const t = props.t
      const day = props.day
      const entries = Array.isArray(props.entries) ? props.entries : []
      const GAP_CAP = 45 * 60 * 1000
      // One day is drawn at 6 px/min (an hour is 360 px); a range falls back to a
      // per-day scale, otherwise a week would be a 60 000 px canvas.
      const span = props.range && props.range.from ? props.range : { from: day, to: day }
      const rangeStart = new Date(`${span.from}T00:00:00`).getTime()
      const rangeEnd = new Date(`${span.to}T00:00:00`).getTime() + 86400000
      const spanMs = Math.max(3600000, rangeEnd - rangeStart)
      const singleDay = spanMs <= 2 * 86400000
      const pxPerMs = singleDay ? 6 / 60000 : 90 / 86400000
      const trackWidth = Math.max(720, Math.round(spanMs * pxPerMs))
      const [hover, setHover] = React.useState(null)
      const now = Number.isFinite(props.now) ? props.now : Date.now()
      const live = Boolean(props.live && props.live.tracked > 0)
      // Only affects how a topic's segments are drawn, never how many rows there are.
      const gapMs = Math.max(0, Number(props.mergeGapMinutes) || 0) * 60000

      const bySession = new Map()
      for (const entry of entries) {
        if (typeof entry.ts !== 'string' || entry.ts === '') continue
        const id = entry.sessionId || ''
        if (!bySession.has(id)) bySession.set(id, [])
        bySession.get(id).push(entry)
      }
      let newestSession = ''
      let newestTs = ''
      for (const [id, list] of bySession) {
        const last = list.reduce((best, entry) => (entry.ts > best ? entry.ts : best), '')
        if (last > newestTs) {
          newestTs = last
          newestSession = id
        }
      }

      // Sessions are the outer level: a topic id is only unique inside a session.
      // Topics are the only level below it — there is no stage entity.
      const blocks = []
      for (const [sessionId, list] of bySession) {
        list.sort((left, right) => String(left.ts).localeCompare(String(right.ts)))
        const block = { sessionId, title: '', summary: '', topics: new Map(), first: 0, last: 0, segments: [] }
        for (const [index, entry] of list.entries()) {
          const start = new Date(entry.ts).getTime()
          if (!Number.isFinite(start)) continue
          // The list is sorted by time, so the last title seen is the newest one:
          // a renamed session must not keep showing its old name.
          if (entry.sessionTitle) block.title = String(entry.sessionTitle)
          if (!block.summary && typeof entry.summary === 'string') block.summary = entry.summary
          if (!block.first || start < block.first) block.first = start
          if (start > block.last) block.last = start
          const topic = typeof entry.topic === 'string' ? entry.topic.trim() : ''
          if (topic === '') continue
          const next = index + 1 < list.length ? new Date(list[index + 1].ts).getTime() : Number.NaN
          let stop
          if (Number.isFinite(next)) stop = Math.min(next, start + GAP_CAP)
          else if (live && sessionId === newestSession) stop = Math.min(now, start + GAP_CAP)
          else stop = start
          const key = topic.toLowerCase().replace(/[\s，。、,.:：;；!！?？"'“”‘’（）()【】\[\]<>《》\-—_/\\|]+/g, '')
          let row = block.topics.get(key)
          if (row === undefined) {
            row = { key: `${sessionId}#${key}`, topic, segments: [], turns: 0, first: start, total: 0, ongoing: false }
            block.topics.set(key, row)
          }
          row.turns += 1
          row.total += Math.max(0, stop - start)
          if (start < row.first) row.first = start
          // Nothing can have happened after this moment; a later timestamp is clock
          // skew between host and browser, and drawing it past "now" reads as a bug.
          if (stop > now) stop = now
          if (stop > start) row.segments.push([start, stop, typeof entry.summary === 'string' ? entry.summary : ''])
          if (!Number.isFinite(next) && live && sessionId === newestSession) row.ongoing = true
        }

        if (block.topics.size > 0) {
          block.topics = [...block.topics.values()].sort((left, right) => left.first - right.first)
          blocks.push(block)
        }
      }
      blocks.sort((left, right) => left.first - right.first)
      const rows = blocks.flatMap((block) => block.topics)
      const list = blocks
      const flat = rows

      /** clock() wants an ISO string; the timeline works in epoch ms. */
      const stamp = (ms) => new Date(ms).toISOString()
      const clip = (text, max) => (String(text).length <= max ? String(text) : `${String(text).slice(0, max - 1)}…`)
      /**
       * Hover text: topic, span, then the line this turn earned. Native titles
       * keep it dependency-free and work with a trackpad as well as a mouse.
       */
      const tip = (title, from, to, summary) => [
        title,
        `${clock(stamp(from))}–${clock(stamp(to))} · ${fmtDuration(t, to - from)}`,
        summary ? clip(summary, 160) : '',
      ].filter(Boolean).join('\n')
      /** Session card: span, volume, the topics it contains and the last line. */
      const sessionTip = (block) => {
        const turns = block.topics.reduce((total, row) => total + row.turns, 0)
        const lastRow = block.topics[block.topics.length - 1]
        const lastSegment = lastRow && lastRow.segments.length > 0 ? lastRow.segments[lastRow.segments.length - 1] : null
        return [
          block.title || t('gantt.untitled'),
          `${clock(stamp(block.first))}–${clock(stamp(block.last))} · ${fmtDuration(t, block.last - block.first)} · ${fmt(t, 'gantt.topicCount', { n: block.topics.length })} · ${fmt(t, 'meta.turns', { n: turns })}`,
          ...block.topics.slice(0, 6).map((row) => `· ${row.topic} ${fmtDuration(t, row.total)}`),
          lastSegment && lastSegment[2] ? `${t('gantt.latest')} ${clip(lastSegment[2], 90)}` : '',
        ].filter(Boolean).join('\n')
      }
      /** Topic card: its own span and the last two turns that built it. */
      const topicTip = (row) => {
        const ends = row.segments.map((segment) => segment[1])
        const last = ends.length === 0 ? row.first : Math.max(...ends)
        return [
          row.topic,
          `${clock(stamp(row.first))}–${clock(stamp(last))} · ${fmtDuration(t, row.total)} · ${fmt(t, 'meta.turns', { n: row.turns })}`,
          ...row.segments.slice(-2).map((segment) => `${clock(stamp(segment[0]))} ${clip(segment[2] || '', 80)}`),
        ].filter(Boolean).join('\n')
      }
      /**
       * Join segments that follow each other within `gapMs`.
       *
       * A topic interrupted by a one-minute pause should read as one stretch, not
       * as confetti; the setting only affects drawing, never the row count.
       */
      const mergeSegments = (segments, gap) => {
        const sorted = [...segments].sort((left, right) => left[0] - right[0])
        const out = []
        for (const segment of sorted) {
          const last = out[out.length - 1]
          if (last !== undefined && gap > 0 && segment[0] - last[1] <= gap) {
            last[1] = Math.max(last[1], segment[1])
            last[2] = segment[2] || last[2]
            continue
          }
          out.push([segment[0], segment[1], segment[2]])
        }
        return out
      }

      /** Show a card above `element`, anchored so it stays inside the panel. */
      const showTip = (element, text) => {
        const box = element.getBoundingClientRect()
        const width = Math.min(340, typeof window === 'undefined' ? 340 : window.innerWidth - 24)
        const centre = box.left + box.width / 2
        const view = typeof window === 'undefined' ? { innerWidth: 1200, innerHeight: 900 } : window
        // Keep the card inside the window: clamp on x, and flip below the row when
        // there is not enough room above it.
        const x = Math.min(Math.max(centre, width / 2 + 12), view.innerWidth - width / 2 - 12)
        const above = box.top >= 96
        setHover({ text, x, y: above ? box.top : box.bottom, below: !above })
      }
      // Accepts a timestamp string or an epoch number.
      const x = (value) => {
        const at = typeof value === 'number' ? value : new Date(value).getTime()
        return Math.max(0, Math.min(trackWidth, (at - rangeStart) * pxPerMs))
      }
      // Opening at 00:00 would hide everything the user came to see.
      const scrollRef = React.useRef(null)
      // Park once per range, and only after the rows exist: when the view mounts
      // before the first fetch lands there is nothing to park on, and a one-shot
      // effect would leave the timeline sitting at 00:00 for the rest of the day.
      const parkedFor = React.useRef('')
      React.useEffect(() => {
        const element = scrollRef.current
        if (element === null || flat.length === 0) return
        const key = `${span.from}|${span.to}`
        if (parkedFor.current === key) return
        parkedFor.current = key
        const lastEnd = flat.reduce((best, row) => Math.max(best, ...row.segments.map((segment) => segment[1]), row.first), rangeStart)
        element.scrollLeft = Math.max(0, LABEL_W + x(lastEnd) - element.clientWidth * 0.72)
      }, [span.from, span.to, flat.length])

      // Everything starts expanded; the header still collapses a session when the
      // day gets long. `null` means "no explicit choice yet".
      const [expanded, setExpanded] = React.useState(null)
      const allIds = blocks.map((block) => block.sessionId)
      const isOpen = (block) => (expanded === null ? true : expanded.has(block.sessionId))
      const toggleBlock = (block) => {
        setExpanded((previous) => {
          const next = new Set(previous === null ? allIds : previous)
          if (next.has(block.sessionId)) next.delete(block.sessionId)
          else next.add(block.sessionId)
          return next
        })
      }

      if (list.length === 0) {
        return h('div', { className: 'wl-empty' }, t('gantt.empty'), h('p', { className: 'wl-empty-hint' }, t('topic.hint')))
      }

      const ticks = []
      if (singleDay) {
        for (let hour = 0; hour < 24; hour += 1) {
          ticks.push(h('span', {
            className: 'wl-gantt-tick',
            key: hour,
            'data-major': hour % 2 === 0 ? 'true' : 'false',
            style: { left: `${hour * 60 * 60000 * pxPerMs}px` },
          }, String(hour).padStart(2, '0')))
        }
      } else {
        const days = Math.round(spanMs / 86400000)
        const step = Math.max(1, Math.ceil(days / 24))
        for (let index = 0; index < days; index += step) {
          const at = rangeStart + index * 86400000
          ticks.push(h('span', {
            className: 'wl-gantt-tick',
            key: at,
            'data-major': 'true',
            style: { left: `${index * 86400000 * pxPerMs}px` },
          }, `${String(new Date(at).getMonth() + 1).padStart(2, '0')}-${String(new Date(at).getDate()).padStart(2, '0')}`))
        }
      }
      const merged = (() => {
        const spans = flat.flatMap((row) => row.segments).sort((left, right) => left[0] - right[0])
        let total = 0
        let cursor = -Infinity
        let end = -Infinity
        for (const [from, to] of spans) {
          if (from > end) {
            if (end > cursor) total += end - cursor
            cursor = from
            end = to
          } else if (to > end) {
            end = to
          }
        }
        if (end > cursor) total += end - cursor
        return total
      })()
      const elapsed = Math.max(1, Math.min(now, rangeEnd) - rangeStart)

      return h('div', { className: 'wl-gantt', ref: scrollRef },
        h('div', { className: 'wl-gantt-canvas', style: { width: `${LABEL_W + trackWidth}px` } },
          h('div', { className: 'wl-gantt-row wl-gantt-axis' },
            h('span', { className: 'wl-gantt-label' }, t('gantt.time')),
            h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } }, ticks),
          ),
          blocks.map((block) => h(React.Fragment, { key: block.sessionId },
            h('div', {
              className: 'wl-gantt-row wl-gantt-session',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': isOpen(block) ? 'true' : 'false',
              onClick: () => toggleBlock(block),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleBlock(block)
                }
              },
            },
              h('span', {
                className: 'wl-gantt-label',
                'aria-label': sessionTip(block),
                onMouseEnter: (event) => showTip(event.currentTarget, sessionTip(block)),
                onMouseLeave: () => setHover(null),
              },
                h('span', { className: 'wl-gantt-name' },
                  `${isOpen(block) ? '▾' : '▸'} ${block.title || t('gantt.untitled')}`),
                h('span', { className: 'wl-gantt-meta' }, fmt(t, 'gantt.topicCount', { n: block.topics.length }))),
              h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } },
                Math.min(block.last, now) > block.first
                  ? h('span', {
                    className: 'wl-gantt-band',
                    style: {
                      left: `${x(block.first)}px`,
                      width: `${Math.max(3, x(Math.min(block.last, now)) - x(block.first))}px`,
                    },
                  })
                  : null)),
            (isOpen(block) ? block.topics : []).map((row) => {
              const drawn = mergeSegments(row.segments, gapMs)
              const bars = drawn.length === 0
                ? [h('span', {
                  className: 'wl-gantt-bar',
                  'data-ongoing': row.ongoing ? 'true' : 'false',
                  key: 'empty',
                  style: { left: `${x(Math.min(row.first, now))}px`, width: '3px' },
                  'aria-label': topicTip(row),
                  onMouseEnter: (event) => showTip(event.currentTarget, topicTip(row)),
                  onMouseLeave: () => setHover(null),
                })]
                : drawn.map((segment, index) => {
                  const text = tip(row.topic, segment[0], segment[1], segment[2])
                  return h('span', {
                    className: 'wl-gantt-bar',
                    'data-ongoing': row.ongoing && index === drawn.length - 1 ? 'true' : 'false',
                    key: segment[0],
                    style: { left: `${x(segment[0])}px`, width: `${Math.max(3, x(segment[1]) - x(segment[0]))}px` },
                    'aria-label': text,
                    onMouseEnter: (event) => showTip(event.currentTarget, text),
                    onMouseLeave: () => setHover(null),
                  })
                })
              return h('div', { className: 'wl-gantt-row wl-gantt-topic', key: row.key },
                h('span', {
                  className: 'wl-gantt-label',
                  'aria-label': topicTip(row),
                  onMouseEnter: (event) => showTip(event.currentTarget, topicTip(row)),
                  onMouseLeave: () => setHover(null),
                },
                  h('span', { className: 'wl-gantt-name' }, row.topic),
                  h('span', { className: 'wl-gantt-meta' }, fmtDuration(t, row.total))),
                h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } },
                  bars),
              )
            }),
          )),
          hover === null ? null : h('div', {
            className: 'wl-gantt-tip',
            'data-below': hover.below ? 'true' : 'false',
            style: { left: `${hover.x}px`, top: `${hover.y}px` },
          }, hover.text),
          now > rangeStart && now < rangeEnd
            ? h('span', { className: 'wl-gantt-now', style: { left: `${LABEL_W + x(now)}px` } },
              h('span', { className: 'wl-gantt-now-label' }, t('gantt.nowLine')))
            : null,
        ),
        h('div', { className: 'wl-gantt-foot' },
          fmt(t, 'gantt.foot', {
            n: flat.length,
            covered: fmtDuration(t, merged),
            share: merged === 0 ? 0 : Math.round((merged / elapsed) * 100),
          })),
      )
    }

    const LABEL_W = 210

    /** `1h 20m` / `35m`, deliberately short: it sits under the topic name. */
    function fmtDuration(t, ms) {
      const minutes = Math.max(0, Math.round(ms / 60000))
      if (minutes < 1) return t('gantt.underMinute')
      const hours = Math.floor(minutes / 60)
      return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`
    }

    function Styles() {
      return h('style', { 'data-dsh-worklog': 'style' }, CSS)
    }

    function TabIcon(props) {
      // 16px icons need a thinner stroke than 24px ones, or they look bolder.
      const size = props && props.size === 'inline' ? 16 : 24
      const scale = size === 16 ? 1.2 : 1.8
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: scale,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M4.5 2.4h4.6L12 5.3v8.3H4.5z' }),
        h('path', { d: 'M9 2.5v3h2.9' }),
        h('path', { d: 'M6.2 8.6h4' }),
        h('path', { d: 'M6.2 11h2.6' }),
      )
    }

    const KIND_LABELS = { turn: 'kind.turn', note: 'kind.note', tool: 'kind.tool' }

    function kindLabel(t, kind) {
      const key = KIND_LABELS[kind]
      return key ? t(key) : String(kind || '')
    }

    /**
     * A clamped paragraph that opens on click. `title` alone is not enough: the
     * native tooltip needs a hover delay and never fires on touch.
     */
    function Expandable(props) {
      const [open, setOpen] = React.useState(false)
      const long = props.text.length > 90
      return h('span', {
        className: 'wl-ai-text',
        'data-open': open ? 'true' : 'false',
        'data-expandable': long ? 'true' : 'false',
        title: long ? (open ? props.t('action.collapse') : props.t('action.expand')) : undefined,
        role: long ? 'button' : undefined,
        tabIndex: long ? 0 : undefined,
        onClick: long ? () => setOpen(!open) : undefined,
        onKeyDown: long
          ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(!open)
            }
          }
          : undefined,
      }, props.text)
    }

    function Item(props) {
      const t = props.t
      const entry = props.entry
      const tools = Array.isArray(entry.tools) ? entry.tools : []
      const files = Array.isArray(entry.files) ? entry.files : []
      const summaries = entry.summaries && typeof entry.summaries === 'object' ? entry.summaries : null
      const rows = []
      // Slot labels come from the record when present, so a user-chosen model is
      // named correctly instead of being called "deepseek" forever.
      const labels = entry.summaryLabels && typeof entry.summaryLabels === 'object' ? entry.summaryLabels : {}
      const primary = summaries === null ? '' : (summaries.primary ?? summaries.deepseek)
      const secondary = summaries === null ? '' : (summaries.secondary ?? summaries.ollama)
      if (typeof primary === 'string' && primary) rows.push([labels.primary || t('ai.primary'), primary])
      if (typeof secondary === 'string' && secondary) rows.push([labels.secondary || t('ai.secondary'), secondary])
      return h('li', { className: 'wl-item' },
        h('div', { className: 'wl-item-head' },
          h('span', { className: 'wl-time' }, clock(entry.ts)),
          typeof entry.topic === 'string' && entry.topic
            ? h('span', { className: 'wl-topic', title: entry.topic }, entry.topic)
            : null,
          h('span', { className: 'wl-kind', 'data-kind': entry.kind }, kindLabel(t, entry.kind)),
        ),
        rows.length > 0
          ? rows.map((row) => h('div', { className: 'wl-ai', key: row[0] },
            h('span', { className: 'wl-ai-tag' }, row[0]),
            h(Expandable, { t, text: row[1] })))
          : h(React.Fragment, null,
            h('p', { className: 'wl-summary' }, entry.summary),
            typeof entry.answer === 'string' && entry.answer
              ? h('div', { className: 'wl-ai' },
                h('span', { className: 'wl-ai-tag' }, t('ai.answer')),
                h(Expandable, { t, text: entry.answer }))
              : null),
        h('div', { className: 'wl-meta' },
          tools.length === 0
            ? h('span', null, t('meta.noTools'))
            : tools.slice(0, 4).map((tool) => h('span', { className: 'wl-chip', key: tool }, tool)),
          files.length > 0 ? h('span', null, fmt(t, 'meta.files', { n: files.length })) : null,
          entry.agent ? h('span', null, `${t('meta.agent')} ${entry.agent}`) : null,
        ),
      )
    }

    function Panel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [showSettings, setShowSettings] = React.useState(false)
      const [showDaily, setShowDaily] = React.useState(false)
      const [daily, setDaily] = React.useState(null)
      const [dailyBusy, setDailyBusy] = React.useState(false)
      const [dailyError, setDailyError] = React.useState('')
      const [days, setDays] = React.useState(null)
      const [daysBusy, setDaysBusy] = React.useState(false)
      const [settings, setSettings] = React.useState(null)
      const [settingsError, setSettingsError] = React.useState('')
      const [view, setView] = React.useState(() => {
        try {
          const saved = window.localStorage.getItem('dsh-worklog:view')
          return saved === 'topic' || saved === 'gantt' || saved === 'date' ? saved : 'session'
        } catch {
          return 'session'
        }
      })

      // The range the user is looking at; `null` means "whatever the host says".
      const [range, setRange] = React.useState(null)
      const [picking, setPicking] = React.useState(false)
      const [draft, setDraft] = React.useState({ from: '', to: '' })

      const load = React.useCallback(async (wanted) => {
        const target = wanted === undefined ? range : wanted
        const query = target === null ? '' : `?from=${target.from}&to=${target.to}`
        try {
          const response = await fetch(`${PANEL_ROUTE}${query}`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          setData(payload)
          if (target === null && payload.range) setRange({ from: payload.range.from, to: payload.range.to })
          setError('')
        } catch (failure) {
          setError(`${t('status.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
        }
      }, [t, range])

      /** The day the panel is looking at: a single day means "this day". */
      const focusDate = range !== null && range.from === range.to ? range.from : (data && data.daily ? data.daily.date : '')

      const loadDaily = React.useCallback(async (day) => {
        if (!day) return
        try {
          const response = await fetch(`${DAILY_ROUTE}?date=${day}`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
          setDaily(payload)
          setDailyError('')
        } catch (failure) {
          setDailyError(failure instanceof Error ? failure.message : String(failure))
        }
      }, [])

      const generateDaily = React.useCallback(async (day) => {
        if (!day) return
        setDailyBusy(true)
        setDailyError('')
        try {
          const response = await fetch(DAILY_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ date: day, force: true }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setDaily({ date: day, summary: payload, stale: false, turns: payload.turns ?? null })
        } catch (failure) {
          setDailyError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setDailyBusy(false)
        }
      }, [])

      const loadDays = React.useCallback(async () => {
        setDaysBusy(true)
        try {
          const response = await fetch(DAYS_ROUTE, { credentials: 'same-origin', headers: { accept: 'application/json' } })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
          setDays(Array.isArray(payload.days) ? payload.days : [])
        } catch (failure) {
          setError(`${t('status.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
        } finally {
          setDaysBusy(false)
        }
      }, [t])

      React.useEffect(() => {
        if (showDaily && focusDate) void loadDaily(focusDate)
      }, [showDaily, focusDate, loadDaily])

      React.useEffect(() => {
        if (view === 'date' && days === null) void loadDays()
      }, [view, days, loadDays])

      React.useEffect(() => {
        void load()
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return
          void load()
        }, POLL_MS)
        return () => clearInterval(timer)
      }, [load])

      React.useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 3000)
        return () => clearTimeout(timer)
      }, [notice])

      const toggle = async () => {
        if (busy || !data) return
        const next = !data.enabled
        setBusy(true)
        try {
          const response = await fetch(TOGGLE_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: next }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          setData(payload)
          setError('')
          setNotice(t('toast.saved'))
        } catch (failure) {
          setError(`${t('status.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
        } finally {
          setBusy(false)
        }
      }

      const shiftDay = (delta) => {
        const base = range === null ? (data ? data.range : null) : range
        if (base === null || base === undefined) return
        const move = (day, step) => {
          const date = new Date(`${day}T12:00:00`)
          date.setDate(date.getDate() + step)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const span = (base.to && base.to !== base.from)
          ? Math.max(1, Math.round((new Date(`${base.to}T12:00:00`) - new Date(`${base.from}T12:00:00`)) / 86400000))
          : 1
        const next = { from: move(base.from, delta * span), to: move(base.to || base.from, delta * span) }
        setRange(next)
        void load(next)
      }

      const goToday = () => {
        if (data === null || data.range === undefined) return
        const next = { from: data.today, to: data.today }
        setRange(next)
        void load(next)
      }

      const applyRange = () => {
        if (draft.from === '' || draft.to === '') return
        const next = draft.from <= draft.to ? { ...draft } : { from: draft.to, to: draft.from }
        setRange(next)
        setPicking(false)
        void load(next)
      }

      const openSettings = async () => {
        setShowSettings(true)
        setSettingsError('')
        try {
          const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin' })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          setSettings(payload)
        } catch (failure) {
          setSettingsError(`${t('settings.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
        }
      }

      const saveSettings = async (patch) => {
        setBusy(true)
        setSettingsError('')
        try {
          const response = await fetch(SETTINGS_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          setSettings(payload)
          setNotice(t('toast.saved'))
          await load()
        } catch (failure) {
          setSettingsError(`${t('settings.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
        } finally {
          setBusy(false)
        }
      }

      const pickView = (next) => {
        setView(next)
        try {
          window.localStorage.setItem('dsh-worklog:view', next)
        } catch {
          // A blocked storage only loses the preference, not the view.
        }
      }

      const entries = data && Array.isArray(data.entries) ? data.entries : []
      const topicGroups = groupByTopic(entries, t)
      const groups = view === 'topic' ? topicGroups : groupEntries(entries)
      const topicCount = new Set(entries.map((entry) => (entry.topic || '').toLowerCase().trim()).filter(Boolean)).size
      const untaggedOnly = topicCount === 0 && entries.length > 0
      const count = data ? data.count : 0
      const enabled = Boolean(data && data.enabled)
      const live = data && data.live ? data.live : { tracked: 0, turns: [] }
      const config = data && data.config ? data.config : {}
      const ai = data && data.ai ? data.ai : null
      const engines = []
      const slotName = (slot) => (slot?.model && slot.model !== 'host default' ? slot.model : t('ai.hostDefault'))
      if (ai && ai.primary && ai.primary.enabled) engines.push(`${slotName(ai.primary)}${ai.primary.last && ai.primary.last.error ? ' ✕' : ''}`)
      if (ai && ai.secondary && ai.secondary.enabled) engines.push(`${slotName(ai.secondary)}${ai.secondary.last && ai.secondary.last.error ? ' ✕' : ''}`)

      // The card is built off the tree: a nested ternary here got unreadable fast.
      const dailyCard = showDaily
        ? h('section', { className: 'wl-daily' },
          h('header', { className: 'wl-daily-head' },
            h('h3', null, fmt(t, 'daily.title', { date: focusDate || '—' })),
            h('button', {
              type: 'button',
              className: 'wl-btn wl-btn-primary',
              disabled: dailyBusy || !focusDate,
              onClick: () => { void generateDaily(focusDate) },
            }, dailyBusy ? t('daily.busy') : (daily && daily.summary ? t('daily.regenerate') : t('daily.generate')))),
          daily && daily.stale ? h('p', { className: 'wl-daily-stale' }, t('daily.stale')) : null,
          dailyError ? h('p', { className: 'wl-note', 'data-tone': 'err' }, fmt(t, 'daily.error', { message: dailyError })) : null,
          !daily || !daily.summary
            ? h('p', { className: 'wl-daily-empty' }, t('daily.empty'))
            : h('div', { className: 'wl-daily-body' },
              Object.entries(daily.summary.slots ?? {}).map(([slot, value]) => (value && value.text ? daySlot(t, slot, value) : null))))
        : null

      return h('div', { className: 'wl-root', style: VARS },
        h(Styles, null),
        h('div', { className: 'wl-head' },
          h(TabIcon, null),
          h('span', { className: 'wl-title' }, t('tab.title')),
          h('span', { className: 'wl-count' }, fmt(t, count === 1 ? 'head.countOne' : 'head.count', { n: count })),
          h('div', { className: 'wl-dates' },
            h('button', { type: 'button', className: 'wl-nav', 'aria-label': t('date.prev'), onClick: () => shiftDay(-1) }, '‹'),
            h('button', {
              type: 'button',
              className: 'wl-date',
              title: t('date.pick'),
              onClick: () => {
                const base = range || (data ? data.range : null) || { from: '', to: '' }
                setDraft({ from: base.from || '', to: base.to || base.from || '' })
                setPicking(!picking)
              },
            }, range === null || range.from === range.to
              ? (range ? range.from : (data ? data.range.from : ''))
              : `${range.from} – ${range.to}`),
            h('button', { type: 'button', className: 'wl-nav', 'aria-label': t('date.next'), onClick: () => shiftDay(1) }, '›'),
            h('button', { type: 'button', className: 'wl-btn', onClick: goToday }, t('date.today'))),
          h('button', {
            type: 'button',
            className: 'wl-btn',
            'aria-expanded': picking ? 'true' : 'false',
            onClick: () => {
              const base = range || (data ? data.range : null) || { from: '', to: '' }
              setDraft({ from: base.from || '', to: base.to || base.from || '' })
              setPicking(!picking)
            },
          }, t('date.range')),
        ),
        picking
          ? h('div', { className: 'wl-range' },
            h('label', { className: 'wl-range-row' }, t('date.from'),
              h('input', {
                type: 'date',
                className: 'wl-input',
                value: draft.from,
                onChange: (event) => setDraft({ ...draft, from: event.target.value }),
              })),
            h('label', { className: 'wl-range-row' }, t('date.to'),
              h('input', {
                type: 'date',
                className: 'wl-input',
                value: draft.to,
                onChange: (event) => setDraft({ ...draft, to: event.target.value }),
              })),
            h('button', { type: 'button', className: 'wl-btn', onClick: applyRange }, t('date.apply')),
            h('button', { type: 'button', className: 'wl-btn', onClick: () => setPicking(false) }, t('date.cancel')))
          : null,
        showSettings ? null : h('div', { className: 'wl-bar' },
          h('div', { className: 'wl-views', role: 'group', 'aria-label': t('view.label') },
            h('button', {
              type: 'button',
              className: 'wl-view',
              'aria-pressed': view === 'gantt' ? 'true' : 'false',
              disabled: !data,
              onClick: () => pickView('gantt'),
            }, t('view.gantt')),
            h('button', {
              type: 'button',
              className: 'wl-view',
              'aria-pressed': view === 'session' ? 'true' : 'false',
              disabled: !data,
              onClick: () => pickView('session'),
            }, t('view.session')),
            h('button', {
              type: 'button',
              className: 'wl-view',
              'aria-pressed': view === 'topic' ? 'true' : 'false',
              disabled: !data,
              onClick: () => pickView('topic'),
            }, t('view.topic')),
            h('button', {
              type: 'button',
              className: 'wl-view',
              'aria-pressed': view === 'date' ? 'true' : 'false',
              disabled: !data,
              onClick: () => pickView('date'),
            }, t('view.date')),
          ),
          h('div', { className: 'wl-bar-right' },
            h('button', {
              type: 'button',
              className: 'wl-switch',
              role: 'switch',
              'aria-checked': enabled ? 'true' : 'false',
              'aria-label': t('switch.label'),
              title: `${t('switch.label')} — ${t(enabled ? 'switch.hintOn' : 'switch.hintOff')}`,
              disabled: busy || !data,
              onClick: toggle,
            }),
            h('button', {
              type: 'button',
              className: 'wl-btn',
              disabled: busy,
              onClick: () => { setBusy(true); void load().finally(() => setBusy(false)) },
            }, busy ? t('action.refreshing') : t('action.refresh')),
            h('button', {
              type: 'button',
              className: 'wl-btn',
              'aria-expanded': showDaily ? 'true' : 'false',
              disabled: !data,
              onClick: () => {
                setShowSettings(false)
                setShowDaily(!showDaily)
              },
            }, t('daily.button')),
            h('button', {
              type: 'button',
              className: 'wl-btn',
              'aria-expanded': showSettings ? 'true' : 'false',
              onClick: () => { setShowDaily(false); if (showSettings) setShowSettings(false); else void openSettings() },
            }, t('settings.open')),
          ),
        ),
        showSettings
          ? h(SettingsPanel, { t, settings, error: settingsError, busy, onSave: saveSettings, onClose: () => setShowSettings(false) })
          : null,
        dailyCard,
        notice ? h('p', { className: 'wl-note', 'data-tone': 'ok' }, notice) : null,
        view === 'topic' && untaggedOnly ? h('p', { className: 'wl-note' }, t('topic.hint')) : null,
        error ? h('p', { className: 'wl-note', 'data-tone': 'err' }, `${error}\n${t('status.offline')}`) : null,
        showSettings
          ? null
          : view === 'date'
          ? h('div', { className: 'wl-days' },
            daysBusy && days === null ? h('p', { className: 'wl-daily-empty' }, t('daily.busy')) : null,
            (days ?? []).map((entry) => {
              const stored = entry.slots && Object.keys(entry.slots).length > 0 ? entry.slots : null
              return h('article', { className: 'wl-day', key: entry.date },
                h('header', { className: 'wl-day-head' },
                  h('button', {
                    type: 'button',
                    className: 'wl-day-date',
                    onClick: () => { setRange({ from: entry.date, to: entry.date }); pickView('gantt') },
                  }, entry.date),
                  h('span', { className: 'wl-day-meta' },
                    `${fmt(t, 'daily.turns', { n: entry.turns })} · ${fmt(t, 'gantt.topicCount', { n: entry.topics })}${entry.stale ? ' · 需更新' : ''}`),
                  h('button', {
                    type: 'button',
                    className: 'wl-btn',
                    disabled: dailyBusy,
                    onClick: async () => {
                      setDailyBusy(true)
                      try {
                        const response = await fetch(DAILY_ROUTE, {
                          method: 'POST',
                          credentials: 'same-origin',
                          headers: { 'content-type': 'application/json', accept: 'application/json' },
                          body: JSON.stringify({ date: entry.date, force: true }),
                        })
                        const payload = await response.json().catch(() => ({}))
                        if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
                        await loadDays()
                      } catch (failure) {
                        setError(`${t('status.error')}：${failure instanceof Error ? failure.message : String(failure)}`)
                      } finally {
                        setDailyBusy(false)
                      }
                    },
                  }, stored ? t('daily.regenerate') : t('daily.generate'))),
                stored === null
                  ? h('p', { className: 'wl-daily-empty' }, t('daily.empty'))
                  : h('div', { className: 'wl-daily-body' },
                    Object.entries(stored).map(([slot, value]) => (value && value.text ? daySlot(t, slot, value) : null))))
            }))
          : view === 'gantt'
          ? h(Gantt, { t, entries, day: data ? data.range.from : '', range: data ? data.range : null, mergeGapMinutes: data ? data.mergeGapMinutes : 10, now: data && data.now ? new Date(data.now).getTime() : Date.now(), live })
          : entries.length === 0
          ? h('div', { className: 'wl-list' },
            h('div', { className: 'wl-empty' },
              data ? t('list.empty') : t('status.loading'),
              h('p', { className: 'wl-empty-hint' }, t('list.emptyHint')),
            ),
          )
          : h('div', { className: 'wl-list' },
            groups.map((group) => h('section', { className: 'wl-group', key: group.key || 'notes' },
              h('div', { className: 'wl-group-head' },
                h('span', { className: 'wl-group-title' },
                  view === 'topic'
                    ? group.title
                    : (group.title || (group.key ? `#${group.key.replace(/^session-/, '').slice(0, 8)}` : t('list.notes')))),
                h('span', { className: 'wl-group-meta' },
                  `${group.count > 1 ? `${clock(group.from)}–${clock(group.to)}` : clock(group.to)} · ${fmt(t, 'meta.turns', { n: group.count })}`),
              ),
              view === 'topic' && group.sessions.length > 0
                ? h('div', { className: 'wl-group-sub' },
                  h('span', { className: 'wl-group-k' }, t('group.session')),
                  h('span', { className: 'wl-group-v' },
                    group.sessions.length > 1
                      ? fmt(t, 'group.sessionCount', { n: group.sessions.length })
                      : (group.sessions[0].sessionTitle || '—')),
                  group.topic ? null : h('span', { className: 'wl-group-k' }, t('topic.untaggedWhy')))
                : null,
              group.workspace
                ? h('div', { className: 'wl-group-sub', title: group.workspace },
                  h('span', { className: 'wl-group-k' }, t('group.workspace')),
                  h('span', { className: 'wl-group-v' }, tail(group.workspace, 48)))
                : null,
              group.sessionPath
                ? h('div', { className: 'wl-group-sub', title: group.sessionPath },
                  h('span', { className: 'wl-group-k' }, t('group.sessionFile')),
                  h('span', { className: 'wl-group-v' }, tail(group.sessionPath, 56)))
                : null,
              h('ul', { className: 'wl-group-list' },
                group.entries.map((entry) => h(Item, { key: `${entry.ts}-${entry.sessionId}`, t, entry })),
              ),
            )),
            h('div', { className: 'wl-end' }, fmt(t, 'list.end', { n: entries.length })),
          ),
        showSettings ? null : h('div', { className: 'wl-foot' },
          h('span', { className: 'wl-foot-k' }, t('foot.path')),
          h('span', { className: 'wl-foot-v', title: data ? data.todayFile : '' }, config.storePath || '~/.dsh/worklog'),
          h('span', { className: 'wl-foot-k' }, t('foot.last')),
          h('span', { className: 'wl-foot-v' }, data && data.store && data.store.lastWrite ? data.store.lastWrite.replace('T', ' ').slice(0, 19) : '—'),
          h('span', { className: 'wl-foot-k' }, t('foot.size')),
          h('span', { className: 'wl-foot-v' }, data && data.store ? size(data.store.totalBytes) : '—'),
          h('span', { className: 'wl-foot-k' }, t('ai.label')),
          h('span', { className: 'wl-foot-v' }, engines.length > 0 ? engines.join(' + ') : t('ai.off')),
          // The build marker makes a cached bundle obvious at a glance.
          h('span', { className: 'wl-foot-v', style: { marginLeft: 'auto', opacity: 0.6 } }, `v${VERSION}`),
        ),
      )
    }

    return {
      name: NS,
      version: VERSION,
      inject: ['slots', 'sidebarRightTabs', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, COPY), 'worklog: dictionaries')
        const locale = ctx.locale
        const t = locale.bind(NS)

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => t('tab.title'),
          guide: [{
            id: TAB_ID,
            order: 78,
            title: () => t('tab.title'),
            description: () => t('tab.desc'),
            icon: TabIcon,
          }],
        }), 'worklog: tab type')

        function TabTitle() {
          return t('tab.title')
        }

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
        }, TabTitle)), 'worklog: tab title')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          inject: () => ({ t }),
        }, Panel)), 'worklog: tab body')
      },
    }
  },
})
