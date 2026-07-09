export interface Env {
  fetch_json_kv: KVNamespace
}

export enum Fiats {
  EUR = 'EUR',
  USD = 'USD',
  CHF = 'CHF',
  JPY = 'JPY',
  GBP = 'GBP',
  CNY = 'CNY',
  BRL = 'BRL',
}

export type LivelinePoint = {
  time: number
  value: number
}

export type LivelineData = LivelinePoint[]

export interface KVData {
  data: LivelineData
  when: number
  from: string
}

export enum Periods {
  oneHour = 'oneHour',
  oneDay = 'oneDay',
  oneWeek = 'oneWeek',
  oneMonth = 'oneMonth',
  oneYear = 'oneYear',
  all = 'all',
}
