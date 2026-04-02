import axios, { type AxiosError } from 'axios'

import type { ApiResult } from '@/types/api'

import {
  ApiBusinessError,
  MSG_NETWORK,
  MSG_SERVER,
  MSG_TIMEOUT,
  isApiResultBody,
} from './errors'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data
    if (isApiResultBody(body) && body.code !== 0) {
      return Promise.reject(
        new ApiBusinessError(
          body.message || '请求失败',
          body.code,
          response.status
        )
      )
    }
    return response
  },
  (error: AxiosError<ApiResult<unknown>>) => {
    const status = error.response?.status
    const data = error.response?.data
    if (isApiResultBody(data)) {
      return Promise.reject(
        new ApiBusinessError(
          data.message || '请求失败',
          data.code ?? status ?? -1,
          status
        )
      )
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiBusinessError(MSG_TIMEOUT, -1, status))
    }
    if (!error.response) {
      return Promise.reject(new ApiBusinessError(MSG_NETWORK, -1, undefined))
    }
    const st = status ?? 0
    const msg = st >= 500 ? MSG_SERVER : `请求失败（${st}）`
    return Promise.reject(new ApiBusinessError(msg, st, status))
  }
)
