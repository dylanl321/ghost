# Achievement Engine Architecture

## The Core Idea

Every achievement is a **pure function**: given a stream of events and some accumulated state, it returns `true` or `false`. The app code never knows achievements exist — it just emits events. The engine listens, evaluates, and awards.

```
App Code  ──emit──▶  Event Bus  ──fan-out──▶  Achievement Engine  ──award──▶  Store
                                                    │
                                              reads badge rules
                                              from badges.yaml
```

Three things make this work:

1. **App code only emits events.** It never imports the achievement system.
2. **Badge rules are declarative.** Adding a badge means adding YAML, not touching app code.
3. **The engine is a single subscriber.** One place evaluates all badges. No scattered if-statements.

---

## Part 1: The Event Bus

A lightweight pub/sub that any part of the app can call. This is the only thing the rest of the codebase touches.

```typescript
// src/lib/events.ts

type EventPayload = Record<string, any>;
type EventHandler = (event: AppEvent) => void;

interface AppEvent {
  type: string;
  timestamp: number;
  userId: string;
  payload: EventPayload;
}

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private globalHandlers: Set<EventHandler> = new Set();

  on(type: string, handler: EventHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)!.delete(handler);
  }

  onAny(handler: EventHandler) {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  emit(type: string, userId: string, payload: EventPayload = {}) {
    const event: AppEvent = { type, timestamp: Date.now(), userId, payload };
    this.handlers.get(type)?.forEach(h => h(event));
    this.globalHandlers.forEach(h => h(event));
  }
}

export const events = new EventBus();
```

Usage in app code is one line. The developer doesn't need to know what achievements exist:

```typescript
// In any component, service, or handler:
events.emit('page.visited', userId, { page: '/cost-explorer' });
events.emit('account.favorited', userId, { accountId: '123456789' });
events.emit('export.completed', userId, { format: 'csv' });
events.emit('ai.chat.sent', userId, { message: 'Why is S3 so expensive?' });
events.emit('filter.applied', userId, { page: '/resources', filter: 'tag:env=prod' });
```

---

## Part 2: The Badge Rule Schema

Extend `badges.yaml` so each badge carries its own trigger logic. The rules are declarative — the engine interprets them, no code per badge.

### Rule Types

There are four rule types that cover every badge we have:

| Rule Type | What It Does | Example |
|---|---|---|
| `event_count` | Fires after N occurrences of an event | "Used filters on 5 pages" |
| `unique_count` | Fires after N unique values of a payload field | "Accessed 10 accounts" |
| `event_once` | Fires on first occurrence of an event | "Favorited an account" |
| `condition` | Fires when a custom condition key is met | "Logged in after 30 days" |

### How Rules Look in YAML

```yaml
- id: filter-fiend
  name: Filter Fiend
  # ... display fields ...
  rule:
    type: unique_count
    event: filter.applied
    field: page
    threshold: 5

- id: account-connoisseur
  name: Account Connoisseur
  rule:
    type: unique_count
    event: account.viewed
    field: accountId
    threshold: 10

- id: favorite-fan
  name: Favorite Fan
  rule:
    type: event_once
    event: account.favorited

- id: exporter
  name: Exporter
  rule:
    type: unique_count
    event: export.completed
    field: format
    threshold: 3

- id: night-owl
  name: Night Owl
  rule:
    type: condition
    key: used_between_midnight_and_5am

- id: speed-run
  name: Speed Run
  rule:
    type: condition
    key: visited_10_pages_in_60_seconds
```

`event_count`, `unique_count`, and `event_once` are fully automatic — the engine handles them with zero custom code. `condition` is the escape hatch for badges that need logic you can't express declaratively (time-of-day checks, multi-event correlations, external data). Conditions are evaluated by small, isolated checker functions registered with the engine.

---

## Part 3: The Achievement Engine

One module. Subscribes to the event bus, tracks progress, awards badges.

