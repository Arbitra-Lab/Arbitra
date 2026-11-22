# UI Components Implementation Guide

This document provides guidelines and best practices for implementing the following UI components in the Arbitra frontend:

- Pagination and Infinite Scroll
- Responsive Mobile Navigation & Menu
- Advanced Image Gallery & Lightbox
- Referral & Rewards UI

## 1. Pagination and Infinite Scroll (#163)

### Overview
Implement pagination and infinite scroll functionality for list displays across the application.

### Implementation Guidelines

#### Pagination Component
- Use a reusable `Pagination` component located in `/frontend/components/ui/Pagination.tsx`
- Support configurable page sizes (10, 20, 50 items per page)
- Display current page indicator and total page count
- Include first, previous, next, and last page navigation buttons
- Handle edge cases: first page, last page, empty results

#### Infinite Scroll Component
- Implement intersection observer pattern for detecting scroll near bottom
- Support lazy loading of additional items
- Display loading indicator while fetching
- Handle errors gracefully with retry capability
- Prevent duplicate requests during simultaneous scroll events

#### Usage Example
```typescript
// Pagination approach
<Pagination
  currentPage={page}
  totalPages={Math.ceil(total / pageSize)}
  pageSize={pageSize}
  onPageChange={setPage}
/>

// Infinite scroll approach
<InfiniteScroll
  items={items}
  isLoading={loading}
  hasMore={hasMore}
  onLoadMore={loadMore}
/>
```

#### Testing Considerations
- Test pagination state changes and URL parameter updates
- Verify infinite scroll triggers at appropriate scroll positions
- Test network error handling and retry logic
- Validate accessibility of navigation controls

---

## 2. Responsive Mobile Navigation & Menu (#162)

### Overview
Build a responsive, mobile-friendly navigation menu that adapts across different screen sizes.

### Implementation Guidelines

#### Mobile Navigation Component
- Implement hamburger menu icon for mobile devices (< 768px)
- Use collapsible sidebar or drawer pattern
- Support touch-friendly tap targets (minimum 44x44px)
- Implement smooth slide-in/out animations
- Close menu on route change

#### Desktop Navigation
- Display full horizontal navigation bar
- Implement dropdown menus for nested items
- Hover effects for menu items
- Support keyboard navigation (Tab, Enter, Escape)

#### Structure Example
```typescript
// Mobile Menu (drawer/sidebar)
<MobileNav>
  <NavLink href="/dashboard">Dashboard</NavLink>
  <NavLink href="/properties">Properties</NavLink>
  <NavLink href="/rewards">Rewards & Referrals</NavLink>
  <NavLink href="/settings">Settings</NavLink>
</MobileNav>

// Desktop Nav (header)
<DesktopNav>
  <NavBar>
    <NavItem>Dashboard</NavItem>
    <NavItem>Properties</NavItem>
    <DropdownMenu>Rewards</DropdownMenu>
  </NavBar>
</DesktopNav>
```

#### Responsive Breakpoints
- Mobile: < 768px (hamburger menu)
- Tablet: 768px - 1024px (compact nav)
- Desktop: > 1024px (full nav)

#### Testing Considerations
- Test menu toggle on different screen sizes
- Verify touch event handling on mobile devices
- Test keyboard navigation accessibility
- Validate animation performance

---

## 3. Advanced Image Gallery & Lightbox (#158)

### Overview
Implement an advanced image gallery component with lightbox functionality for displaying property images, documents, and media.

### Implementation Guidelines

#### Gallery Component Features
- Display thumbnail grid with responsive columns
- Support multiple image formats (JPEG, PNG, WebP)
- Implement lazy loading for images below the fold
- Display image count badge
- Support drag-and-drop reordering (optional)

#### Lightbox Component Features
- Full-screen image display
- Previous/Next navigation arrows
- Close button and keyboard escape support
- Display image metadata (title, description, date)
- Support image zoom in/out
- Touch gesture support (swipe left/right on mobile)
- Thumbnail strip at bottom for quick navigation

