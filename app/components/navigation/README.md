# Collapsible Navigation Sidebar

## Overview

The GHOST application features a sophisticated collapsible sidebar navigation system that provides:

- **Smart Collapse Behavior**: Automatically adapts to different pages based on their needs
- **Page Protection**: Prevents collapse on critical pages like the home page
- **Responsive Design**: Mobile-friendly with touch-optimized interactions
- **Smooth Animations**: 300ms transitions for all state changes
- **Hover Expansion**: Temporary expansion on hover when collapsed
- **Persistent State**: Remembers collapse preference across sessions

## Architecture

### Core Components

1. **`useNavigationStore`** (`/app/stores/useNavigationStore.ts`)
   - Pinia store managing all navigation state
   - Persistent storage of collapse preference
   - Page-specific rule management
   - Responsive breakpoint handling

2. **`SideNav.vue`** (`/app/components/navigation/SideNav.vue`)
   - Main navigation component with collapsible UI
   - Interactive elements and animations
   - Tooltip system for collapsed state

3. **`default.vue`** (`/app/layouts/default.vue`)
   - Layout integration with dynamic margin adjustment

## Page Rules System

### Rule Types

- **`protected`**: Cannot be collapsed (e.g., home page)
- **`default-collapsed`**: Automatically collapses when navigating to page
- **`normal`**: Standard behavior, respects user preference

### Current Page Rules

```typescript
// Home page - always shows full navigation
{ path: '/', rule: 'protected' }

// Cost pages - benefit from more screen space
{ path: '/account/costs', rule: 'default-collapsed' }
{ path: '/account/cost-analytics', rule: 'default-collapsed' }
{ path: '/account/cost-analytics-v2', rule: 'default-collapsed' }
```

### Adding New Rules

```typescript
// In any component or page
const navigationStore = useNavigationStore()

// Add a new rule
navigationStore.addPageRule('/new-page', 'default-collapsed', 'Needs more viewport width')

// Remove a rule
navigationStore.removePageRule('/old-page')

// Check current rule
const rule = navigationStore.getPageRule('/current-page')
```

## API Reference

### NavigationStore Methods

#### Core State Methods
- `toggle(currentPath?: string)`: Toggle collapse state with protection check
- `collapse(currentPath?: string)`: Force collapse if allowed
- `expand()`: Force expand (always allowed)
- `setHovered(hovered: boolean)`: Update hover state
- `setMobile(mobile: boolean)`: Update mobile breakpoint state

#### Page Rule Methods
- `addPageRule(path, rule, reason?)`: Add or update a page rule
- `removePageRule(path)`: Remove a page rule
- `getPageRule(path)`: Get rule for a specific path
- `isPageProtected(path)`: Check if page prevents collapse
- `shouldDefaultCollapse(path)`: Check if page defaults to collapsed

#### Navigation Methods
- `handleRouteChange(newPath, oldPath?)`: Process route changes automatically

### Store Properties

#### Reactive State
- `isCollapsed: Ref<boolean>`: Current collapse state
- `isHovered: Ref<boolean>`: Current hover state
- `isMobile: Ref<boolean>`: Mobile breakpoint state

#### Computed Properties
- `shouldShow: ComputedRef<boolean>`: Whether sidebar should be visible
- `sidebarWidth: ComputedRef<string>`: Current sidebar width (CSS value)
- `contentMargin: ComputedRef<string>`: Main content margin (CSS value)

## Usage Examples

### Basic Usage

```vue
<script setup>
import { useNavigationStore } from '~/stores/useNavigationStore'

const navigationStore = useNavigationStore()

// Check if current page allows collapse
const canToggle = !navigationStore.isPageProtected(route.path)

// Toggle sidebar
const handleToggle = () => {
  navigationStore.toggle(route.path)
}
</script>
```

### Adding Page-Specific Behavior

```vue
<script setup>
// In a page component that needs special navigation behavior
const navigationStore = useNavigationStore()

onMounted(() => {
  // This page needs extra screen space
  navigationStore.addPageRule(route.path, 'default-collapsed', 'Charts need more width')
})

onUnmounted(() => {
  // Clean up if temporary rule
  navigationStore.removePageRule(route.path)
})
</script>
```

### Responsive Handling

```vue
<script setup>
const navigationStore = useNavigationStore()

// The store automatically handles responsive behavior
// But you can manually trigger updates if needed
const handleResize = () => {
  navigationStore.setMobile(window.innerWidth < 768)
}
</script>
```

