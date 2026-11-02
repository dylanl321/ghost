import assert from 'node:assert/strict'
import test from 'node:test'
import {
  budgetStatus,
  buildAccountTiles,
  buildAttentionItems,
  buildCostNarrative,
  detectGroupSelection
} from '../../shared/utils/cost-dashboard'

const accounts = [
  { id: 'a1', name: 'Project Borealis 42', spend: 27_500, budget: 25_200, lineOfBusiness: 'Mission Systems', department: 'Space' },
  { id: 'a2', name: 'Project Falcon 14', spend: 27_200, budget: 22_100, lineOfBusiness: 'Mission Systems', department: 'Air' },
  { id: 'a3', name: 'Project Echo 29', spend: 25_800, budget: 3_700, lineOfBusiness: 'IT Services', department: 'Cyber' },
  { id: 'a4', name: 'Project Cobalt 3', spend: 24_200, budget: 31_200, lineOfBusiness: 'Corporate', department: 'Finance' },
  { id: 'a5', name: 'Project Echo 45', spend: 2_600, budget: 8_000, lineOfBusiness: 'IT Services', department: 'Cyber' },
  { id: 'a6', name: 'Project Atlas 1', spend: 1_000, budget: 0, lineOfBusiness: 'Corporate', department: 'Finance' }
]

test('budgetStatus uses the Budget Health thresholds', () => {
  assert.equal(budgetStatus(101, 100), 'over')
  assert.equal(budgetStatus(100, 100), 'healthy')
  assert.equal(budgetStatus(50, 100), 'healthy')
  assert.equal(budgetStatus(49, 100), 'under')
  assert.equal(budgetStatus(10, 0), 'no-budget')
})

test('a whole line of business is detected as a group selection', () => {
  assert.deepEqual(detectGroupSelection(['a1', 'a2'], accounts), { kind: 'lob', name: 'Mission Systems' })
  assert.deepEqual(detectGroupSelection(['a5', 'a3'], accounts), { kind: 'lob', name: 'IT Services' })
})

test('partial groups, single accounts and unknown ids are not group selections', () => {
  assert.equal(detectGroupSelection(['a1'], accounts), null)
  assert.equal(detectGroupSelection(['a1', 'a3'], accounts), null)
  assert.equal(detectGroupSelection(['a1', 'a2', 'zz'], accounts), null)
  assert.equal(detectGroupSelection([], accounts), null)
})

test('a whole department is detected when it is not also a whole LOB', () => {
  const list = [
    { id: 'x', lineOfBusiness: 'L1', department: 'D1' },
    { id: 'y', lineOfBusiness: 'L2', department: 'D1' },
    { id: 'z', lineOfBusiness: 'L2', department: 'D2' }
  ]
  assert.deepEqual(detectGroupSelection(['x', 'y'], list), { kind: 'department', name: 'D1' })
})

test('narrative names the overrun and its biggest drivers', () => {
  const n = buildCostNarrative({ periodPhrase: 'In October', scopeLabel: 'all 6 accounts', accounts })
  assert.equal(n.tone, 'over')
  // spend 108.3K vs budget 90.2K (the account without a budget adds spend but no budget)
  assert.equal(n.emphasis, '$18.1K over')
  assert.match(n.text, /^In October, all 6 accounts spent \$108\.3K against a \$90\.2K budget, \$18\.1K over\. Echo 29 and Falcon 14 drive \d+% of the overrun\.$/)
  assert.equal(n.text, `${n.lead}${n.emphasis}${n.tail}`)
})

test('narrative says when the scope is under budget but some accounts are over', () => {
  const n = buildCostNarrative({ periodPhrase: 'In October', scopeLabel: 'Corporate and Mission Systems', accounts: [accounts[0]!, accounts[3]!] })
  assert.equal(n.tone, 'under')
  assert.equal(n.text, 'In October, Corporate and Mission Systems spent $51.7K against a $56.4K budget, $4.7K under, though 1 account is over its own budget, led by Borealis 42.')
})

