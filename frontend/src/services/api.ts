import axios, { AxiosInstance } from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // gửi cookie kèm request (cho Google OAuth)
  headers: {
    'Content-Type': 'application/json',
  },
})

// Tự gắn Bearer token từ localStorage (cho login email/password)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
}

export interface GeneratePayload {
  purpose: string
  audience: string
  style: string
  primary_color: string
  slide_count: number
  primary_layout: string
  content: string
  language: string
  pdf_file?: File
}

export const authAPI = {
  register: (data: RegisterPayload) => api.post('/auth/register', data),
  login: (data: LoginPayload) => api.post('/auth/login', data),
  verifyEmail: (token: string) => api.get(`/auth/verify-email?token=${token}`),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  googleLoginUrl: () => `${API_URL}/auth/google`,
}

export const promptAPI = {
  generate: async (data: GeneratePayload) => {
    const formData = new FormData()
    formData.append('purpose', data.purpose)
    formData.append('audience', data.audience)
    formData.append('style', data.style)
    formData.append('primary_color', data.primary_color)
    formData.append('slide_count', String(data.slide_count))
    formData.append('primary_layout', data.primary_layout)
    formData.append('content', data.content)
    formData.append('language', data.language)
    if (data.pdf_file) {
      formData.append('pdf_file', data.pdf_file)
    }
    return api.post('/generate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getJobStatus: (jobId: string) => api.get(`/jobs/${jobId}`),
}

export default api