import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'
const TOKEN_KEY = 'jobapp.session.token'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
})

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

export function storeToken(token) {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

export function getCookieValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export function getCsrfToken() {
  return getCookieValue('jobapp_csrf')
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
  }
  return config
})