```typescript
// src/lib/achievements/engine.ts

import { events, type AppEvent } from '../events';
import type { BadgeRule, BadgeDefinition } from './types';

interface UserProgress {
  counts: Record<string, number>;            // event_count tracking
  uniques: Record<string, Set<string>>;      // unique_count tracking
  seen: Set<string>;                         // event_once tracking
  awarded: Set<string>;                      // already earned badges
}

type ConditionChecker = (userId: string, event: AppEvent) => boolean | Promise<boolean>;

class AchievementEngine {
  private badges: BadgeDefinition[] = [];
  private progress: Map<string, UserProgress> = new Map();
  private conditions: Map<string, ConditionChecker> = new Map();
  private onAward: ((userId: string, badge: BadgeDefinition) => void) | null = null;

  /** Load badge definitions (from parsed YAML) */
  init(badges: BadgeDefinition[], opts?: { onAward?: typeof this.onAward }) {
    this.badges = badges;
    this.onAward = opts?.onAward ?? null;
    events.onAny((event) => this.evaluate(event));
  }

  /** Register a condition checker for `condition`-type rules */
  registerCondition(key: string, checker: ConditionChecker) {
    this.conditions.set(key, checker);
  }

  /** Load a user's existing progress from the database */
  loadUser(userId: string, saved: SavedProgress) {
    this.progress.set(userId, {
      counts: saved.counts ?? {},
      uniques: Object.fromEntries(
        Object.entries(saved.uniques ?? {}).map(([k, v]) => [k, new Set(v)])
      ),
      seen: new Set(saved.seen ?? []),
      awarded: new Set(saved.awarded ?? []),
    });
  }

  private getProgress(userId: string): UserProgress {
    if (!this.progress.has(userId)) {
      this.progress.set(userId, {
        counts: {}, uniques: {}, seen: new Set(), awarded: new Set()
      });
    }
    return this.progress.get(userId)!;
  }

  private async evaluate(event: AppEvent) {
    const progress = this.getProgress(event.userId);

    for (const badge of this.badges) {
      if (progress.awarded.has(badge.id)) continue;
      if (!badge.rule) continue;

      const earned = await this.checkRule(badge.rule, event, progress);
      if (earned) {
        progress.awarded.add(badge.id);
        this.onAward?.(event.userId, badge);
      }
    }
  }

  private async checkRule(
    rule: BadgeRule, event: AppEvent, progress: UserProgress
  ): Promise<boolean> {
    switch (rule.type) {
      case 'event_once': {
        if (event.type !== rule.event) return false;
        progress.seen.add(rule.event);
        return true;
      }

      case 'event_count': {
        if (event.type !== rule.event) return false;
        const key = `count:${rule.event}`;
        progress.counts[key] = (progress.counts[key] ?? 0) + 1;
        return progress.counts[key] >= rule.threshold;
      }

      case 'unique_count': {
        if (event.type !== rule.event) return false;
        const ukey = `unique:${rule.event}:${rule.field}`;
        if (!progress.uniques[ukey]) progress.uniques[ukey] = new Set();
        const value = event.payload[rule.field];
        if (value != null) progress.uniques[ukey].add(String(value));
        return progress.uniques[ukey].size >= rule.threshold;
      }

      case 'condition': {
        const checker = this.conditions.get(rule.key);
        if (!checker) return false;
        return checker(event.userId, event);
      }

      default:
        return false;
    }
  }

  getUserBadges(userId: string): string[] {
    return [...(this.getProgress(userId).awarded)];
  }
}

export const achievements = new AchievementEngine();
```

---

## Part 4: Condition Checkers (The Escape Hatch)

For badges that can't be expressed as simple counts, register small isolated functions. Each one is a self-contained file — easy to add, easy to test, impossible to break other badges.

```typescript
// src/lib/achievements/conditions/night-owl.ts
import { achievements } from '../engine';

achievements.registerCondition('used_between_midnight_and_5am', (userId, event) => {
  const hour = new Date(event.timestamp).getHours();
  return hour >= 0 && hour < 5;
});
```

```typescript
// src/lib/achievements/conditions/speed-run.ts
import { achievements } from '../engine';

const recentPages: Map<string, number[]> = new Map();

achievements.registerCondition('visited_10_pages_in_60_seconds', (userId, event) => {
  if (event.type !== 'page.visited') return false;
  const now = event.timestamp;
  const times = recentPages.get(userId) ?? [];
  times.push(now);
  // Keep only last 60 seconds
  const recent = times.filter(t => now - t <= 60_000);
  recentPages.set(userId, recent);
  return recent.length >= 10;
});
```

