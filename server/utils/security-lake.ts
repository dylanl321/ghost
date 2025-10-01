/**
 * Security Lake V2 - Single Export Point
 * This file provides a clean export interface for all Security Lake utilities
 * 
 * Note: Uses consolidated implementation to avoid duplicate import warnings
 */

// Re-export everything from consolidated implementation
export * from './security-lake-consolidated'

// Provide default export for convenience
export { executeStoredQuery as default } from './security-lake-consolidated'