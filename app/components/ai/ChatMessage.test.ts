/**
 * Property-based tests for ChatMessage component
 * 
 * These tests validate the correctness properties defined in the design document:
 * - Property 4: Fixed Loading Bubble Height
 * - Property 5: Opacity-Only Transitions  
 * - Property 6: Text Truncation Consistency
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { fc } from 'fast-check'
import ChatMessage from './ChatMessage.vue'
import type { ChatMessage as ChatMessageType } from '~/shared/types/chat-threads'

// Mock the composables used by ChatMessage
const mockEnrichStrandsResponse = (content: string) => content
vi.mock('~/composables/useStrandsResponseEnricher', () => ({
    useStrandsResponseEnricher: () => ({
        enrichStrandsResponse: mockEnrichStrandsResponse
    })
}))

// Generator for status history items
const statusHistoryItemArb = fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 9999999999 })
})

// Generator for chat messages with status history
const chatMessageWithStatusArb = fc.record({
    id: fc.string(),
    role: fc.constantFrom('user', 'assistant'),
    content: fc.string(),
    timestamp: fc.integer({ min: 1000000000, max: 9999999999 }),
    status: fc.record({
        status: fc.constantFrom('pending', 'streaming'),
        statusHistory: fc.array(statusHistoryItemArb, { minLength: 0, maxLength: 10 })
    })
}) as fc.Arbitrary<ChatMessageType & { status: { status: 'pending' | 'streaming', statusHistory: Array<{ text: string, timestamp: number }> } }>

describe('ChatMessage - Loading Bubble Stability', () => {

    /**
     * **Feature: chatbot-ui-refinement, Property 4: Fixed Loading Bubble Height**
     * **Validates: Requirements 4.1**
     * 
     * For any sequence of status updates, the loading bubble's outer container height 
     * should remain constant at the reserved height for 3 status items.
     */
    it('should maintain fixed height container for status history', () => {
        fc.assert(fc.property(chatMessageWithStatusArb, (message) => {
            const wrapper = mount(ChatMessage, {
                props: {
                    message,
                    viewMode: 'fullpage'
                }
            })

            const statusContainer = wrapper.find('.status-history-container')

            if (message.status?.statusHistory && message.status.statusHistory.length > 0) {
                expect(statusContainer.exists()).toBe(true)

                // Check that container has fixed height styles
                const containerElement = statusContainer.element as HTMLElement
                const computedStyle = window.getComputedStyle(containerElement)

                // The container should have min-height and max-height set to 48px
                expect(computedStyle.minHeight).toBe('48px')
                expect(computedStyle.maxHeight).toBe('48px')
                expect(computedStyle.overflow).toBe('hidden')
            }
        }), { numRuns: 100 })
    })

    /**
     * **Feature: chatbot-ui-refinement, Property 5: Opacity-Only Transitions**
     * **Validates: Requirements 4.3**
     * 
     * For any status history fade animation, the transition should only modify opacity 
     * values without changing display, visibility, or layout properties.
     */
    it('should use opacity-only transitions without layout changes', () => {
        fc.assert(fc.property(chatMessageWithStatusArb, (message) => {
            const wrapper = mount(ChatMessage, {
                props: {
                    message,
                    viewMode: 'fullpage'
                }
            })

            const statusItems = wrapper.findAll('.status-history-item')

            statusItems.forEach((item, idx) => {
                const element = item.element as HTMLElement
                const computedStyle = window.getComputedStyle(element)

                // Check that transition only affects opacity
                expect(computedStyle.transitionProperty).toContain('opacity')
                expect(computedStyle.transitionDuration).toBe('300ms')

                // Verify opacity values are set correctly based on index
                const expectedOpacity = [0.7, 0.4, 0.2][idx] || 0
                expect(parseFloat(element.style.opacity)).toBe(expectedOpacity)

                // Ensure no layout-affecting properties are being transitioned
                expect(computedStyle.transitionProperty).not.toContain('width')
                expect(computedStyle.transitionProperty).not.toContain('height')
                expect(computedStyle.transitionProperty).not.toContain('display')
                expect(computedStyle.transitionProperty).not.toContain('visibility')
            })
        }), { numRuns: 100 })
    })

    /**
     * **Feature: chatbot-ui-refinement, Property 6: Text Truncation Consistency**
     * **Validates: Requirements 4.4**
     * 
     * For any status message exceeding the maximum width, the text should be truncated 
     * with ellipsis without changing the container width.
     */
    it('should truncate text consistently without changing container width', () => {
        // Generate messages with very long status text to test truncation
        const longTextMessageArb = fc.record({
            id: fc.string(),
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string(),
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }),
            status: fc.record({
                status: fc.constantFrom('pending', 'streaming'),
                statusHistory: fc.array(
                    fc.record({
                        text: fc.string({ minLength: 200, maxLength: 500 }), // Very long text
                        timestamp: fc.integer({ min: 1000000000, max: 9999999999 })
                    }),
                    { minLength: 1, maxLength: 5 }
                )
            })
        }) as fc.Arbitrary<ChatMessageType & { status: { status: 'pending' | 'streaming', statusHistory: Array<{ text: string, timestamp: number }> } }>

        fc.assert(fc.property(longTextMessageArb, (message) => {
            const wrapper = mount(ChatMessage, {
                props: {
                    message,
                    viewMode: 'fullpage'
                }
            })

            const statusItems = wrapper.findAll('.status-history-item')

            statusItems.forEach((item) => {
                const element = item.element as HTMLElement
                const computedStyle = window.getComputedStyle(element)

                // Check that text-overflow is set to ellipsis
                expect(computedStyle.textOverflow).toBe('ellipsis')
                expect(computedStyle.whiteSpace).toBe('nowrap')
                expect(computedStyle.overflow).toBe('hidden')

                // Verify fixed dimensions
                expect(computedStyle.height).toBe('14px')
                expect(computedStyle.lineHeight).toBe('14px')
                expect(computedStyle.fontSize).toBe('11px')

                // The element should have a consistent width regardless of text length
                const width = element.getBoundingClientRect().width
                expect(width).toBeGreaterThan(0)
            })
        }), { numRuns: 100 })
    })

    /**
     * Test that status history display always shows exactly 3 items (padded with empty items)
     */
    it('should always display exactly 3 status history items', () => {
        fc.assert(fc.property(chatMessageWithStatusArb, (message) => {
            const wrapper = mount(ChatMessage, {
                props: {
                    message,
                    viewMode: 'fullpage'
                }
            })

            const statusItems = wrapper.findAll('.status-history-item')

            if (message.status?.statusHistory && message.status.statusHistory.length > 0) {
                // Should always render exactly 3 items (padded if necessary)
                expect(statusItems.length).toBe(3)

                // Check that empty items have empty text
                const actualHistoryLength = message.status.statusHistory.length
                if (actualHistoryLength < 3) {
                    const emptyItemsCount = 3 - Math.min(actualHistoryLength, 3)
                    const lastItems = statusItems.slice(-emptyItemsCount)

                    lastItems.forEach(item => {
                        expect(item.text()).toBe('')
                    })
                }
            }
        }), { numRuns: 100 })
    })
})