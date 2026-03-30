# Engagement System Design: Driving Feature Discovery & Site Exploration

## The Actual Problem

Internal tools have a discovery problem. Someone builds a powerful dashboard with 15 views, smart filters, comparison tools, forecasting — and users bookmark the one page they needed on day one and never look at anything else. The tool is 10x more capable than anyone realizes, because nobody explores.

The goal isn't to reward people for doing their AWS homework. It's to make users **curious about the platform itself** — to pull them into corners of the site they didn't know existed, show them capabilities they'd never think to look for, and build the kind of familiarity where people say "oh, the tool can do that too."

---

## Core Principle: Discovery Through Delight, Not Obligation

The best exploration systems make you feel clever for finding something, not guilty for missing it. Think of it like a well-designed video game world: you *can* walk the main path, but the side rooms are where the interesting stuff is. The system should make people **want** to open that dropdown, click that tab, try that filter — not because they get points, but because the platform keeps surprising them.

---

## Idea 1: The Map

### What

A literal, visual map of the platform — a stylized overview of every major feature, page, and capability — that fills in as the user explores. Unexplored areas are fogged out. Visited areas are revealed in detail. Think fog-of-war from strategy games, applied to a product.

### Why This Works

It reframes the entire platform as a place with **territory to discover**. Instead of a nav sidebar that users glaze over, the Map makes the platform's full scope tangible and visual. Seeing that you've only uncovered 30% of the map creates natural curiosity — not pressure, but a pull. "What's behind that fog?"

### How It Could Look

- The map lives on the user's profile or as an expandable overlay accessible from any page.
- Major sections of the platform are represented as **regions**: Cost Explorer, Account Overview, Budgets & Alerts, Resource Inventory, Reports, Settings, etc.
- Each region has **landmarks** — specific features within that section. Cost Explorer might have landmarks for "Service Breakdown," "Daily Granularity View," "Custom Date Range," "Tag-Based Filtering," and "Export to CSV."
- Visiting a page reveals the region. Using a specific feature reveals the landmark.
- The map has a completion percentage, but it's presented as territory explored, not a score. "You've explored 47% of the platform."

### Variations

**Minimal:** A simple grid or checklist view with sections and features, checkmarks appearing as you use them. Clean, no visual flair — fits a strictly professional aesthetic.

**Illustrated:** A hand-drawn or isometric map with themed regions. Cost Explorer could be a telescope observatory. Budgets could be a vault. Resource Inventory could be a warehouse. The metaphor doesn't have to be heavy-handed — just enough to make it memorable.

**Interactive:** Clicking on a fogged region tells you what's there and links you directly to it. The map becomes an alternative navigation system — a way to browse the platform by capability rather than by menu hierarchy.

---

## Idea 2: Easter Eggs That Teach

### What

Hidden interactions, shortcuts, and micro-features scattered throughout the platform that reward curiosity with genuinely useful functionality.

### Why This Works

Easter eggs work because they create **stories**. "Did you know if you double-click a cost graph it pins it to your dashboard?" becomes watercooler conversation. Each discovery makes the user feel like they're getting more out of the tool than the next person. And critically — unlike badges — the reward is **the feature itself**, not a token acknowledging you found it.

### Examples

**Keyboard shortcuts nobody told you about.** Press `/` from any page to open a global search. Press `?` to see a full shortcut reference. Press `g` then `c` to jump to Cost Explorer (Gmail-style navigation). These aren't hidden for the sake of hiding them — they're discoverable through a subtle `⌘` icon in the corner that expands on hover.

**The comparison trick.** Hold Shift and click two accounts in any list to instantly open a side-by-side cost comparison. No documentation mentions this. Users discover it by accident or word-of-mouth. Once discovered, it becomes indispensable.

**Smart paste.** Paste an AWS account ID anywhere in the search bar and the platform instantly navigates to that account's overview. Paste a resource ARN and it jumps to that resource's cost history. The search bar is secretly way smarter than it looks.

**Graph annotations.** Click any point on a cost trend graph and type a note. "Launched marketing campaign" or "Migrated database to Graviton." The note persists and is visible to anyone viewing that graph. Most users never realize the graphs are annotatable until they accidentally click one.

**The dashboard URL trick.** Any filter state, date range, or view configuration is encoded in the URL. Copy the URL, send it to a colleague, and they see exactly what you see. Not revolutionary — but most users assume internal tools don't do this, so discovering it feels like a superpower.

