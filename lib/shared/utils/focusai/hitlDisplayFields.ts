import { formatApprovalDatetime } from "@shared/utils/focusai/formatApprovalDatetime";

export type HitlDisplayField = { label: string; value: string };

/** Args keys that are internal / not useful on the approval card. */
const HIDDEN_APPROVAL_ARG_KEYS = new Set([
  'user_id',
  '_resolved_fields',
  'task_labels',
  // Display-only enrichments — shown via dedicated rows, not as raw keys.
  'life_area_name',
  'project_name',
  'project_access_summary',
  'task_name',
  'event_name',
  'category_name',
  'task_type_name',
  'priority_name',
  'event_labels',
  '_confirmed_skip_task_link',
  '_confirmed_task_ids',
]);

export function publicApprovalArgs(args: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (HIDDEN_APPROVAL_ARG_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** "a, b, c" for up to `max` items, then "a, b, +N more". */
function joinWithMore(items: string[], max: number): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')}, +${items.length - max} more`;
}

/** Human-readable summary of an RRULE body for the approval card — the user needs to see
 * "Recurs: Daily" (or similar) *before* approving, not just discover it after the fact by
 * opening the created event. Deliberately independent of the fuller Calendar-side
 * `getRepeatLabelFromRule` (components/dashboard/calendar/components/quick-event-dialog.tsx),
 * which needs the event's own start date for weekday/month-day phrasing this compact
 * pre-approval summary doesn't need. */
function describeRecurrenceRuleForApproval(rule: unknown): string | null {
  if (typeof rule !== 'string' || !rule.trim()) return null;
  const upper = rule.toUpperCase();
  const interval = upper.match(/INTERVAL=(\d+)/)?.[1];
  if (upper.startsWith('FREQ=DAILY')) {
    return interval && interval !== '1' ? `Every ${interval} days` : 'Daily';
  }
  if (upper.startsWith('FREQ=WEEKLY')) {
    if (upper.includes('BYDAY=MO,TU,WE,TH,FR')) return 'Every weekday (Mon–Fri)';
    const byday = upper.match(/BYDAY=([A-Z,]+)/)?.[1];
    if (byday) return `Weekly on ${byday.split(',').join(', ')}`;
    return interval && interval !== '1' ? `Every ${interval} weeks` : 'Weekly';
  }
  if (upper.startsWith('FREQ=MONTHLY')) return interval && interval !== '1' ? `Every ${interval} months` : 'Monthly';
  if (upper.startsWith('FREQ=YEARLY')) return 'Annually';
  return 'Custom recurrence';
}

/** Strip tags for HITL preview; never dump TipTap HTML into the approval card. */
function plainTextFromHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDescriptionForApproval(description: unknown): string | null {
  if (description === undefined || description === null || description === '') return null;
  const raw = String(description);
  if (!raw.includes('<')) {
    return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw;
  }
  const isTaskList =
    /data-type=["']taskList["']/i.test(raw) || /data-type=["']taskItem["']/i.test(raw);
  if (isTaskList) {
    const items: string[] = [];
    const itemRe = /data-type=["']taskItem["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRe.exec(raw)) !== null) {
      const text = plainTextFromHtml(match[1] || '').trim();
      if (text) items.push(text);
    }
    if (items.length) {
      const preview = items
        .slice(0, 8)
        .map((t) => `• ${t}`)
        .join('\n');
      const more = items.length > 8 ? `\n(+${items.length - 8} more)` : '';
      return `Checklist (${items.length}):\n${preview}${more}`;
    }
  }
  const plain = plainTextFromHtml(raw);
  if (!plain) return null;
  return plain.length > 280 ? `${plain.slice(0, 277)}…` : plain;
}

function humanizeArgKey(key: string): string {
  const withoutId = key.replace(/_id$/, '');
  const spaced = withoutId.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatArgValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
      return value.map((v) => String(v)).join(', ');
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .slice(0, 8)
      .map(([k, v]) => `${humanizeArgKey(k)}: ${formatArgValue(v)}`);
    return entries.join(' · ');
  }
  return String(value);
}

