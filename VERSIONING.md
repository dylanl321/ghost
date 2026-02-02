# GHOST Versioning Guide

This document provides instructions for AI assistants and developers on how to manage GHOST versions.

## Versioning Scheme

GHOST uses **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`

| Component | When to Increment | Examples |
|-----------|-------------------|----------|
| **MAJOR** | Breaking changes, major redesigns, incompatible API changes | 1.0.0 → 2.0.0 |
| **MINOR** | New features, significant enhancements (backward-compatible) | 1.9.0 → 1.10.0 |
| **PATCH** | Bug fixes, minor improvements, documentation updates | 1.9.0 → 1.9.1 |

## AI Instructions for Version Increments

When asked to release a new version, follow these steps:

### Step 1: Analyze Changes Since Last Release

Review commits since the last version tag or changelog entry. Categorize changes:

| Commit Type | Category | Version Impact |
|-------------|----------|----------------|
| `feat:` | New Feature | MINOR bump |
| `fix:` | Bug Fix | PATCH bump |
| `perf:` | Performance | PATCH bump |
| `refactor:` | Code Refactor | PATCH bump (if no user impact, skip) |
| `docs:` | Documentation | PATCH bump (if user-facing) |
| `chore:` | Maintenance | No bump (skip in changelog) |
| `BREAKING CHANGE` | Breaking | MAJOR bump |

### Step 2: Determine New Version Number

```
Current: 1.9.0

If changes include BREAKING CHANGE → 2.0.0
If changes include feat: → 1.10.0
If changes include only fix:/perf: → 1.9.1
```

**Rules:**
- MAJOR resets MINOR and PATCH to 0
- MINOR resets PATCH to 0
- Multiple features in one release = single MINOR bump
- Multiple fixes in one release = single PATCH bump

### Step 3: Update Files

1. **Update `package.json`**:
   ```json
   {
     "version": "X.Y.Z"
   }
   ```

2. **Update `CHANGELOG.md`**:
   - Add new version section at the top (after header)
   - Include highlights comment for key features
   - Write user-friendly descriptions (not technical)

   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   <!-- highlights: Feature1, Feature2 -->

   ### New Features
   - User-friendly description of what users can now do

   ### Improvements
   - User-friendly description of what's better

   ### Bug Fixes
   - Fixed issue where [user-facing problem] occurred
   ```

### Step 4: Changelog Writing Guidelines

**DO:**
- Write from the user's perspective
- Focus on what users can now do or what's improved
- Use simple, non-technical language
- Group related changes into single entries
- Start entries with action verbs: "Added", "You can now", "Fixed"

**DON'T:**
- Mention file names, code, or technical implementation
- Include internal refactoring or code cleanup
- Use developer jargon (API, component, refactor, etc.)
- List every commit - consolidate related changes

**Examples:**

| Bad (Technical) | Good (User-Friendly) |
|-----------------|---------------------|
| "Refactored CostTrendChart component" | "Cost charts now load faster" |
| "Added useAccountCosts composable" | "You can now view cost breakdowns by account" |
| "Fixed null pointer in auth middleware" | "Fixed an issue where some users couldn't log in" |
| "Updated AWS SDK dependencies" | (Skip - no user impact) |

### Step 5: Highlights Selection

Choose 1-3 key features for the `<!-- highlights: ... -->` comment. These appear as prominent badges in the changelog UI.

**Good highlights:**
- Major new pages or features: "Cost Dashboard", "AI Chat"
- Significant capabilities: "Budget Alerts", "Export Reports"
- User-requested features: "Dark Mode", "Keyboard Shortcuts"

**Bad highlights:**
- Technical changes: "API Refactor", "Database Migration"
- Minor fixes: "Bug Fixes", "Performance"
- Vague terms: "Improvements", "Updates"

## Version Release Checklist

```markdown
- [ ] Analyzed commits since last release
- [ ] Determined appropriate version bump (MAJOR/MINOR/PATCH)
- [ ] Updated version in package.json
- [ ] Added changelog entry with:
  - [ ] Correct date (YYYY-MM-DD)
  - [ ] Highlights comment with key features
  - [ ] User-friendly descriptions
  - [ ] Proper categorization (New Features/Improvements/Bug Fixes)
- [ ] Verified version displays correctly in footer
- [ ] Verified changelog page shows new entry
```

## Automated Changelog Generation

For AI-assisted changelog generation, run:

```bash
npm run changelog:generate X.Y.Z
```

This script:
1. Collects commits since last tag
2. Uses AI to transform technical commits into user-friendly descriptions
3. Prepends the new entry to CHANGELOG.md

**After running**, review and edit the generated changelog for accuracy.

## Example Release Flow

```bash
# 1. AI analyzes changes and determines version
# Current: 1.9.0, Changes: 2 new features, 3 bug fixes → 1.10.0

# 2. Update package.json
# Edit "version": "1.9.0" → "version": "1.10.0"

# 3. Add to CHANGELOG.md (at top, after header)
## [1.10.0] - 2026-02-15
<!-- highlights: New Feature Name, Other Feature -->

### New Features
- You can now do X directly from the dashboard
- Added ability to Y with automatic Z

### Bug Fixes
- Fixed issue where users couldn't access certain pages
- Resolved problem with data not refreshing correctly

# 4. Commit the release
git add package.json CHANGELOG.md
git commit -m "chore: release v1.10.0"
git tag -a v1.10.0 -m "Release 1.10.0"
```

## Version History Location

- **Current Version**: `package.json` → `version` field
- **Version Display**: Footer of all pages, Changelog page header
- **Full History**: `CHANGELOG.md`