```typescript
// src/lib/achievements/conditions/the-return.ts
import { achievements } from '../engine';

achievements.registerCondition('inactive_30_days_then_login', (userId, event) => {
  if (event.type !== 'session.started') return false;
  const lastActive = event.payload.previousSessionTimestamp;
  if (!lastActive) return false;
  const daysSince = (event.timestamp - lastActive) / (1000 * 60 * 60 * 24);
  return daysSince >= 30;
});
```

```typescript
// src/lib/achievements/conditions/philosopher.ts
import { achievements } from '../engine';

const nonWorkPatterns = [
  /meaning of life/i, /tell me a joke/i, /who are you/i,
  /what('s| is) your (name|favorite)/i, /can you (sing|rap|dance)/i,
  /how are you/i, /are you sentient/i, /what is love/i,
];

achievements.registerCondition('ai_non_work_question', (userId, event) => {
  if (event.type !== 'ai.chat.sent') return false;
  const msg = event.payload.message ?? '';
  return nonWorkPatterns.some(p => p.test(msg));
});
```

---

## Part 5: Wiring It Up

### Bootstrap (runs once at app start)

```typescript
// src/lib/achievements/index.ts

import { achievements } from './engine';
import badgeData from '../../docs/badges.yaml';

// Register condition checkers — each file self-registers on import
import './conditions/night-owl';
import './conditions/speed-run';
import './conditions/the-return';
import './conditions/philosopher';
import './conditions/mobile-scout';
import './conditions/ctrl-z';
import './conditions/early-adopter';

achievements.init(badgeData.badges, {
  onAward: async (userId, badge) => {
    // 1. Persist to database
    await db.userBadges.create({ userId, badgeId: badge.id, awardedAt: new Date() });

    // 2. Show toast notification (if the user is online)
    notifications.send(userId, {
      type: 'badge_earned',
      title: badge.name,
      icon: badge.icon,
      color: badge.color,
    });
  }
});

export { achievements };
```

### Instrumenting App Code

The app code just emits events. Here's how it looks in practice across different parts of the app:

```typescript
// Router / navigation middleware
router.afterEach((to) => {
  events.emit('page.visited', currentUser.id, { page: to.path });
});

// Account service
async function viewAccount(accountId: string) {
  const data = await api.getAccount(accountId);
  events.emit('account.viewed', currentUser.id, { accountId });
  return data;
}

// Favorites
async function favoriteAccount(accountId: string) {
  await api.favoriteAccount(accountId);
  events.emit('account.favorited', currentUser.id, { accountId });
}

// Export handler
async function exportData(format: 'csv' | 'json' | 'pdf') {
  const blob = await generateExport(format);
  events.emit('export.completed', currentUser.id, { format });
  return blob;
}

// AI chat
async function sendChatMessage(message: string) {
  const response = await ai.chat(message);
  events.emit('ai.chat.sent', currentUser.id, { message });
  return response;
}

// Keyboard shortcut handler
function handleShortcut(shortcut: string) {
  executeShortcut(shortcut);
  events.emit('shortcut.used', currentUser.id, { shortcut });
}

// Feedback form
async function submitFeedback(text: string) {
  await api.submitFeedback(text);
  events.emit('feedback.submitted', currentUser.id, {});
}
```

Notice: **none of these functions import or reference the achievement system**. They emit a typed event and move on. The engine picks it up independently.

---

## Part 6: Adding a New Badge (The Whole Process)

Adding a badge is 1-2 files and zero changes to existing app code.

### Scenario: "Tag Master" — Applied tags to resources in 3 different accounts

**Step 1:** Add to `badges.yaml`

```yaml
- id: tag-master
  name: Tag Master
  description: Applied tags to resources in 3 different accounts
  hint: Organization starts with labels.
  category: discovery
  hidden: false
  icon: fa-solid fa-tags
  color: "#F59E0B"
  rule:
    type: unique_count
    event: resource.tagged
    field: accountId
    threshold: 3
```

**Step 2:** Make sure the app emits the event (if it doesn't already)

```typescript
async function tagResource(resourceId: string, accountId: string, tags: Record<string, string>) {
  await api.tagResource(resourceId, tags);
  events.emit('resource.tagged', currentUser.id, { resourceId, accountId });
}
```

That's it. No engine changes. No condition checker (it's a `unique_count`). The YAML drives everything.