/** Last-resort human rows when no tool-specific extractor produced fields. Never JSON. */
export function genericDisplayFields(args: Record<string, unknown>): HitlDisplayField[] {
  const fields: HitlDisplayField[] = [];
  for (const [key, value] of Object.entries(args)) {
    const formatted = formatArgValue(value);
    if (!formatted) continue;
    fields.push({ label: humanizeArgKey(key), value: formatted });
  }
  return fields;
}

/**
 * Human-readable label/value rows for a HITL propose tool.
 * Falls back to {@link genericDisplayFields} so the approval card never dumps raw JSON.
 */
export function extractDisplayFields(
  name: string,
  args: Record<string, any>,
  userTimezone?: string | null,
): HitlDisplayField[] {
  const formatDatetime = (value: string | null | undefined) =>
    formatApprovalDatetime(value, userTimezone);
  const fields: HitlDisplayField[] = [];

  const push = (label: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      fields.push({ label, value: String(value) });
    }
  };

  const resolvedRows: Array<Record<string, any>> = Array.isArray(args._resolved_fields)
    ? args._resolved_fields
    : [];
  const shownResolved = new Set<string>();
  const takeResolved = (field: string): string | undefined => {
    const row = resolvedRows.find((r) => r && r.field === field);
    if (row?.label) {
      shownResolved.add(field);
      return String(row.label);
    }
    return undefined;
  };

  const pushNamedRef = (
    label: string,
    opts: {
      name?: unknown;
      id?: unknown;
      resolvedField?: string;
      fallbackId?: unknown;
    },
  ) => {
    const fromResolved = opts.resolvedField ? takeResolved(opts.resolvedField) : undefined;
    if (opts.name) {
      if (opts.resolvedField) shownResolved.add(opts.resolvedField);
      push(label, opts.name);
      return;
    }
    if (fromResolved) {
      push(label, fromResolved);
      return;
    }
    const id = opts.id ?? opts.fallbackId;
    if (id !== undefined && id !== null && id !== '') push(label, `#${id}`);
  };

  const pushLifeAreaRef = () => {
    pushNamedRef('Life area', {
      name: args.life_area_name,
      id: args.life_area_id,
      resolvedField: 'life_area',
    });
  };

  const pushRemainingResolved = (skipFields: Set<string> = new Set()) => {
    for (const row of resolvedRows) {
      if (!row || typeof row !== 'object') continue;
      const field = String(row.field ?? '');
      if (!field || shownResolved.has(field) || skipFields.has(field)) continue;
      shownResolved.add(field);
      const isTaskType = field === 'task_type' || field === 'task_type_id';
      const fieldLabel =
        field === 'status_id'
          ? 'Column'
          : field === 'project'
            ? 'Project'
            : field === 'track'
              ? 'Track'
              : field === 'parent'
                ? 'Parent task'
                : field === 'subtasks'
                  ? 'Subtasks'
                  : field === 'task'
                    ? 'Task'
                    : field === 'event'
                      ? 'Event'
                      : field === 'life_area'
                        ? 'Life area'
                        : field === 'category'
                          ? 'Category'
                          : isTaskType
                            ? 'Task type'
                            : field === 'priority'
                              ? 'Priority'
                              : String(row.field ?? 'Field');
      const valueLabel = String(row.label ?? '');
      // Remapping / FK internals stay off the card; show the type name only.
      if (isTaskType) {
        const suffix = row.source === 'default' ? ' (default)' : '';
        push(fieldLabel, `${valueLabel}${suffix}`.trim());
        continue;
      }
      const source = row.source ? ` (${row.source})` : '';
      const note = row.note ? ` — ${row.note}` : '';
      push(fieldLabel, `${valueLabel}${source}${note}`.trim());
    }
  };

  if (name.includes('event')) {
    const patch = args.patch && typeof args.patch === 'object' ? args.patch : null;
    push('Name', patch?.name ?? args.name);
    const start = patch?.start_datetime ?? args.start_datetime;
    const end = patch?.end_datetime ?? args.end_datetime;
    const allDay = patch?.is_all_day ?? args.is_all_day;
    if (allDay) {
      push('Date', formatDatetime(start)?.split(',')[0]);
      push('All day', 'Yes');
    } else {
      push('Start', formatDatetime(start));
      push('End', formatDatetime(end));
    }
    const recursLabel = describeRecurrenceRuleForApproval(patch?.recurrence_rule ?? args.recurrence_rule);
    if (recursLabel) push('Recurs', recursLabel);
    const eventDesc = formatDescriptionForApproval(patch?.description ?? args.description);
    if (eventDesc) push('Description', eventDesc);
    // 'type' is the REST/patch field name; propose_create_event_tool's own arg is
    // 'event_type' (avoids shadowing the JS/Python built-in) — check both.
    push('Type', patch?.type ?? patch?.event_type ?? args.type ?? args.event_type);
    pushNamedRef('Event', {
      name: args.event_name,
      id: args.event_id,
      resolvedField: 'event',
    });
    pushNamedRef('Linked task', {
      name: args.task_name,
      id: args.task_id ?? patch?.task_id,
      resolvedField: 'task',
    });
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id ?? patch?.project_id,
      resolvedField: 'project',
    });
    pushNamedRef('Category', {
      name: args.category_name,
      resolvedField: 'category',
    });
    pushLifeAreaRef();
    if (Array.isArray(args.records) && args.records.length) {
      const records = args.records as Array<Record<string, any>>;
      const names = records.map((r) => r?.name).filter((n): n is string => Boolean(n));
      if (names.length) {
        push('Events', `${records.length} event(s): ${joinWithMore(names, 5)}`);
      } else {
        const changedFields = Array.from(
          new Set(records.flatMap((r) => Object.keys(r ?? {}).filter((k) => k !== 'id'))),
        );
        push('Events', `${records.length} event(s)`);
        if (changedFields.length) push('Fields', changedFields.join(', '));
      }
    }
    if (Array.isArray(args.ids) && args.ids.length) {
      const labels = Array.isArray(args.event_labels)
        ? (args.event_labels as Array<{ id?: number; name?: string }>)
            .map((row) => row?.name)
            .filter((n): n is string => Boolean(n))
        : [];
      push('Events', labels.length ? joinWithMore(labels, 8) : args.ids.map((id: number) => `#${id}`).join(', '));
    }
    pushRemainingResolved(new Set(['start_datetime', 'end_datetime', 'recurrence_rule', 'event_type', 'type']));
  } else if (
    name.includes('task') &&
    !name.includes('comment') &&
    !name.includes('priority') &&
    !name.includes('type')
  ) {
    // Nested subtasks / parent-only create render via HitlTaskProposalBody — skip flat lines.
    const structuredCreate =
      name === 'propose_create_task_tool' &&
      ((Array.isArray(args.subtasks) && args.subtasks.length > 0) ||
        (args.parent != null && args.parent !== ''));
    if (!structuredCreate) {
      push('Name', args.name);
      const taskDesc = formatDescriptionForApproval(args.description);
      if (taskDesc) push('Description', taskDesc);
    } else {
      // Name/parent/subtasks rendered by HitlTaskProposalBody; keep description + meta.
      const taskDesc = formatDescriptionForApproval(args.description);
      if (taskDesc) push('Description', taskDesc);
    }
    push('Due date', formatDatetime(args.due_date));
    if (args.project_name || args.project_access_summary) {
      const access = args.project_access_summary ? ` · ${args.project_access_summary}` : '';
      shownResolved.add('project');
      push('Project', `${args.project_name ?? 'Project'}${access}`);
    } else {
      pushNamedRef('Project', {
        name: args.project_name,
        id: args.project_id,
        resolvedField: 'project',
      });
    }
    pushNamedRef('Category', {
      name: args.category_name,
      resolvedField: 'category',
    });
    if (Array.isArray(args.message_attachment_ids) && args.message_attachment_ids.length) {
      push('Attach files', `Message attachment IDs: ${args.message_attachment_ids.join(', ')}`);
    }
    if (Array.isArray(args.records) && args.records.length) {
      const records = args.records as Array<Record<string, any>>;
      const isCreate = records.some((r) => r?.name !== undefined);
      if (isCreate) {
        const names = records.map((r) => r?.name).filter((n): n is string => Boolean(n));
        const parented = records.filter((r) => r?.parent != null && r.parent !== '').length;
        const label =
          parented > 0
            ? `${records.length} task(s) (${parented} as subtasks): ${joinWithMore(names, 5)}`
            : `${records.length} task(s): ${joinWithMore(names, 5)}`;
        push('Tasks', label);
      } else {
        const changedFields = Array.from(
          new Set(records.flatMap((r) => Object.keys(r ?? {}).filter((k) => k !== 'id'))),
        );
        push('Tasks', `${records.length} task(s)`);
        if (changedFields.length) push('Fields', changedFields.join(', '));
      }
    }
    const skipTaskResolved = new Set<string>();
    if (Array.isArray(args.subtasks) && args.subtasks.length) skipTaskResolved.add('subtasks');
    if (args.parent != null && args.parent !== '' && name === 'propose_create_task_tool') {
      skipTaskResolved.add('parent');
    }
    pushNamedRef('Task', {
      name: args.task_name,
      id: args.task_id,
      resolvedField: 'task',
    });
    pushRemainingResolved(skipTaskResolved);
    if (args.patch?.name) push('New name', args.patch.name);
    const patchDesc = formatDescriptionForApproval(args.patch?.description);
    if (patchDesc) push('Description', patchDesc);
    if (args.patch?.due_date) push('Due date', formatDatetime(args.patch.due_date));
    if (Array.isArray(args.task_ids)) {
      const labels = Array.isArray(args.task_labels)
        ? (args.task_labels as Array<{ id?: number; name?: string }>)
            .map((row) => row?.name)
            .filter((n): n is string => Boolean(n))
        : [];
      push(
        'Tasks',
        labels.length ? joinWithMore(labels, 8) : args.task_ids.map((id: number) => `#${id}`).join(', '),
      );
    }
  } else if (name.includes('comment')) {
    push('Comment', args.content);
    pushNamedRef('Task', {
      name: args.task_name,
      id: args.task_id,
      resolvedField: 'task',
    });
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id,
      resolvedField: 'project',
    });
    pushNamedRef('Category', {
      name: args.category_name,
      resolvedField: 'category',
    });
    pushRemainingResolved();
  } else if (name.includes('capacity')) {
    push('Scope', args.scope);
    push('Period', args.period_start);
    if (args.target_hours != null) push('Hours', args.target_hours);
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id,
      resolvedField: 'project',
    });
    pushLifeAreaRef();
  } else if (name.includes('life_area')) {
    pushLifeAreaRef();
    // Update/delete carry life_area_id; create uses Name for the new area title.
    if (args.life_area_id != null && args.name) push('New name', args.name);
    else push('Name', args.name);
    push('Color', args.color);
    if (args.sidebar_order != null) push('Sidebar order', args.sidebar_order);
    const lifeDesc = formatDescriptionForApproval(args.description);
    if (lifeDesc) push('Description', lifeDesc);
    if (args.patch?.name) push('New name', args.patch.name);
    if (args.patch?.color) push('Color', args.patch.color);
    if (args.patch?.sidebar_order != null) push('Sidebar order', args.patch.sidebar_order);
    const lifePatchDesc = formatDescriptionForApproval(args.patch?.description);
    if (lifePatchDesc) push('Description', lifePatchDesc);
  } else if (name.includes('priority')) {
    push('Name', args.name);
    push('Level', args.level);
    push('Color', args.color);
    push('Icon', args.icon);
    pushNamedRef('Priority', {
      name: args.priority_name,
      id: args.priority_id,
      resolvedField: 'priority',
    });
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id,
      resolvedField: 'project',
    });
    pushNamedRef('Category', {
      name: args.category_name,
      resolvedField: 'category',
    });
    pushRemainingResolved();
  } else if (name.includes('task_type')) {
    push('Name', args.name);
    push('Color', args.color);
    push('Icon', args.icon);
    if (args.order != null) push('Order', args.order);
    pushNamedRef('Task type', {
      name: args.task_type_name,
      id: args.task_type_id,
      resolvedField: 'task_type',
    });
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id,
      resolvedField: 'project',
    });
    pushNamedRef('Category', {
      name: args.category_name,
      resolvedField: 'category',
    });
    pushRemainingResolved();
  } else if (name.includes('project')) {
    push('Name', args.name);
    push('Acronym', args.unique_acronym);
  } else if (name.includes('notification')) {
    push('Status', args.status);
    push('Action', args.action);
    if (args.notification_id) push('Notification', `#${args.notification_id}`);
    if (Array.isArray(args.notification_ids))
      push(
        'Notifications',
        args.notification_ids.map((id: number) => `#${id}`).join(', '),
      );
    push('Filter', args.status_filter);
  } else if (name.includes('track')) {
    push('Name', args.patch?.name ?? args.name);
    const trackDesc = formatDescriptionForApproval(args.patch?.description ?? args.description);
    if (trackDesc) push('Description', trackDesc);
    if (args.track_id) push('Track', `#${args.track_id}`);
    pushNamedRef('Project', {
      name: args.project_name,
      id: args.project_id,
      resolvedField: 'project',
    });
    pushRemainingResolved();
  } else if (name.includes('habit')) {
    push('Name', args.name);
    push('Cadence', args.cadence_type);
    pushLifeAreaRef();
    if (Array.isArray(args.weekdays) && args.weekdays.length) {
      push('Weekdays', args.weekdays.join(', '));
    }
    push('Times per week', args.times_per_week);
    push('Every N days', args.interval_days);
    push('Difficulty', args.difficulty);
    push('Estimated hours', args.estimated_hours);
    push('Notes', args.notes);
    if (args.habit_id != null) {
      const habitIdNum = Number(args.habit_id);
      // A real id is a finite number; anything else (e.g. a placeholder the model
      // invented for a habit that doesn't exist yet — see HABIT + EXPLICIT TIME RULE)
      // should read as "the one above", not a raw "#garbage-token".
      push('Habit', Number.isFinite(habitIdNum) ? `#${habitIdNum}` : 'The habit created above');
    }
    push('Status', args.status);
    push('Date', args.local_date);
  } else if (
    name.includes('plan_blocks') ||
    name.includes('save_plan_draft') ||
    name.includes('commit_plan')
  ) {
    const records = Array.isArray(args.records)
      ? args.records
      : Array.isArray(args.blocks)
        ? args.blocks
        : [];
    const isDraftSave = name.includes('save_plan_draft');
    push('Scope', args.scope);
    push('Period', args.period_start ?? args.anchor_date);
    if (isDraftSave && records.length === 0) {
      push('Draft', 'Clear draft for this period');
    } else {
      push(
        'Blocks',
        `${records.length} calendar block${records.length === 1 ? '' : 's'}${
          name.includes('commit_plan') ? ' → calendar' : ''
        }`,
      );
      // Per-block rows are rendered as tiles by PlanBlocksHitlList (see planBlockRowsForAction
      // in planBlocksHitl.ts) instead of flat "Block N: ..." text here.
    }
  } else if (name.includes('dismiss_plan')) {
    push('Scope', args.scope);
    push('Period', args.anchor_date ?? args.period_start);
  } else if (name.includes('journal')) {
    push('Date', args.journal_date ?? args.anchor_date);
    push('Note', args.note);
  } else if (name.includes('daily_report') || name.includes('generate_daily_report')) {
    push('Date', args.report_date ?? args.date);
    if (args.notify !== undefined) push('Notify', args.notify ? 'Yes' : 'No');
  } else if (name.includes('weekly_report') || name.includes('generate_weekly_report')) {
    push('Week of', args.report_date ?? args.date);
    if (args.notify !== undefined) push('Notify', args.notify ? 'Yes' : 'No');
  } else if (name.includes('monthly_report') || name.includes('generate_monthly_report')) {
    push('Month', args.report_date ?? args.date);
    if (args.notify !== undefined) push('Notify', args.notify ? 'Yes' : 'No');
  } else if (
    name.includes('organization') ||
    name.includes('user_to_team') ||
    name.includes('team_admin')
  ) {
    if (args.organization_id != null) push('Organization', `#${args.organization_id}`);
    if (args.organization_group_id != null) push('Team', `#${args.organization_group_id}`);
    push('Name', args.name);
    push('Email', args.email);
    if (args.target_user_id != null) push('User', `#${args.target_user_id}`);
  }

  if (fields.length > 0) return fields;
  return genericDisplayFields(publicApprovalArgs(args));
}
