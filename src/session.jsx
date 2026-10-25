import { createContext, useContext } from 'react'

export const SessionContext = createContext(null)
export function useIsCrew() { return useContext(SessionContext)?.role === 'crew' }
