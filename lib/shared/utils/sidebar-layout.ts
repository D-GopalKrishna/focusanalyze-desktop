/**
 * Pure logic for the sidebar's project layout: owned projects and the user's project groups.
 *
 * The backend owns the ordering numbers (gap-based, see focusanalyze-mind
 * `apis/services/sidebar_order.py`); this module only decides *where an item should go* from a
 * drop, and applies that to a local tree for the optimistic update. It deliberately has no React
 * or API imports so every drag-and-drop rule can be unit-tested.
 *
 * "Shared with me" projects are not part of this layout; they keep their own list.
 */

export type SidebarGroupInput = { id: number; sidebar_order: number };
export type SidebarProjectInput = { id: number; sidebar_order: number; group: number | null };

/** A top-level node: a group (with its project ids, in order) or an ungrouped project. */
export type LayoutNode =
  | { type: 'group'; id: number; children: number[] }
  | { type: 'project'; id: number };

export type SidebarLayout = LayoutNode[];

export type ItemRef = { type: 'group' | 'project'; id: number };

/** Where a drop landed relative to the row under the pointer. */
export type Placement = 'before' | 'after' | 'into';

/** What to ask the backend for, and what to apply locally. `after: null` means first position. */
export type MoveIntent =
  | { kind: 'project'; id: number; groupId: number | null; after: ItemRef | null }
  | { kind: 'group'; id: number; after: ItemRef | null };

const byOrder = <T extends { sidebar_order: number; id: number }>(a: T, b: T) =>
  a.sidebar_order - b.sidebar_order || a.id - b.id;

/**
 * Build the layout from the API data. Top-level ties are broken the same way the backend does
 * (order, then groups before projects, then id) so the UI never disagrees with the server.
 */
export function buildLayout(
  groups: SidebarGroupInput[],
  projects: SidebarProjectInput[],
): SidebarLayout {
  const groupIds = new Set(groups.map((g) => g.id));
  const childrenByGroup = new Map<number, SidebarProjectInput[]>();
  const loose: SidebarProjectInput[] = [];
  for (const project of projects) {
    if (project.group != null && groupIds.has(project.group)) {
      const list = childrenByGroup.get(project.group) ?? [];
      list.push(project);
      childrenByGroup.set(project.group, list);
    } else {
      loose.push(project);
    }
  }

  const top: { order: number; rank: number; id: number; node: LayoutNode }[] = [];
  for (const group of groups) {
    const children = (childrenByGroup.get(group.id) ?? []).sort(byOrder).map((p) => p.id);
    top.push({
      order: group.sidebar_order,
      rank: 0,
      id: group.id,
      node: { type: 'group', id: group.id, children },
    });
  }
  for (const project of loose) {
    top.push({
      order: project.sidebar_order,
      rank: 1,
      id: project.id,
      node: { type: 'project', id: project.id },
    });
  }
  top.sort((a, b) => a.order - b.order || a.rank - b.rank || a.id - b.id);
  return top.map((t) => t.node);
}

const sameRef = (a: ItemRef | null, b: ItemRef | null) =>
  a === b || (a !== null && b !== null && a.type === b.type && a.id === b.id);

/** The item right before `target` in a sibling list that excludes `exclude`, or null if first. */
function precedingSibling(siblings: ItemRef[], target: ItemRef, exclude: ItemRef): ItemRef | null {
  const list = siblings.filter((s) => !sameRef(s, exclude));
  const idx = list.findIndex((s) => sameRef(s, target));
  return idx > 0 ? list[idx - 1] : null;
}

function topLevelRefs(layout: SidebarLayout): ItemRef[] {
  return layout.map((n) => ({ type: n.type, id: n.id }));
}

function findGroupOfProject(layout: SidebarLayout, projectId: number): number | null {
  for (const node of layout) {
    if (node.type === 'group' && node.children.includes(projectId)) return node.id;
  }
  return null;
}

