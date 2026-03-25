const logger = createLogger('CostTour')

export type StartCostTourOptions = {
  startAtStep?: number
  onComplete?: () => void
  onExit?: (currentStep: number) => void
}

export function getCostTourSteps() {
  return [
    {
      element: '[data-tour="costs-header"]',
      popover: {
        title: 'Welcome to Cost Analytics',
        description: 'Monitor and analyze AWS spending across your accounts. Switch between Billable (actuals) and Proforma (forecasts), and select your timeframe.',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="account-selector"]',
      popover: {
        title: 'Account Selection',
        description: 'Browse accounts organized by All, LOB, Department, or Smart groups. Use checkboxes to select individual accounts or click the group icon to select all accounts in a group.',
        side: 'right' as const
      }
    },
    {
      element: '[data-tour="costs-summary"]',
      popover: {
        title: 'Summary Cards',
        description: 'View key metrics at a glance: total accounts selected, budget, current spend, and budget utilization percentage.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="costs-chart"]',
      popover: {
        title: 'Interactive Charts',
        description: 'Explore visual analytics with multiple chart types. Hover over charts for detailed breakdowns and historical trends.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="chart-tabs"]',
      popover: {
        title: 'Chart Categories',
        description: 'Switch between Smart (AI-recommended), Organizational, Trends, Budget Health, and Data Table views to analyze costs from different perspectives.',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="costs-help"]',
      popover: {
        title: 'Help & Resources',
        description: 'Access documentation, restart this tour, or export reports anytime. Click here for guides on features like Billable vs Proforma comparisons.',
        side: 'left' as const
      }
    },
    {
      element: '[data-tour="costs-settings"]',
      popover: {
        title: 'Cost Settings',
        description: 'Configure filters, thresholds, and display options to customize your cost view.',
        side: 'left' as const
      }
    },
    {
      element: '[data-tour="data-table"]',
      popover: {
        title: 'Data Table',
        description: 'View detailed per-account data with sorting, column selection, and export capabilities.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="export-button"]',
      popover: {
        title: 'Reports & Exports',
        description: 'Export data as PDF, CSV, or Excel. Schedule recurring reports or generate shareable links.',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="budget-alerts"]',
      popover: {
        title: 'Budget Alerts',
        description: 'Monitor accounts approaching or exceeding their budgets with severity-based alerting.',
        side: 'top' as const
      }
    }
  ]
}

export async function startCostTour(options: StartCostTourOptions = {}) {
  const { driver } = await import('driver.js')
  await import('driver.js/dist/driver.css')
  await import('~/assets/css/tour.css')

  const allSteps = getCostTourSteps()

  // Filter steps to only include those where elements exist in the DOM
  const validSteps = allSteps.filter(step => {
    if (typeof step.element === 'string') {
      const element = document.querySelector(step.element)
      return element !== null
    }
    return true
  })

  if (validSteps.length === 0) {
    logger.warn('No valid tour steps found - elements may not be in the DOM yet')
    throw new Error('No valid tour steps found. Please ensure the page has fully loaded.')
  }

  // Track if tour was completed or just closed
  let tourCompleted = false
  let currentStepIndex = 0

  // Create driver instance with configuration and steps
  const driverObj = driver({
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: '✓ Done',
    steps: validSteps,
    // Custom styling using CSS variables
    popoverClass: 'ghost-tour-popover',
    // Smooth animations
    animate: true,
    // Padding around highlighted element
    padding: 10,
    // Allow clicking on overlay to close
    allowClose: true,
    // Callbacks
    onNextClick: () => {
      // Check if we're on the last step (Done button is the Next button on last step)
      if (currentStepIndex === validSteps.length - 1) {
        tourCompleted = true
        driverObj.destroy()
      } else {
        currentStepIndex++
        driverObj.moveNext()
      }
    },
    onPrevClick: () => {
      currentStepIndex--
      driverObj.movePrevious()
    },
    onCloseClick: () => {
      // X button always exits without completion
      driverObj.destroy()
    },
    onDestroyStarted: () => {
      // Save progress when tour is being destroyed
      if (!tourCompleted) {
        options.onExit?.(currentStepIndex)
      }
    },
    onDestroyed: () => {
      // Only call onComplete if the tour was actually completed
      if (tourCompleted) {
        options.onComplete?.()
      }
    }
  })

  // Start the tour (no args needed since steps are in config)
  driverObj.drive()

  // If starting at a specific step, navigate to it
  if (options.startAtStep && options.startAtStep > 0 && options.startAtStep < validSteps.length) {
    currentStepIndex = options.startAtStep
    // Wait a bit for tour to initialize, then move to the specified step
    setTimeout(() => {
      for (let i = 0; i < options.startAtStep!; i++) {
        driverObj.moveNext()
      }
    }, 100)
  }

  return driverObj
}


