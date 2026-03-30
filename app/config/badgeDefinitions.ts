/**
 * Badge Definitions
 *
 * Typed badge catalog converted from FEATURES/ACHIEVEMENTS/badges.yaml.
 * The YAML file remains as the human-readable design spec; this TS file
 * is what the runtime achievement engine uses.
 */

import type { BadgeDefinition } from '#shared/types/achievements'

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Feature Discovery ──────────────────────────────────────────────────
  {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Visited every top-level section of the platform',
    hint: 'There\'s more to this place than you think.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-map',
    color: '#3B82F6',
    rule: { type: 'unique_count', event: 'page.visited', field: 'page', threshold: 8 }
  },
  {
    id: 'filter-fiend',
    name: 'Filter Fiend',
    description: 'Used advanced filters on 5 different pages',
    hint: 'Narrow your focus.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-filter',
    color: '#8B5CF6',
    rule: { type: 'unique_count', event: 'filter.applied', field: 'page', threshold: 5 }
  },
  {
    id: 'time-traveler',
    name: 'Time Traveler',
    description: 'Used a custom date range spanning more than 1 year',
    hint: 'Look further back than you normally would.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-clock-rotate-left',
    color: '#06B6D4',
    rule: { type: 'condition', key: 'date_range_exceeds_one_year' }
  },
  {
    id: 'comparator',
    name: 'Comparator',
    description: 'Ran a side-by-side account comparison',
    hint: 'Two things are better understood together.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-code-compare',
    color: '#F59E0B',
    rule: { type: 'event_once', event: 'comparison.started' }
  },
  {
    id: 'exporter',
    name: 'Exporter',
    description: 'Exported data in 3 different formats',
    hint: 'Take your data places.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-file-export',
    color: '#10B981',
    rule: { type: 'unique_count', event: 'export.completed', field: 'format', threshold: 3 }
  },
  {
    id: 'deep-diver',
    name: 'Deep Diver',
    description: 'Drilled down 4+ levels into a cost breakdown',
    hint: 'The surface never tells the full story.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-water',
    color: '#0369A1',
    rule: { type: 'condition', key: 'drilldown_depth_4_plus' }
  },
  {
    id: 'bookmarker',
    name: 'Bookmarker',
    description: 'Saved 3 custom dashboard views',
    hint: 'Make it yours.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-bookmark',
    color: '#E11D48',
    rule: { type: 'event_count', event: 'dashboard.saved', threshold: 3 }
  },
  {
    id: 'search-sage',
    name: 'Search Sage',
    description: 'Used the global search to navigate to 10 different results',
    hint: 'The fastest path is the one you type.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-magnifying-glass',
    color: '#7C3AED',
    rule: { type: 'event_count', event: 'search.navigated', threshold: 10 }
  },
  {
    id: 'shortcut-artist',
    name: 'Shortcut Artist',
    description: 'Used 5 different keyboard shortcuts',
    hint: 'Your mouse is optional.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-keyboard',
    color: '#64748B',
    rule: { type: 'unique_count', event: 'shortcut.used', field: 'shortcut', threshold: 5 }
  },
  {
    id: 'alert-setter',
    name: 'Alert Setter',
    description: 'Configured a budget alert for the first time',
    hint: 'Know before it\'s too late.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-bell',
    color: '#F97316',
    rule: { type: 'event_once', event: 'alert.created' }
  },
  {
    id: 'annotator',
    name: 'Annotator',
    description: 'Added a note to a cost graph data point',
    hint: 'Graphs have more to say when you help them.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-pen-to-square',
    color: '#14B8A6',
    rule: { type: 'event_once', event: 'graph.annotated' }
  },
  {
    id: 'expedition-complete',
    name: 'Trailblazer',
    description: 'Completed a guided expedition end-to-end',
    hint: 'Follow the path. See what you find.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-route',
    color: '#D97706',
    rule: { type: 'event_once', event: 'expedition.completed' }
  },
  {
    id: 'favorite-fan',
    name: 'Favorite Fan',
    description: 'Favorited an AWS account',
    hint: 'Mark what matters.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-star',
    color: '#FBBF24',
    rule: { type: 'event_once', event: 'account.favorited' }
  },
  {
    id: 'double-agent',
    name: 'Double Agent',
    description: 'Accessed more than 2 AWS accounts',
    hint: 'You belong in more places than one.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-user-group',
    color: '#38BDF8',
    rule: { type: 'unique_count', event: 'account.viewed', field: 'accountId', threshold: 2 }
  },
  {
    id: 'five-alive',
    name: 'Five Alive',
    description: 'Accessed more than 5 AWS accounts',
    hint: 'Your reach is growing.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-users',
    color: '#2DD4BF',
    rule: { type: 'unique_count', event: 'account.viewed', field: 'accountId', threshold: 5 }
  },
  {
    id: 'account-connoisseur',
    name: 'Account Connoisseur',
    description: 'Accessed more than 10 AWS accounts',
    hint: 'At this point you might as well see them all.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-building',
    color: '#818CF8',
    rule: { type: 'unique_count', event: 'account.viewed', field: 'accountId', threshold: 10 }
  },
  {
    id: 'decorator',
    name: 'Decorator',
    description: 'Customized the home page layout or widgets',
    hint: 'Default is just a starting point.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-palette',
    color: '#F472B6',
    rule: { type: 'event_once', event: 'dashboard.customized' }
  },
  {
    id: 'ai-whisperer',
    name: 'AI Whisperer',
    description: 'Used the AI chat assistant for the first time',
    hint: 'Try asking it something.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-robot',
    color: '#A78BFA',
    rule: { type: 'event_once', event: 'ai.chat.sent' }
  },
  {
    id: 'voice-heard',
    name: 'Voice Heard',
    description: 'Submitted feedback through the platform',
    hint: 'We\'re listening.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-comment-dots',
    color: '#34D399',
    rule: { type: 'event_once', event: 'feedback.submitted' }
  },
  {
    id: 'collaborator',
    name: 'Collaborator',
    description: 'Shared a report or dashboard link with a colleague',
    hint: 'Insights are better together.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-share-nodes',
    color: '#60A5FA',
    rule: { type: 'event_once', event: 'report.shared' }
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    description: 'Set up a recurring scheduled report',
    hint: 'Let the platform do the remembering.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-calendar-check',
    color: '#4ADE80',
    rule: { type: 'event_once', event: 'report.scheduled' }
  },
  {
    id: 'theme-switcher',
    name: 'Theme Switcher',
    description: 'Changed the platform theme or appearance',
    hint: 'Make it look the way you think.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-circle-half-stroke',
    color: '#CBD5E1',
    rule: { type: 'event_once', event: 'theme.changed' }
  },

  // ── User Milestones ────────────────────────────────────────────────────
  {
    id: 'regular',
    name: 'Regular',
    description: 'Visited the platform 50 times',
    hint: 'You\'re becoming a familiar face.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-door-open',
    color: '#60A5FA',
    rule: { type: 'event_count', event: 'session.started', threshold: 50 }
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Visited the platform 100 times',
    hint: 'This is basically your second office.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-bolt-lightning',
    color: '#F59E0B',
    rule: { type: 'event_count', event: 'session.started', threshold: 100 }
  },
  {
    id: 'old-faithful',
    name: 'Old Faithful',
    description: 'Visited the platform 500 times',
    hint: 'You and GHOST — inseparable.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-mountain',
    color: '#8B5CF6',
    rule: { type: 'event_count', event: 'session.started', threshold: 500 }
  },
  {
    id: 'daily-driver',
    name: 'Daily Driver',
    description: 'Logged in every day for 5 consecutive days',
    hint: 'Consistency is a superpower.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-calendar-week',
    color: '#10B981',
    rule: { type: 'condition', key: 'logged_in_5_consecutive_days' }
  },
  {
    id: 'iron-streak',
    name: 'Iron Streak',
    description: 'Logged in every day for 7 consecutive days',
    hint: 'A full week without missing a beat.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-fire',
    color: '#EF4444',
    rule: { type: 'condition', key: 'logged_in_7_consecutive_days' }
  },
  {
    id: 'page-turner',
    name: 'Page Turner',
    description: 'Visited 25 different pages across the platform',
    hint: 'Exploring is its own reward.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-book',
    color: '#6366F1',
    rule: { type: 'unique_count', event: 'page.visited', field: 'page', threshold: 25 }
  },
  {
    id: 'globe-trotter',
    name: 'Globe Trotter',
    description: 'Visited 50 different pages across the platform',
    hint: 'No corner left unturned.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-earth-americas',
    color: '#0EA5E9',
    rule: { type: 'unique_count', event: 'page.visited', field: 'page', threshold: 50 }
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    description: 'Sent 25 messages to the AI assistant',
    hint: 'You two have a lot to talk about.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-comments',
    color: '#A78BFA',
    rule: { type: 'event_count', event: 'ai.chat.sent', threshold: 25 }
  },
  {
    id: 'ai-confidant',
    name: 'AI Confidant',
    description: 'Sent 100 messages to the AI assistant',
    hint: 'At this point it knows your style.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-robot',
    color: '#D946EF',
    rule: { type: 'event_count', event: 'ai.chat.sent', threshold: 100 }
  },
  {
    id: 'export-machine',
    name: 'Export Machine',
    description: 'Exported data 10 times',
    hint: 'Taking it all with you.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-download',
    color: '#14B8A6',
    rule: { type: 'event_count', event: 'export.completed', threshold: 10 }
  },
  {
    id: 'search-addict',
    name: 'Search Addict',
    description: 'Used global search 50 times',
    hint: 'Why browse when you can search?',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-magnifying-glass-plus',
    color: '#F472B6',
    rule: { type: 'event_count', event: 'search.navigated', threshold: 50 }
  },
  {
    id: 'favorite-collector',
    name: 'Favorite Collector',
    description: 'Favorited 5 different accounts',
    hint: 'Building your personal constellation.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-heart',
    color: '#FBBF24',
    rule: { type: 'event_count', event: 'account.favorited', threshold: 5 }
  },
  {
    id: 'report-regular',
    name: 'Report Regular',
    description: 'Scheduled 5 reports',
    hint: 'Automation is the name of the game.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-file-lines',
    color: '#4ADE80',
    rule: { type: 'event_count', event: 'report.scheduled', threshold: 5 }
  },

  // ── Data-Aware ──────────────────────────────────────────────────────────
  {
    id: 'penny-pincher',
    name: 'Penny Pincher',
    description: 'Viewed an account where spend dropped 20%+ month-over-month',
    hint: 'Someone\'s been optimizing.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-piggy-bank',
    color: '#22C55E',
    rule: { type: 'condition', key: 'cost_decrease_20_percent' }
  },
  {
    id: 'red-alert',
    name: 'Red Alert',
    description: 'Viewed an account that\'s over budget',
    hint: 'Not every number is green.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-triangle-exclamation',
    color: '#EF4444',
    rule: { type: 'event_once', event: 'cost.over_budget_viewed' }
  },
  {
    id: 'zero-day',
    name: 'Zero Day',
    description: 'Viewed an account with $0.00 spend',
    hint: 'Some accounts are quieter than others.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-ghost',
    color: '#94A3B8',
    rule: { type: 'event_once', event: 'cost.zero_spend_viewed' }
  },

  // ── Cross-Feature ─────────────────────────────────────────────────────
  {
    id: 'full-physical',
    name: 'Full Physical',
    description: 'Viewed costs, security, and resources for the same account in one session',
    hint: 'A thorough checkup covers everything.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-stethoscope',
    color: '#0EA5E9',
    rule: { type: 'condition', key: 'full_account_physical' }
  },
  {
    id: 'bridge-builder',
    name: 'Bridge Builder',
    description: 'Viewed accounts in both Commercial and GovCloud',
    hint: 'You walk in two worlds.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-bridge',
    color: '#6366F1',
    rule: { type: 'condition', key: 'viewed_both_environments' }
  },
  {
    id: 'source-of-truth',
    name: 'Source of Truth',
    description: 'Toggled between Proforma and Billable data on the cost dashboard',
    hint: 'Every number has a perspective.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-scale-balanced',
    color: '#F59E0B',
    rule: { type: 'event_once', event: 'cost.data_mode_toggled' }
  },

  // ── Mastery ───────────────────────────────────────────────────────────
  {
    id: 'keyboard-wizard',
    name: 'Keyboard Wizard',
    description: 'Used 8+ different keyboard shortcuts',
    hint: 'Your fingers know the way.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-wand-magic-sparkles',
    color: '#8B5CF6',
    rule: { type: 'unique_count', event: 'shortcut.used', field: 'shortcut', threshold: 8 }
  },
  {
    id: 'query-crafter',
    name: 'Query Crafter',
    description: 'Ran dataset queries against 3+ different dataset types',
    hint: 'Different lenses, different truths.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-database',
    color: '#06B6D4',
    rule: { type: 'unique_count', event: 'dataset.query_executed', field: 'datasetType', threshold: 3 }
  },
  {
    id: 'scope-master',
    name: 'Scope Master',
    description: 'Used all 3 dashboard scopes: Org, My Accounts, and Favorites',
    hint: 'Zoom in, zoom out, focus.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-bullseye',
    color: '#F97316',
    rule: { type: 'unique_count', event: 'dashboard.scope_changed', field: 'scope', threshold: 3 }
  },
  {
    id: 'org-cartographer',
    name: 'Org Cartographer',
    description: 'Used all 3 org chart view modes',
    hint: 'Different altitudes reveal different landscapes.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-sitemap',
    color: '#14B8A6',
    rule: { type: 'unique_count', event: 'org_chart.view_mode_changed', field: 'mode', threshold: 3 }
  },
  {
    id: 'tag-surgeon',
    name: 'Tag Surgeon',
    description: 'Filtered costs by 3+ different cost allocation tags',
    hint: 'The right label changes everything.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-tags',
    color: '#EC4899',
    rule: { type: 'unique_count', event: 'cost.tag_filtered', field: 'tagKey', threshold: 3 }
  },
  {
    id: 'doc-reader',
    name: 'Doc Reader',
    description: 'Read 5+ support articles',
    hint: 'RTFM, but make it classy.',
    category: 'discovery',
    hidden: false,
    icon: 'fa-solid fa-book-open',
    color: '#0284C7',
    rule: { type: 'unique_count', event: 'support.doc_viewed', field: 'articleId', threshold: 5 }
  },

  // ── Hidden ─────────────────────────────────────────────────────────────
  {
    id: 'ghost-hunter',
    name: 'Ghost Hunter',
    description: 'Triggered a hidden command palette easter egg',
    hint: 'You found something that wasn\'t on the menu.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-ghost',
    color: '#10B981',
    rule: { type: 'event_once', event: 'easter_egg.triggered' }
  },
  {
    id: 'the-narrator',
    name: 'The Narrator',
    description: 'Renamed 3+ AI chat threads',
    hint: 'Every story deserves a proper name.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-pen-fancy',
    color: '#D946EF',
    rule: { type: 'event_count', event: 'chat.thread_renamed', threshold: 3 }
  },
  {
    id: 'the-archivist',
    name: 'The Archivist',
    description: 'Exported an AI chat thread',
    hint: 'Some conversations are worth keeping.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-box-archive',
    color: '#78716C',
    rule: { type: 'event_once', event: 'chat.thread_exported' }
  },
  {
    id: 'inception',
    name: 'Inception',
    description: 'Earned a badge while viewing the badges page',
    hint: 'Badges all the way down.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-infinity',
    color: '#7C3AED',
    rule: { type: 'condition', key: 'badge_earned_on_badges_page' }
  },
  {
    id: 'the-minimalist',
    name: 'The Minimalist',
    description: 'Removed 3+ widgets from the dashboard',
    hint: 'Less is more.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-minimize',
    color: '#64748B',
    rule: { type: 'event_count', event: 'dashboard.widget_removed', threshold: 3 }
  },
  {
    id: 'refresh-addict',
    name: 'Refresh Addict',
    description: 'Refreshed the same page 5 times in 60 seconds',
    hint: 'Have you tried turning it off and on again?',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-arrows-rotate',
    color: '#F43F5E',
    rule: { type: 'condition', key: 'refreshed_5_times_in_60_seconds' }
  },
  {
    id: 'mirror-mirror',
    name: 'Mirror Mirror',
    description: 'Viewed your own profile 3 times in one session',
    hint: 'Self-reflection is underrated.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-user-secret',
    color: '#A855F7',
    rule: { type: 'condition', key: 'viewed_profile_3_times_in_session' }
  },
  {
    id: 'philosopher',
    name: 'Philosopher',
    description: 'Asked the AI chat a non-work-related question',
    hint: 'Not every question has a line item.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-brain',
    color: '#C084FC',
    rule: { type: 'condition', key: 'ai_non_work_question' }
  },
  {
    id: 'mobile-scout',
    name: 'Mobile Scout',
    description: 'Accessed the platform from a mobile device',
    hint: 'Some people never leave their desk. You\'re not one of them.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-mobile-screen',
    color: '#FB923C',
    rule: { type: 'condition', key: 'mobile_user_agent' }
  },
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Used a new feature within 24 hours of its release',
    hint: 'First in line.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-rocket',
    color: '#F43F5E',
    rule: { type: 'condition', key: 'feature_used_within_24h' }
  },
  {
    id: 'ctrl-z',
    name: 'Ctrl+Z',
    description: 'Undid an action within 3 seconds of performing it',
    hint: 'Second thoughts count.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-rotate-left',
    color: '#94A3B8',
    rule: { type: 'condition', key: 'undo_within_3_seconds' }
  },
  {
    id: 'the-return',
    name: 'The Return',
    description: 'Logged in after 30+ days of inactivity',
    hint: 'Welcome back. Things have changed.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-door-open',
    color: '#E879F9',
    rule: { type: 'condition', key: 'inactive_30_days_then_login' }
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Used the platform between midnight and 5am',
    hint: 'Some things are only visible at night.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-moon',
    color: '#6366F1',
    rule: { type: 'condition', key: 'used_between_midnight_and_5am' }
  },
  {
    id: 'speed-run',
    name: 'Speed Run',
    description: 'Navigated to 10 different pages within 60 seconds',
    hint: 'Slow down \u2014 or don\'t.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-bolt',
    color: '#EAB308',
    rule: { type: 'condition', key: 'visited_10_pages_in_60_seconds' }
  },
  {
    id: 'historian',
    name: 'Historian',
    description: 'Looked at cost data older than 12 months',
    hint: 'The past has lessons if you go looking.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-scroll',
    color: '#A16207',
    rule: { type: 'condition', key: 'viewed_data_older_than_12_months' }
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Exported in CSV, JSON, and PDF in the same session',
    hint: 'Why pick one format when you can have them all?',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-language',
    color: '#059669',
    rule: { type: 'condition', key: 'exported_all_formats_in_session' }
  },
  {
    id: 'the-scroll',
    name: 'The Scroll',
    description: 'Scrolled to the absolute bottom of the longest table',
    hint: 'Not everyone has the patience to reach the end.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-arrow-down-long',
    color: '#78716C',
    rule: { type: 'condition', key: 'scrolled_table_to_bottom' }
  },

  // ── Hidden: Easter Egg badges ───────────────────────────────────────────
  {
    id: 'konami-master',
    name: 'Konami Master',
    description: 'Entered the legendary code',
    hint: 'Up, up, down, down...',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-gamepad',
    color: '#F59E0B',
    rule: { type: 'event_once', event: 'easter_egg.konami' }
  },
  {
    id: 'summoner',
    name: 'Summoner',
    description: 'Typed the magic word and summoned a spirit',
    hint: 'Say the name of this platform.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-hat-wizard',
    color: '#A855F7',
    rule: { type: 'event_once', event: 'easter_egg.ghost_word' }
  },
  {
    id: 'cloud-surfer',
    name: 'Cloud Surfer',
    description: 'Made it rain cloud services',
    hint: 'Three letters that power everything.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-cloud',
    color: '#34D399',
    rule: { type: 'event_once', event: 'easter_egg.cloud_matrix' }
  },
  {
    id: 'poltergeist',
    name: 'Poltergeist',
    description: 'The spirits followed your every move',
    hint: 'Some icons respond to persistence.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-wand-sparkles',
    color: '#E879F9',
    rule: { type: 'event_once', event: 'easter_egg.haunted_cursor' }
  },
  {
    id: 'console-hacker',
    name: 'Console Hacker',
    description: 'Discovered the ghost in the machine',
    hint: 'Open your developer tools and look for clues.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-terminal',
    color: '#22D3EE',
    rule: { type: 'event_once', event: 'easter_egg.console_function' }
  },
  {
    id: 'the-awakening',
    name: 'The Awakening',
    description: 'Awakened the GHOST through an ancient sequence',
    hint: 'The letters spell something in order.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-eye',
    color: '#10B981',
    rule: { type: 'event_once', event: 'easter_egg.ghost_awakening' }
  },
  {
    id: 'ghost-catcher',
    name: 'Ghost Catcher',
    description: 'Found and played the hidden mini-game',
    hint: 'Even error pages have secrets.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-crosshairs',
    color: '#FB923C',
    rule: { type: 'event_once', event: 'easter_egg.ghost_catcher' }
  },
  {
    id: 'arcade-champion',
    name: 'Arcade Champion',
    description: 'Achieved a legendary score in Ghost Catcher',
    hint: 'Master the mini-game. 8 is the magic number.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-trophy',
    color: '#FBBF24',
    rule: { type: 'condition', key: 'ghost_catcher_high_score' }
  },
  {
    id: 'paranormal-investigator',
    name: 'Paranormal Investigator',
    description: 'Found every hidden easter egg in the platform',
    hint: 'You\'re missing something. Keep looking everywhere.',
    category: 'hidden',
    hidden: true,
    icon: 'fa-solid fa-magnifying-glass-location',
    color: '#6366F1',
    rule: { type: 'condition', key: 'all_easter_eggs_found' }
  },

  // ── Meta ───────────────────────────────────────────────────────────────
  {
    id: 'badge-watcher',
    name: 'Badge Watcher',
    description: 'Viewed the badges page for the first time',
    hint: 'You\'re looking at it.',
    category: 'meta',
    hidden: false,
    icon: 'fa-solid fa-eye',
    color: '#EC4899',
    rule: { type: 'event_once', event: 'badges.viewed' }
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'Earned every non-hidden badge',
    hint: 'You\'ll know when you\'re done.',
    category: 'meta',
    hidden: false,
    icon: 'fa-solid fa-trophy',
    color: '#CA8A04',
    rule: { type: 'condition', key: 'all_non_hidden_badges_earned' }
  },
  {
    id: 'mystery-five',
    name: '???',
    description: 'Earned 5 hidden badges',
    hint: 'Keep finding what isn\'t listed.',
    category: 'meta',
    hidden: false,
    icon: 'fa-solid fa-gem',
    color: '#A855F7',
    rule: { type: 'condition', key: 'five_hidden_badges_earned' }
  }
]

/** All non-hidden badge IDs (used by completionist checker) */
export const NON_HIDDEN_BADGE_IDS = BADGE_DEFINITIONS
  .filter(b => !b.hidden)
  .map(b => b.id)

/** All hidden badge IDs (used by mystery-five checker) */
export const HIDDEN_BADGE_IDS = BADGE_DEFINITIONS
  .filter(b => b.hidden)
  .map(b => b.id)