/**
 * Turn "dragged X onto Y (before/after/into)" into a move intent, or null when the result would
 * be where the item already is (so no request is sent).
 *
 * - A group can only be placed among top-level items; dropping it on a project inside another
 *   group places it relative to that group (groups don't nest).
 * - A project dropped on a group header with `into` goes to the end of that group.
 * - A project dropped on a project inside a group goes into that group at that spot.
 * - A project dropped on a loose project goes to the top level at that spot (so dragging a
 *   project out of its group is just dropping it among the loose ones).
 */
export function resolveMove(
  layout: SidebarLayout,
  active: ItemRef,
  over: ItemRef,
  placement: Placement,
): MoveIntent | null {
  if (active.type === over.type && active.id === over.id) return null;

  let intent: MoveIntent | null;

  if (active.type === 'group') {
    const anchor: ItemRef =
      over.type === 'project' && findGroupOfProject(layout, over.id) != null
        ? { type: 'group', id: findGroupOfProject(layout, over.id)! }
        : over;
    if (anchor.type === 'group' && anchor.id === active.id) return null;
    const top = topLevelRefs(layout);
    const after = placement === 'before' ? precedingSibling(top, anchor, active) : anchor;
    intent = { kind: 'group', id: active.id, after };
  } else if (over.type === 'group') {
    const group = layout.find((n) => n.type === 'group' && n.id === over.id);
    if (!group || group.type !== 'group') return null;
    if (placement === 'into') {
      const kids = group.children.filter((id) => id !== active.id);
      intent = {
        kind: 'project',
        id: active.id,
        groupId: group.id,
        after: kids.length ? { type: 'project', id: kids[kids.length - 1] } : null,
      };
    } else {
      const top = topLevelRefs(layout);
      const after = placement === 'before' ? precedingSibling(top, over, active) : over;
      intent = { kind: 'project', id: active.id, groupId: null, after };
    }
  } else {
    const overGroupId = findGroupOfProject(layout, over.id);
    const siblings: ItemRef[] =
      overGroupId != null
        ? ((layout.find((n) => n.type === 'group' && n.id === overGroupId) as Extract<
            LayoutNode,
            { type: 'group' }
          >).children.map((id) => ({ type: 'project', id }) as ItemRef))
        : topLevelRefs(layout);
    const after = placement === 'before' ? precedingSibling(siblings, over, active) : over;
    intent = { kind: 'project', id: active.id, groupId: overGroupId, after };
  }

  return isNoop(layout, intent) ? null : intent;
}

/** Apply a move to a layout (immutably). Used for the optimistic update. */
export function applyMove(layout: SidebarLayout, intent: MoveIntent): SidebarLayout {
  if (intent.kind === 'group') {
    const moving = layout.find((n) => n.type === 'group' && n.id === intent.id);
    if (!moving) return layout;
    const rest = layout.filter((n) => n !== moving);
    return insertAfter(rest, moving, intent.after);
  }

  // project: remove from wherever it is, then insert at the destination.
  const withoutProject: SidebarLayout = layout
    .filter((n) => !(n.type === 'project' && n.id === intent.id))
    .map((n) =>
      n.type === 'group' && n.children.includes(intent.id)
        ? { ...n, children: n.children.filter((id) => id !== intent.id) }
        : n,
    );

  if (intent.groupId == null) {
    return insertAfter(withoutProject, { type: 'project', id: intent.id }, intent.after);
  }
  return withoutProject.map((n) => {
    if (n.type !== 'group' || n.id !== intent.groupId) return n;
    const children = [...n.children];
    const idx = intent.after ? children.indexOf(intent.after.id) : -1;
    children.splice(idx + 1, 0, intent.id);
    return { ...n, children };
  });
}

function insertAfter(list: SidebarLayout, node: LayoutNode, after: ItemRef | null): SidebarLayout {
  const out = [...list];
  const idx = after ? out.findIndex((n) => n.type === after.type && n.id === after.id) : -1;
  out.splice(idx + 1, 0, node);
  return out;
}