#### Structure Example
```typescript
<Gallery>
  <GalleryImage src="/image1.jpg" alt="Property view" />
  <GalleryImage src="/image2.jpg" alt="Living room" />
  <GalleryImage src="/image3.jpg" alt="Bedroom" />
</Gallery>

<Lightbox
  images={images}
  initialIndex={0}
  onClose={handleClose}
  onNavigate={handleNavigate}
/>
```

#### Performance Optimization
- Use next/image for automatic optimization
- Implement blur placeholder for images
- Load high-resolution images only in lightbox
- Cache image dimensions to prevent layout shift

#### Testing Considerations
- Test navigation between images
- Verify lightbox opens/closes correctly
- Test keyboard shortcuts (Arrow keys, Escape)
- Validate touch gestures on mobile
- Test lazy loading of thumbnails

---

## 4. Referral & Rewards UI (#157)

### Overview
Build a comprehensive UI for displaying and managing referral programs and rewards tracking.

### Implementation Guidelines

#### Referral Display Component
- Show unique referral link/code
- Display copy-to-clipboard functionality
- Show referral status (active, pending, completed)
- Display commission/reward amounts
- Track referral milestones and tiers

#### Rewards Dashboard
- Display total rewards earned
- Show reward breakdown by source (referrals, tasks, bonuses)
- Implement reward redemption interface
- Display reward history with timestamps
- Show pending vs. completed rewards

#### User Stats Component
- Number of active referrals
- Total referred users
- Conversion rates
- Earning summary (this month, all-time)

#### Structure Example
```typescript
<ReferralCard>
  <ReferralLink link={referralLink} />
  <ReferralStats>
    <Stat label="Active Referrals" value={count} />
    <Stat label="Total Earned" value={earned} />
  </ReferralStats>
</ReferralCard>

<RewardsPanel>
  <RewardsSummary total={totalRewards} />
  <RewardsList rewards={rewardHistory} />
  <RedeemButton onRedeem={handleRedeem} />
</RewardsPanel>
```

#### Data Integration
- Fetch referral data from `/api/referrals` endpoint
- Poll for real-time reward updates
- Support offline caching of reward data
- Implement optimistic updates for user interactions

#### Testing Considerations
- Test referral link copying functionality
- Verify reward calculations and display
- Test redemption flow
- Validate data persistence and sync
- Test error states and retry logic

---

## Common Patterns Across Components

### State Management
- Use Zustand store for global state management
- Implement local component state with `useState` for UI state
- Use TanStack Query for server state and caching

### Error Handling
- Display user-friendly error messages
- Provide retry mechanism for failed operations
- Log errors for debugging
- Gracefully degrade functionality when API unavailable

### Accessibility (a11y)
- Use semantic HTML elements
- Implement ARIA labels and descriptions
- Support keyboard navigation
- Ensure sufficient color contrast
- Test with screen readers

### Performance
- Implement code splitting for large components
- Use React.memo for expensive components
- Optimize re-renders with useMemo/useCallback
- Implement virtual scrolling for large lists
- Monitor Core Web Vitals

### Mobile Optimization
- Touch-friendly button sizes (minimum 44x44px)
- Optimize font sizes for readability
- Test on various device sizes
- Implement viewport meta tag
- Support device orientation changes

---

## Testing Strategy

### Unit Tests
- Test component rendering with different props
- Verify event handlers work correctly
- Test state changes and prop updates

### Integration Tests
- Test component interaction with parent components
- Verify API calls are made correctly
- Test data flow between components

### E2E Tests
- Test complete user workflows
- Verify navigation and routing
- Test form submissions and interactions

### Accessibility Testing
- Use axe DevTools for automated checks
- Test with keyboard navigation
- Test with screen readers
- Manual testing with different input methods

---

## References

- React Documentation: https://react.dev
- Next.js Documentation: https://nextjs.org/docs
- TailwindCSS: https://tailwindcss.com
- Accessibility (WCAG): https://www.w3.org/WAI/WCAG21/quickref/
- Web Vitals: https://web.dev/vitals/
