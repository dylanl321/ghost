// Development authentication bypass composable

export const useDevAuth = () => {
  const config = useRuntimeConfig()
  
  const isDevMode = () => {
    return process.env.NODE_ENV === 'development'
  }
  
  const isBypassEnabled = () => {
    return config.public.authBypass === true
  }
  
  const getMockUser = () => {
    if (!isDevMode() || !isBypassEnabled()) return null
    
    return {
      id: 'dev-user',
      email: 'dev@local',
      name: 'Dev User', 
      given_name: 'Dev',
      family_name: 'User',
      claims: {
        email: 'dev@local',
        given_name: 'Dev',
        family_name: 'User',
        name: 'Dev User',
        sub: 'dev-user'
      },
      accessToken: 'dev-token-123'
    }
  }
  
  return {
    isDevMode,
    isBypassEnabled,
    getMockUser
  }
}