export type StartAccountTourOptions = {
  startAtStep?: number
  onComplete?: () => void
  onExit?: (currentStep: number) => void
}

export function getAccountTourSteps() {
  return [
    {
      element: '[data-tour="account-header"]',
      popover: {
        title: 'Account Overview',
        description: 'Header shows account status, quick actions, and navigation shortcuts.',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="account-docs-link"]',
      popover: {
        title: 'Documentation Links',
        description: 'Use these help icons to open related docs. Favorites help is here; more docs live in Support.',
        side: 'left' as const
      }
    },
    {
      element: '[data-tour="account-tabs"]',
      popover: {
        title: 'Sections',
        description: 'Switch between Overview, Resources, Policies, and Pipelines for deeper insights.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="account-details"]',
      popover: {
        title: 'Account Details',
        description: 'Key metadata including project info, ownership, tags, and contacts.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="account-budget"]',
      popover: {
        title: 'Budget Health',
        description: 'Compare current spend vs budget and review forecast risk.',
        side: 'top' as const
      }
    },
    {
      element: '[data-tour="account-users"]',
      popover: {
        title: 'Users and Access',
        description: 'See who has access to this account and contact them quickly.',
        side: 'right' as const
      }
    },
    {
      element: '[data-tour="account-cost-trend"]',
      popover: {
        title: 'Cost Trends',
        description: 'Review recent billable and proforma spend for this account.',
        side: 'top' as const
      }
    }
  ]
}

export async function startAccountTour(options: StartAccountTourOptions = {}) {
  const { driver } = await import('driver.js')
  await import('driver.js/dist/driver.css')

  const allSteps = getAccountTourSteps()
  
  // Filter steps to only include those where elements exist in the DOM
  const validSteps = allSteps.filter(step => {
    if (typeof step.element === 'string') {
      const element = document.querySelector(step.element)
      return element !== null
    }
    return true
  })

  if (validSteps.length === 0) {
    console.warn('No valid tour steps found - elements may not be in the DOM yet')
    throw new Error('No valid tour steps found. Please ensure the page has fully loaded.')
  }

  // Create driver instance with configuration and steps
  // According to driver.js docs, you can pass steps in config or to drive()
  const driverObj = driver({
    allowClose: true,
    smoothScroll: true,
    showProgress: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: validSteps, // Pass steps in config
    onDestroyStarted: (element, step, opts) => {
      // Get current step index from state before tour is destroyed
      const currentStep = opts.state.activeIndex ?? 0
      options.onExit?.(currentStep)
    },
    onDestroyed: () => {
      options.onComplete?.()
    }
  })

  // Start the tour (no args needed since steps are in config)
  driverObj.drive()

  // If starting at a specific step, navigate to it
  if (options.startAtStep && options.startAtStep > 0 && options.startAtStep < validSteps.length) {
    // Wait a bit for tour to initialize, then move to the specified step
    setTimeout(() => {
      for (let i = 0; i < options.startAtStep; i++) {
        driverObj.moveNext()
      }
    }, 100)
  }

  return driverObj
}