test('narrative for a single account and for no budget', () => {
  const single = buildCostNarrative({ periodPhrase: 'So far this quarter', scopeLabel: 'Project Echo 29', accounts: [accounts[2]!] })
  assert.equal(single.text, 'So far this quarter, Project Echo 29 spent $25.8K against a $3.7K budget, $22.1K over.')
  const none = buildCostNarrative({ periodPhrase: 'In October', scopeLabel: 'Project Atlas 1', accounts: [accounts[5]!] })
  assert.equal(none.tone, 'neutral')
  assert.equal(none.text, 'In October, Project Atlas 1 spent $1.0K. No budget is set for this account.')
})

test('narrative names the only accounts over budget instead of a share', () => {
  const n = buildCostNarrative({ periodPhrase: 'In October', scopeLabel: 'IT Services', accounts: [accounts[2]!, accounts[4]!] })
  assert.match(n.text, /Echo 29 is the only account over budget\.$/)
})

test('attention feed ranks critical items first and limits overruns', () => {
  const items = buildAttentionItems({
    accounts,
    alertsBySeverity: { critical: 1, warning: 2 },
    currentDayOfMonth: 2,
    carriedForward: { count: 3, year: 2027, from: 2026 },
    untaggedShare: 0.08,
    maxOverruns: 2
  })
  assert.deepEqual(items.map(i => i.id), ['overrun:a3', 'budget-alerts', 'overrun:a2', 'carried-forward', 'early-month', 'untagged'])
  assert.equal(items[0]!.title, 'Echo 29 is at 697% of budget')
  assert.equal(items[0]!.action.accountId, 'a3')
  assert.equal(items[1]!.body, '1 critical, 2 warnings.')
  assert.equal(items.find(i => i.id === 'untagged')!.severity, 'info')
})

test('attention feed drops overruns and budget notices for past periods', () => {
  const items = buildAttentionItems({ accounts, isHistorical: true, carriedForward: { count: 3, year: 2027, from: 2026 } })
  assert.deepEqual(items.map(i => i.kind), ['historical'])
  assert.equal(items[0]!.action.type, 'switch-to-this-month')
})

test('attention feed is empty when nothing needs a look', () => {
  assert.deepEqual(buildAttentionItems({ accounts: [accounts[3]!], currentDayOfMonth: 20, untaggedShare: 0.01 }), [])
})

test('account tiles group by LOB, sort by spend and weight by the largest account', () => {
  const groups = buildAccountTiles(accounts, { groupBy: 'lob', selectedIds: ['a2'] })
  assert.deepEqual(groups.map(g => g.name), ['Mission Systems', 'IT Services', 'Corporate'])
  const ms = groups[0]!
  assert.equal(ms.name, 'Mission Systems')
  assert.deepEqual(ms.tiles.map(t => t.id), ['a1', 'a2'])
  assert.equal(ms.tiles[0]!.weight, 1)
  assert.equal(ms.tiles[0]!.dimmed, true)
  assert.equal(ms.tiles[1]!.selected, true)
  const atlas = groups.flatMap(g => g.tiles).find(t => t.id === 'a6')!
  assert.equal(atlas.status, 'no-budget')
  assert.equal(atlas.utilization, null)
  assert.equal(atlas.weight, 0.08)
})

test('ungrouped tiles come back as one unnamed group', () => {
  const groups = buildAccountTiles(accounts)
  assert.equal(groups.length, 1)
  assert.equal(groups[0]!.name, null)
  assert.equal(groups[0]!.tiles.every(t => !t.dimmed), true)
})

test('narrative supports a prorated budget noun and a no-budget note', () => {
  const pace = buildCostNarrative({ periodPhrase: 'So far this month', scopeLabel: 'Project Echo 29', budgetNoun: 'budget to date', accounts: [accounts[2]!] })
  assert.equal(pace.text, 'So far this month, Project Echo 29 spent $25.8K against a $3.7K budget to date, $22.1K over.')
  const past = buildCostNarrative({ periodPhrase: 'Last month', scopeLabel: 'all 6 accounts', noBudgetText: 'Budgets are not compared for past periods.', accounts: accounts.map(a => ({ ...a, budget: 0 })) })
  assert.equal(past.text, 'Last month, all 6 accounts spent $108.3K. Budgets are not compared for past periods.')
})