### How Discovery Works

- No tutorial announces these. They're found through **contextual hints**: a faint dotted border around a clickable area, a tooltip that says "Try holding Shift," a search bar placeholder that rotates through example queries including an ARN.
- A dedicated "Tips & Tricks" page exists but is itself somewhat hidden — accessible from the footer or from the `?` shortcut. It catalogs all discoverable features with short demos.
- When a user discovers an easter egg for the first time, a small, tasteful toast appears: *"You found something. Check your discoveries."* — linking to their personal discovery log.

---

## Idea 3: Weekly Digest with a Hook

### What

A short, personalized weekly summary delivered in-platform (and optionally via email/Slack) that highlights something the user hasn't tried yet.

### Why This Works

People don't explore tools because they're busy and the tool "works fine." A weekly nudge that says "Here's one thing you haven't tried" is low-commitment and high-signal. It's not a newsletter — it's a **single, targeted recommendation** based on what this specific user hasn't done yet.

### Format

The digest is 3 sections, always in this order:

**Your Week** — A 2-line summary of what the user did on the platform this week. "You reviewed 3 accounts and created 1 budget alert." Quick, factual, makes the user feel seen.

**Something You Missed** — One specific feature or capability the user hasn't engaged with, framed as a question. "Did you know you can compare two accounts side-by-side? [Try it →]" Always links directly to the feature with a relevant pre-loaded context (e.g., pre-selects the two accounts the user views most).

**What Others Found Useful** — An anonymized stat. "47% of users used the tag compliance report this week." Social proof that gently surfaces features the user might be ignoring that peers aren't.

### Variations

**Passive:** In-platform only. A card on the dashboard that updates weekly. Users see it or don't.

**Active:** Sent via Slack or email. Higher visibility, but risks feeling spammy. Keep it to once a week max, with easy opt-out.

**Progressive:** The "Something You Missed" section gets progressively more advanced as the user explores more. Early on it's "Have you tried filtering by service?" Later it's "You can build custom cost allocation views using tag combinations."

---

## Idea 4: Achievement Badges Tied to Exploration

### What

A set of collectible badges that are specifically about **platform capability discovery**, not AWS cost management outcomes.

### Why This Works

This is the most familiar pattern — badges — but scoped tightly to site exploration rather than job performance. The distinction matters: nobody feels judged by "You haven't earned the Cost Optimizer badge." Everyone feels curious about "What's the hidden badge I haven't found yet?"

### Badge Categories

**Feature Discovery** — Awarded for using specific features for the first time.
- *Cartographer* — Visited every top-level section of the platform
- *Filter Fiend* — Used advanced filters on 5 different pages
- *Time Traveler* — Used a custom date range spanning more than 1 year
- *Comparator* — Ran a side-by-side account comparison
- *Exporter* — Exported data in 3 different formats
- *Deep Diver* — Drilled down 4+ levels into a cost breakdown (service → operation → resource → hourly)
- *Bookmarker* — Saved 3 custom dashboard views

**Hidden Badges** — Not listed anywhere. Discovered by doing something unusual.
- *Night Owl* — Used the platform between midnight and 5am
- *Speed Run* — Navigated to 10 different pages within 60 seconds
- *Historian* — Looked at cost data older than 12 months
- *Polyglot* — Exported in CSV, JSON, and PDF in the same session
- *The Scroll* — Scrolled to the bottom of the longest table in the platform

**Meta Badges**
- *Badge Watcher* — Viewed the badges page for the first time (self-referential on purpose)
- *Completionist* — Earned every non-hidden badge
- *??? x5* — Earned 5 hidden badges (the ultimate flex)

### Design

- Badges are displayed as a compact grid on the user profile. Unearned badges show as dark silhouettes with a `?` — visible enough to spark curiosity, mysterious enough to drive exploration.
- Hovering over an unearned badge shows a vague hint: *"Some things are only visible at night."*
- Earned badges show a clean icon and the date earned.
- There is no leaderboard for badges. This is personal collection, not competition. Though users can optionally make their badge collection public on their profile.

---

## Idea 5: Guided Expeditions

### What

Optional, structured walkthroughs that guide a user through a specific workflow end-to-end, using real data from their own accounts. Not a help doc. Not a product tour. A **hands-on expedition** through a real capability.