### Scenario: "Early Bird" — Used the platform before 7am (hidden, needs custom logic)

**Step 1:** Add to `badges.yaml`

```yaml
- id: early-bird
  name: Early Bird
  description: Used the platform before 7am
  hint: The early engineer gets the savings.
  category: hidden
  hidden: true
  icon: fa-solid fa-sun
  color: "#FBBF24"
  rule:
    type: condition
    key: used_before_7am
```

**Step 2:** Create the condition checker

```typescript
// src/lib/achievements/conditions/early-bird.ts
import { achievements } from '../engine';

achievements.registerCondition('used_before_7am', (userId, event) => {
  return new Date(event.timestamp).getHours() < 7;
});
```

**Step 3:** Import it in the bootstrap file

```typescript
import './conditions/early-bird';
```

Done. Three lines of logic, one YAML block, one import.

---

## Storage Schema

```sql
-- User achievement progress (serialized from engine state)
CREATE TABLE user_achievement_progress (
  user_id     TEXT PRIMARY KEY,
  counts      JSONB NOT NULL DEFAULT '{}',
  uniques     JSONB NOT NULL DEFAULT '{}',
  seen        JSONB NOT NULL DEFAULT '[]',
  awarded     JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Awarded badges (queryable, denormalized from progress)
CREATE TABLE user_badges (
  user_id     TEXT NOT NULL,
  badge_id    TEXT NOT NULL,
  awarded_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- Event log (optional, for debugging and retroactive badge evaluation)
CREATE TABLE achievement_events (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_user ON achievement_events (user_id, created_at);
CREATE INDEX idx_events_type ON achievement_events (event_type, created_at);
```

---

## Event Catalog

The full list of events the app should emit. This is the contract between app code and the achievement engine.

| Event | Payload Fields | Badges That Use It |
|---|---|---|
| `page.visited` | `page` | Cartographer, Speed Run |
| `filter.applied` | `page`, `filter` | Filter Fiend |
| `date_range.selected` | `startDate`, `endDate` | Time Traveler |
| `comparison.started` | `accountIds` | Comparator |
| `export.completed` | `format` | Exporter, Polyglot |
| `drilldown.entered` | `level`, `path` | Deep Diver |
| `dashboard.saved` | `viewId` | Bookmarker |
| `search.navigated` | `query`, `resultId` | Search Sage |
| `shortcut.used` | `shortcut` | Shortcut Artist |
| `alert.created` | `accountId`, `threshold` | Alert Setter |
| `graph.annotated` | `graphId`, `note` | Annotator |
| `expedition.completed` | `expeditionId` | Trailblazer |
| `account.favorited` | `accountId` | Favorite Fan |
| `account.viewed` | `accountId` | Double Agent, Five Alive, Account Connoisseur |
| `dashboard.customized` | `widgetId`, `action` | Decorator |
| `ai.chat.sent` | `message` | AI Whisperer, Philosopher |
| `feedback.submitted` | `text` | Voice Heard |
| `report.shared` | `reportId`, `recipientId` | Collaborator |
| `report.scheduled` | `reportId`, `frequency` | Scheduler |
| `theme.changed` | `theme` | Theme Switcher |
| `session.started` | `previousSessionTimestamp`, `userAgent` | The Return, Mobile Scout, Night Owl |
| `action.undone` | `originalAction`, `elapsed_ms` | Ctrl+Z |
| `feature.used` | `featureId`, `releasedAt` | Early Adopter |
| `badges.viewed` | | Badge Watcher |
| `table.scrolled` | `tableId`, `reachedBottom` | The Scroll |
| `resource.tagged` | `resourceId`, `accountId` | *(future)* |

---

## Why This Works

**For existing code:** Instrument with `events.emit()` calls. One line per action. No imports from the achievement system.

**For new badges:** Add YAML. If it's a count/unique/once rule, you're done. If it needs custom logic, write a small condition checker.

**For new features:** When you build a new feature, emit events for the meaningful user actions. Badges can be added to those events at any time — before, during, or after the feature ships.

**Nothing is coupled.** Remove the achievement engine entirely and the app works identically. The `events.emit()` calls are no-ops with no subscriber. This is the key property: the achievement system is a **parasite that observes**, not a **dependency that's required**.
