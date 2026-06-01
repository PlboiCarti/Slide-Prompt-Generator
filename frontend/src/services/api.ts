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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
    }
    return Promise.reject(error)
  }
)

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
}

export interface DesignDescription {
  tone: string
  font: string
  key_message_rule: string
  density: string
  visual: string
}

export interface DescribePayload {
  purpose: string
  audience: string
  style: string
  primary_layout: string
  primary_color: string
  language: string
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
  files?: File[]
  description?: DesignDescription  // từ Phase 1, user đã chỉnh
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DRAFT'

export interface JobResult {
  full_master_prompt?: string
  total_slides?: number
  [key: string]: unknown
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  result: JobResult | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface HistoryItem {
  id: string
  status: JobStatus
  created_at: string
  updated_at: string
  purpose: string | null
  audience: string | null
  has_result: boolean
  error_message: string | null
}

export interface BinItem {
  id: string
  status: JobStatus
  purpose: string | null
  audience: string | null
  has_result: boolean
  error_message: string | null
  deleted_at: string
  created_at: string
}

export interface SaveDraftPayload {
  purpose: string
  audience: string
  style: string
  primary_color: string
  slide_count: number
  primary_layout: string
  content: string
  language: string
  description?: DesignDescription | null
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
  // Phase 1 — sync, trả về DesignDescription ngay
  generateDescription: (data: DescribePayload) =>
    api.post<DesignDescription>('/generate-description', data),

  // Phase 2 — async, trả job_id để poll
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
    if (data.files && data.files.length > 0) {
      data.files.forEach(file => {
        formData.append('files', file)
      })
    }
    // 5 field description riêng lẻ (tránh lỗi JSON string trong multipart)
    if (data.description) {
      formData.append('desc_tone', data.description.tone)
      formData.append('desc_font', data.description.font)
      formData.append('desc_key_message_rule', data.description.key_message_rule)
      formData.append('desc_density', data.description.density)
      formData.append('desc_visual', data.description.visual)
    }
    return api.post('/generate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getJobStatus: (jobId: string) => api.get<JobStatusResponse>(`/jobs/${jobId}`),
}

export const historyAPI = {
  getHistory: (statusFilter?: string) =>
    api.get<HistoryItem[]>('/history', {
      params: statusFilter ? { status: statusFilter } : undefined,
    }),
  softDelete: (id: string) => api.delete(`/history/${id}`),
  getJobResult: (id: string) => api.get<JobStatusResponse>(`/jobs/${id}`),
}

export const draftAPI = {
  saveDraft: (data: SaveDraftPayload) => api.post<HistoryItem>('/drafts', data),
  updateDraft: (id: string, data: SaveDraftPayload) => api.put<HistoryItem>(`/drafts/${id}`, data),
  getDraft: (id: string) => api.get<SaveDraftPayload>(`/drafts/${id}`),
}

export const binAPI = {
  getBin: () => api.get<BinItem[]>('/bin'),
  restore: (id: string) => api.post<HistoryItem>(`/bin/${id}/restore`),
  hardDelete: (id: string) => api.delete(`/bin/${id}`),
  emptyBin: () => api.delete('/bin'),
}

export default api