### Why This Works

Product tours are passive — "Here's the button, here's the panel, here's the menu." Expeditions are active: "Let's find your most expensive resource right now." The user accomplishes something real, and in the process, they discover 4-5 features they didn't know existed. The expedition is the excuse to explore; the knowledge is the reward.

### Example Expeditions

**"Find the Money Leak"**
Walk the user through drilling into their highest-cost account, breaking it down by service, identifying the top resource, checking its utilization, and tagging it for review. Along the way they use: account overview, service breakdown, resource-level drill-down, utilization metrics, and the tagging interface. Five features touched in one purposeful workflow.

**"Build Your Command Center"**
Guide the user through customizing their dashboard: pinning key metrics, setting up a budget alert, saving a filtered view, and configuring a weekly report. They end up with a personalized dashboard and have now used: widget customization, budget creation, filter saving, and report scheduling.

**"The Time Machine"**
Walk backward through cost history to understand how spend evolved. Start at today's total, go back 90 days, compare month-over-month, find the biggest spike, drill into what caused it. Touches: date range selection, trend visualization, comparative views, and event correlation.

**"Account Physical"**
A full diagnostic walkthrough of a single account: cost summary, resource inventory, tag compliance, optimization recommendations, and alert coverage. Like an annual physical, but for an AWS account. The user ends up with a clear picture of account health and has touched nearly every major feature.

### Variations

**Self-guided:** A checklist-style sidebar that suggests the next step but lets the user go at their own pace. Steps can be skipped and returned to.

**Interactive:** The platform highlights the relevant UI elements at each step (subtle pulsing border, not a modal overlay) and validates when the step is complete before advancing.

**Timed:** Optional speed-run mode for experienced users who want to challenge themselves. "Complete the Account Physical in under 5 minutes." Adds replay value to expeditions.

---

## Idea 6: The Changelog That's Actually Interesting

### What

A living, prominent changelog within the platform that announces new features, improvements, and fixes — written in a way that makes people want to try the new thing immediately.

### Why This Works

Most changelogs are buried and written in developer-speak. A well-crafted changelog is free engagement. Every time you ship something, it's an opportunity to pull users into a new corner of the platform. But the changelog needs to be **visible and compelling**, not an afterthought.

### How

- A "What's New" indicator in the nav bar shows a subtle dot when there's something the user hasn't seen.
- Clicking it opens a feed of updates, each one structured as: **what changed**, **why it matters to you**, and **try it now** (deep link).
- Each entry has a screenshot or 5-second clip showing the feature in action.
- Entries are tagged by which part of the platform they affect, so users can filter by areas they care about.
- When a new feature is released that relates to a page the user is already on, a non-intrusive inline banner appears: *"New: You can now export this view as a scheduled PDF report. [Try it →]"*

---

## How These Ideas Compose

These aren't six separate systems competing for attention. They layer:

| Layer | What It Does | Metaphor |
|---|---|---|
| The Map | Shows users how much platform exists that they haven't seen | The world |
| Easter Eggs | Rewards curiosity with functional surprises | Hidden rooms |
| Weekly Digest | Nudges users toward one new thing per week | The tour guide |
| Badges | Gives collectors something to pursue | The passport stamps |
| Expeditions | Provides structured reasons to explore deeply | The guided trek |
| Changelog | Keeps the platform feeling alive and evolving | The newspaper |

A user could engage with none of these and use the platform just fine. But a user who glances at their Map, sees 40% explored, follows the Weekly Digest's suggestion, earns a badge along the way, and discovers the comparison shortcut via an Easter Egg — that user now understands 3x more of the platform than they did last week. And they had a good time doing it.

---

## Tone Guidelines

This is a professional tool. The engagement layer should feel like:

- **Notion's** onboarding — clean, optional, empowering
- **Linear's** keyboard shortcuts — powerful, discoverable, not in your face
- **Stripe's** documentation — clear, useful, occasionally witty
- **GitHub's** contribution graph — motivating without being pushy

It should never feel like:

- A mobile game asking you to log in daily
- A corporate LMS with mandatory training modules
- A SaaS product begging you to try premium features
- A children's app with stickers and sound effects

The vibe is: *"This platform has depth. The more you explore, the more you can do. We'll leave breadcrumbs, but we won't force your hand."*