function isNoop(layout: SidebarLayout, intent: MoveIntent): boolean {
  return JSON.stringify(applyMove(layout, intent)) === JSON.stringify(layout);
}

/** Ids of the projects currently shown loose or inside groups, in display order. */
export function flattenProjectIds(layout: SidebarLayout): number[] {
  return layout.flatMap((n) => (n.type === 'group' ? n.children : [n.id]));
}

/**
 * Which part of the row under the pointer a drop landed in. `ratio` is the pointer's vertical
 * position within that row (0 = top edge, 1 = bottom edge).
 *
 * - A project over a group header: top quarter = place before the group, bottom quarter of a
 *   *collapsed* group = place after it, everything else = into the group.
 * - Anything else: upper half = before, lower half = after.
 */
export function placementFor(
  active: ItemRef,
  over: ItemRef,
  ratio: number,
  overGroupCollapsed: boolean,
): Placement {
  if (active.type === 'project' && over.type === 'group') {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75 && overGroupCollapsed) return 'after';
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
}

/** Where to draw the drop marker: on which row, and as a line before/after it or a ring around it. */
export type DropIndicator = { target: ItemRef; placement: Placement };

/**
 * The marker for a drop, or null when dropping there would change nothing (so nothing is drawn
 * and no request will be sent). Groups don't nest, so a group dragged over a project that lives
 * in another group is marked on that parent group, matching where it will actually land.
 */
export function dropIndicator(
  layout: SidebarLayout,
  active: ItemRef,
  over: ItemRef,
  placement: Placement,
): DropIndicator | null {
  if (!resolveMove(layout, active, over, placement)) return null;
  if (active.type === 'group' && over.type === 'project') {
    const parent = findGroupOfProject(layout, over.id);
    if (parent != null) return { target: { type: 'group', id: parent }, placement };
  }
  return { target: over, placement };
}

/** One entry in a "Move..." menu: what to show, and the move to ask for if it is picked. */
export type MoveOption =
  | { kind: 'up' | 'down' | 'out'; intent: MoveIntent }
  | { kind: 'into'; groupId: number; intent: MoveIntent };

/**
 * The moves a touch UI (no drag gesture) can offer for one item: up, down, out of its group, and
 * into any other group. Every option is computed with `resolveMove`, so touch and drag follow the
 * same rules, and options that would change nothing are left out. Order: up, down, out, then
 * `into` per group (in the order given).
 */
export function availableMoves(
  layout: SidebarLayout,
  item: ItemRef,
  groupIds: number[] = [],
): MoveOption[] {
  const parentId = item.type === 'project' ? findGroupOfProject(layout, item.id) : null;
  const siblings: ItemRef[] =
    parentId != null
      ? (
          layout.find((n) => n.type === 'group' && n.id === parentId) as Extract<
            LayoutNode,
            { type: 'group' }
          >
        ).children.map((id) => ({ type: 'project', id }) as ItemRef)
      : topLevelRefs(layout);

  const index = siblings.findIndex((s) => sameRef(s, item));
  if (index === -1) return [];

  const options: MoveOption[] = [];
  const push = (kind: 'up' | 'down' | 'out', over: ItemRef | undefined, placement: Placement) => {
    if (!over) return;
    const intent = resolveMove(layout, item, over, placement);
    if (intent) options.push({ kind, intent });
  };

  push('up', siblings[index - 1], 'before');
  push('down', siblings[index + 1], 'after');
  if (parentId != null) push('out', { type: 'group', id: parentId }, 'after');

  if (item.type === 'project') {
    for (const groupId of groupIds) {
      if (groupId === parentId) continue;
      const intent = resolveMove(layout, item, { type: 'group', id: groupId }, 'into');
      if (intent) options.push({ kind: 'into', groupId, intent });
    }
  }
  return options;
}
