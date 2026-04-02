import type { InjectionKey } from 'vue'

export type ConsultChatApi = ReturnType<
  typeof import('@/composables/useChat').useChat
>

export const CONSULT_CHAT_KEY: InjectionKey<ConsultChatApi> =
  Symbol('consultChat')
