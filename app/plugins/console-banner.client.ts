/**
 * Prints a fun ASCII art banner and registers easter eggs in the browser console.
 */
export default defineNuxtPlugin(() => {
  const banner = `
 ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
██║  ███╗███████║██║   ██║███████╗   ██║
██║   ██║██╔══██║██║   ██║╚════██║   ██║
╚██████╔╝██║  ██║╚██████╔╝███████║   ██║
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝
`

  const config = useRuntimeConfig()
  const version = config.public.appVersion || ''
  const env = config.public.environment || 'local'

  console.log(
    `%c${banner}`,
    'color: #6366f1; font-family: monospace; font-size: 12px;'
  )
  console.log(
    `%c  v${version} • ${env} %c\n  Welcome to the GHOST Dashboard 👻\n`,
    'color: #6366f1; font-weight: bold;',
    'color: #a5b4fc;'
  )

  // --- Easter Eggs ---

  // Konami Code → ghost parade
  const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let konamiIndex = 0
  window.addEventListener('keydown', (e) => {
    if (e.key === konamiSequence[konamiIndex]) {
      konamiIndex++
      if (konamiIndex === konamiSequence.length) {
        konamiIndex = 0
        launchGhostParade()
      }
    }
    else {
      konamiIndex = 0
    }
  })

  // Type "ghost" anywhere on the page → spooky console message
  const ghostWord: string[] = []
  // Type "aws" anywhere on the page → Cloud Matrix rain
  const awsWord: string[] = []
  window.addEventListener('keypress', (e) => {
    const key = e.key.toLowerCase()
    ghostWord.push(key)
    if (ghostWord.length > 5) ghostWord.shift()
    if (ghostWord.join('') === 'ghost') {
      const spookyMessages = [
        '👻 You summoned the GHOST... costs are haunting your accounts.',
        '🕯️ The spirits of unused EC2 instances cry out for termination...',
        '💀 Somewhere, an S3 bucket with no lifecycle policy weeps.',
        '🎃 BOO! Your CloudTrail has detected... you typing "ghost".',
        '👁️ The all-seeing GHOST watches over your AWS empire.',
        '🦇 A wild unattached EBS volume appears in the shadows...',
        '⚰️ Here lies: that Lambda function nobody remembers deploying.',
      ]
      const msg = spookyMessages[Math.floor(Math.random() * spookyMessages.length)]
      console.log(`%c${msg}`, 'color: #a855f7; font-size: 14px; font-weight: bold;')
    }

    awsWord.push(key)
    if (awsWord.length > 3) awsWord.shift()
    if (awsWord.join('') === 'aws') {
      launchCloudMatrix()
    }
  })

  // Console helper: window.ghost.haunt() and friends
  ;(window as any).ghost = {
    haunt() {
      const ghost = document.createElement('div')
      ghost.textContent = '👻'
      ghost.style.cssText = 'position:fixed;font-size:48px;z-index:99999;pointer-events:none;transition:all 2s ease-in;'
      ghost.style.left = `${Math.random() * 80 + 10}%`
      ghost.style.bottom = '-60px'
      document.body.appendChild(ghost)
      requestAnimationFrame(() => {
        ghost.style.bottom = '110%'
        ghost.style.opacity = '0'
      })
      setTimeout(() => ghost.remove(), 2500)
      return '👻 A ghost drifts through your dashboard...'
    },
    wisdom() {
      const tips = [
        '💡 Tip: Tag your resources. Future-you will thank present-you.',
        '💡 Tip: Review your Security Hub findings weekly. Or, you know, monthly. Just review them.',
        '💡 Tip: Unused Elastic IPs cost money even when doing nothing. Relatable, but expensive.',
        '💡 Tip: Set up budget alerts before your manager sets up a meeting.',
        '💡 Tip: gp3 volumes are cheaper than gp2. The migration is worth it.',
        '💡 Tip: Check your S3 storage classes. Not everything needs to be Standard.',
        '💡 Tip: Right-size your instances. That m5.4xlarge running at 2% CPU is judging you.',
      ]
      const tip = tips[Math.floor(Math.random() * tips.length)]
      console.log(`%c${tip}`, 'color: #22d3ee; font-size: 13px;')
      return tip
    },
    status() {
      console.log('%c📊 GHOST System Status', 'color: #6366f1; font-size: 16px; font-weight: bold;')
      console.log(`%c  Environment: ${env}`, 'color: #a5b4fc;')
      console.log(`%c  Version: ${version}`, 'color: #a5b4fc;')
      console.log(`%c  Uptime: ${Math.floor(performance.now() / 1000)}s`, 'color: #a5b4fc;')
      console.log(`%c  Vibe: immaculate 👻`, 'color: #a5b4fc;')
    },
    credits() {
      console.log(`%c
  ╔═══════════════════════════════════════════════════╗
  ║          Built with 💜 by the                     ║
  ║        GDMS LZ Team - Dylan Lewis                ║
  ║                                                   ║
  ║   Powered by: Nuxt · Vue · AWS                   ║
  ║   Let's be real, this is mostly an AI vibe site   ║
  ╚═══════════════════════════════════════════════════╝
      `, 'color: #6366f1; font-family: monospace;')
    },
    tarot() {
      const deck = [
        { name: 'The EC2 Instance', reading: 'A powerful force awaits deployment. But beware — it may be oversized for your needs.', advice: 'Right-size before you regret-size.' },
        { name: 'The S3 Bucket (Reversed)', reading: 'Your data sprawls unchecked. Lifecycle policies cry out from the void.', advice: 'Enable versioning, or lose everything to a misplaced DeleteObject.' },
        { name: 'The Lambda Timeout', reading: 'A function runs in circles, never reaching its destiny.', advice: 'Check your async awaits. The cold start is a metaphor for your Monday.' },
        { name: 'The IAM Wildcard', reading: 'Great power has been granted with no boundaries. Chaos looms.', advice: 'Replace that * with least-privilege. Your security team will thank you.' },
        { name: 'The Cost Anomaly', reading: 'An unexpected surge emerges from the fog. Its source is unclear.', advice: 'Check CloudTrail. Someone discovered on-demand pricing.' },
        { name: 'The Unattached EBS', reading: 'A volume drifts in the void, consuming credits yet serving no master.', advice: 'Delete or reattach. Forgotten storage is the silent budget killer.' },
        { name: 'The Security Group', reading: 'A door stands wide open. All of the internet peers inside.', advice: '0.0.0.0/0 on port 22 is not a "temporary" fix. It never was.' },
        { name: 'The CloudFormation Stack', reading: 'Layers of infrastructure reach toward the sky. One wrong parameter and it all crumbles.', advice: 'Always use ChangeSets. YOLO deploys are for personal accounts only.' },
        { name: 'The Reserved Instance', reading: 'A commitment was made long ago. Its terms bind you still.', advice: 'Check your RI utilization. That commitment should be working for you.' },
        { name: 'The Orphaned Snapshot', reading: 'A ghost of data past lingers in your account, accruing charges in silence.', advice: 'Audit your snapshots. The past should stay buried.' },
        { name: 'The NAT Gateway', reading: 'Data flows freely, but at great cost. Each byte extracts its toll.', advice: 'Consider VPC endpoints. Your wallet will breathe easier.' },
        { name: 'The Auto Scaling Group', reading: 'Forces gather and disperse with the tides. Balance is key.', advice: 'Set sensible min/max. Scaling to zero means your app goes on vacation.' },
      ]
      const card = deck[Math.floor(Math.random() * deck.length)]!
      console.log(`%c
╔════════════════════════════════════════╗
║           🔮 AWS TAROT 🔮             ║
╠════════════════════════════════════════╣
║                                        ║
║  ${card.name}
║                                        ║
║  ${card.reading}
║                                        ║
║  💡 ${card.advice}
║                                        ║
╚════════════════════════════════════════╝
`, 'color: #a78bfa; font-family: monospace; font-size: 12px;')
      return '🔮 The cards have spoken...'
    },
  }

  // Ghost parade: float a bunch of ghosts across the screen
  function launchGhostParade() {
    console.log('%c🎉 KONAMI CODE ACTIVATED — GHOST PARADE! 🎉', 'color: #f59e0b; font-size: 18px; font-weight: bold;')
    const emojis = ['👻', '💀', '🎃', '🕷️', '🦇', '👾', '🕯️', '⚰️']
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const el = document.createElement('div')
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)] ?? '👻'
        el.style.cssText = `
          position: fixed;
          font-size: ${24 + Math.random() * 32}px;
          z-index: 99999;
          pointer-events: none;
          top: ${Math.random() * 80 + 5}%;
          left: -60px;
          transition: all ${2 + Math.random() * 3}s linear;
          opacity: 0.9;
        `
        document.body.appendChild(el)
        requestAnimationFrame(() => {
          el.style.left = `calc(100vw + 60px)`
          el.style.top = `${Math.random() * 80 + 5}%`
          el.style.opacity = '0'
        })
        setTimeout(() => el.remove(), 6000)
      }, i * 200)
    }
  }

  // Triple-click footer ghost icon → haunted cursor trail
  setTimeout(() => {
    const footerGhost = document.querySelector('footer [class*="fa6-solid-ghost"]')
    if (footerGhost) {
      let clickCount = 0
      let clickTimer: ReturnType<typeof setTimeout> | null = null
      footerGhost.addEventListener('click', () => {
        clickCount++
        if (clickTimer) clearTimeout(clickTimer)
        clickTimer = setTimeout(() => { clickCount = 0 }, 500)
        if (clickCount === 3) {
          clickCount = 0
          console.log('%c👻 Haunted cursor activated! The spirits follow you...', 'color: #a855f7; font-size: 14px; font-weight: bold;')
          let lastTime = 0
          const onMove = (e: MouseEvent) => {
            const now = Date.now()
            if (now - lastTime < 80) return
            lastTime = now
            const ghost = document.createElement('div')
            ghost.textContent = '👻'
            ghost.style.cssText = `position:fixed; font-size:16px; z-index:99999; pointer-events:none; opacity:0.15; transition:all 1.5s ease-out; left:${e.clientX}px; top:${e.clientY}px;`
            document.body.appendChild(ghost)
            requestAnimationFrame(() => {
              ghost.style.opacity = '0'
              ghost.style.top = `${e.clientY - 30}px`
            })
            setTimeout(() => ghost.remove(), 1600)
          }
          window.addEventListener('mousemove', onMove)
          setTimeout(() => {
            window.removeEventListener('mousemove', onMove)
            console.log('%c👻 The spirits have returned to the ether...', 'color: #a855f7; font-size: 14px;')
          }, 30000)
        }
      })
    }
  }, 1000)

  // Cloud Matrix: AWS service rain
  function launchCloudMatrix() {
    console.log('%c☁️ It\'s raining services...', 'color: #34d399; font-size: 14px; font-weight: bold;')
    const services = ['EC2', 'S3', 'Lambda', 'DynamoDB', 'CloudFront', 'SQS', 'SNS', 'EKS', 'Fargate', 'Glue', 'Athena', 'Bedrock', 'IAM', 'VPC', 'EBS', 'RDS', 'Route53', 'CloudWatch', 'Kinesis', 'SageMaker']
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed; inset:0; z-index:99999; pointer-events:none; overflow:hidden;'
    document.body.appendChild(container)
    for (let i = 0; i < 25; i++) {
      const col = document.createElement('div')
      const speed = 2 + Math.random() * 2
      col.textContent = services[Math.floor(Math.random() * services.length)]!
      col.style.cssText = `position:absolute; top:-30px; left:${(i / 25) * 100}%; font-family:monospace; font-size:14px; color:#34d399; opacity:${0.3 + Math.random() * 0.7}; transition:transform ${speed}s linear; white-space:nowrap;`
      container.appendChild(col)
      // Cycle text content
      const interval = setInterval(() => {
        col.textContent = services[Math.floor(Math.random() * services.length)]!
      }, 300)
      requestAnimationFrame(() => {
        col.style.transform = `translateY(${window.innerHeight + 60}px)`
      })
      setTimeout(() => clearInterval(interval), speed * 1000)
    }
    setTimeout(() => container.remove(), 6000)
  }

  // Friendly hint in the console
  console.log(
    '%c  💡 Psst... try ghost.haunt(), ghost.wisdom(), ghost.status(), ghost.credits(), or ghost.tarot() in the console.',
    'color: #64748b; font-style: italic; font-size: 11px;'
  )
})
