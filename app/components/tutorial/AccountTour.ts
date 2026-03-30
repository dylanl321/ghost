const logger = createLogger('AccountTour')

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
        title: 'Welcome to Account Details',
        description: 'View comprehensive details for this AWS account including status, users, costs, and resources. Use the star icon to favorite accounts for quick access, and click "AWS Console" to access the account directly.',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="account-tabs"]',
      popover: {
        title: 'Account Information Tabs',
        description: 'Navigate between Overview (costs and users), Resources (EC2, S3, EBS), Policies (SCPs and permissions), Pipelines (data pipelines), and Notes (admin only).',
        side: 'bottom' as const
      }
    },
    {
      element: '[data-tour="account-details"]',
      popover: {
        title: 'Account Details & Budget Health',
        description: 'View key account information, organizational structure, and monitor budget utilization with visual indicators showing current spend vs budget and forecast.',
        side: 'right' as const
      }
    },
    {
      element: '[data-tour="account-users"]',
      popover: {
        title: 'Users & Cost Trends',
        description: 'See who has access to this account, contact them quickly, and review recent billable and proforma spending trends.',
        side: 'right' as const
      }
    }
  ]
}

export async function startAccountTour(options: StartAccountTourOptions = {}) {
  const { driver } = await import('driver.js')
  await import('driver.js/dist/driver.css')
  await import('~/assets/css/tour.css')

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
    popoverClass: 'ghost-tour-popover',
    animate: true,
    padding: 10,
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

  // Start the tour
  driverObj.drive()

  // If starting at a specific step, navigate to it
  if (options.startAtStep && options.startAtStep > 0 && options.startAtStep < validSteps.length) {
    currentStepIndex = options.startAtStep
    setTimeout(() => {
      for (let i = 0; i < options.startAtStep!; i++) {
        driverObj.moveNext()
      }
    }, 100)
  }

  return driverObj
}


