export const logActivity = async (message: string) => {
  // Only run on client-side to avoid SSR issues
  if (typeof window === 'undefined') {
    console.warn('logToBackend: Skipping server-side logging to avoid URL parsing errors')
    return
  }
  
  try {
    const response = await fetch('/api/logging/activity-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    
    if (!response.ok) {
      console.warn('Failed to log to backend:', response.status, response.statusText)
    }
  } catch (error) {
    console.error('Error logging message:', error);
  }
};