## Styling & Theming

### CSS Classes

The sidebar uses Tailwind CSS with these key classes:

```css
/* Sidebar container */
.w-16    /* Collapsed width (64px) */
.w-64    /* Expanded width (256px) */
.transition-all.duration-300  /* Smooth animations */

/* Hover effects */
.group-hover:opacity-100  /* Tooltip visibility */
.shadow-2xl               /* Hover expansion shadow */

/* Responsive */
.z-40    /* Proper z-index layering */
```

### Customization

To customize the sidebar appearance:

1. **Width**: Modify `sidebarWidth` computed property in store
2. **Animation**: Change `duration-300` class and transition timing
3. **Colors**: Update Tailwind color classes in SideNav.vue
4. **Breakpoints**: Adjust mobile breakpoint in store

## Mobile Behavior

- **< 768px**: Sidebar transforms into overlay menu
- **Mobile Menu**: Accessible via hamburger button in TopNav
- **Overlay**: Dark backdrop when mobile menu is open
- **Touch**: Optimized for touch interactions
- **Auto-close**: Mobile menu closes when navigating or clicking overlay
- **Responsive**: Seamless transition between desktop and mobile modes

## Performance Considerations

- **Animations**: Use `transform` and `opacity` for GPU acceleration
- **State**: Minimal state changes to prevent unnecessary re-renders
- **Persistence**: Only essential state persisted to localStorage
- **Hover**: Debounced hover detection prevents flicker
- **Mobile**: Efficient overlay rendering with proper z-index management
- **Scrolling**: `overflow-x-hidden` prevents horizontal scrollbars in collapsed state

## Accessibility Features

- **Keyboard Navigation**: All interactive elements keyboard accessible
- **Screen Readers**: Proper ARIA labels and roles
- **Focus Management**: Visible focus indicators
- **Color Contrast**: High contrast for all text elements

## Testing

### Manual Testing Checklist

- [ ] Collapse/expand functionality works on all pages
- [ ] Home page prevents collapse with visual feedback
- [ ] Cost pages auto-collapse on navigation
- [ ] Hover expansion works smoothly
- [ ] Tooltips appear correctly when collapsed
- [ ] Mobile responsiveness functions properly
- [ ] State persists across browser sessions
- [ ] Animations are smooth (no jank)
- [ ] Keyboard navigation works
- [ ] Screen reader compatibility

### Automated Testing

```typescript
// Example test structure
describe('NavigationStore', () => {
  it('should prevent collapse on protected pages', () => {
    const store = useNavigationStore()
    const result = store.toggle('/')
    expect(result).toBe(false)
    expect(store.isCollapsed).toBe(false)
  })
  
  it('should auto-collapse on cost pages', () => {
    const store = useNavigationStore()
    store.handleRouteChange('/account/costs')
    expect(store.isCollapsed).toBe(true)
  })
})
```

## Future Enhancements

### Planned Features
- **Swipe Gestures**: Mobile swipe to toggle
- **Keyboard Shortcuts**: Cmd/Ctrl + B to toggle
- **Custom Themes**: Dark/light mode transitions
- **Animation Presets**: Different transition styles

### Extensibility Points
- **Rule System**: Add more rule types (conditional, time-based)
- **Analytics**: Track usage patterns
- **Shortcuts**: Custom keyboard shortcuts per page
- **Themes**: Per-page theme customization

## Troubleshooting

### Common Issues

1. **Sidebar not collapsing**: Check if page is protected
2. **Animations stuttering**: Verify GPU acceleration is enabled
3. **State not persisting**: Check localStorage availability
4. **Mobile issues**: Verify touch event handling

### Debug Mode

```typescript
// Enable debug logging
const navigationStore = useNavigationStore()
navigationStore.$onAction(({ name, args }) => {
  console.log(`Navigation action: ${name}`, args)
})
```

## Contributing

When adding new navigation features:

1. **Update Store**: Add new methods to `useNavigationStore`
2. **Update Component**: Modify SideNav.vue as needed
3. **Add Tests**: Include unit tests for new functionality
4. **Update Docs**: Document new features and API changes
5. **Test Accessibility**: Ensure new features are accessible

---

*This documentation is maintained as part of the GHOST project. For questions or improvements, please consult the development team.*