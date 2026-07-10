import { isValidResetToken } from './utils'
import { Env, Fiats, KVData, Periods } from './types'
import { getDataForPeriod, periodNeedsUpdate, resetKVStorage, updateDataForPeriod } from './kv'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const respondWith = (data: any | null, code: number) => {
  const responseData = data ? JSON.stringify(data) : null
  return new Response(responseData, {
    status: code,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return respondWith(null, 204)
    }

    // Extract params from request
    const fiat = extractFiatFromRequest(request) // default to USD
    const period = extractPeriodFromRequest(request) // default to oneDay
    const resetToken = await extractResetTokenFromRequest(request) // optional

    let data = await getDataForPeriod(env, period, fiat)

    // Check for reset token and reset KV storage if valid
    try {
      if (resetToken && (await isValidResetToken(resetToken))) {
        await resetKVStorage(env)
        return respondWith({ status: 'KV storage reset successfully' }, 200)
      }
    } catch {
      return respondWith({ error: 'Unable to reset KV storage' }, 500)
    }

    // Fetch or update data based on the period and fiat
    try {
      if (await periodNeedsUpdate(env, period, fiat)) {
        data = await updateDataForPeriod(env, period, fiat)
      }
    } catch {
    } finally {
      const result = data ?? { error: 'No data available' }
      return respondWith(result, 200)
    }
  },
} satisfies ExportedHandler<Env>

const extractPeriodFromRequest = (request: Request): Periods => {
  const url = new URL(request.url)
  const period = url.searchParams.get('period')
  return (period as Periods) ?? Periods.oneDay
}

const extractFiatFromRequest = (request: Request): Fiats => {
  const url = new URL(request.url)
  const fiat = url.searchParams.get('fiat')
  return (fiat?.toUpperCase() as Fiats) ?? Fiats.USD
}

const extractResetTokenFromRequest = async (request: Request): Promise<string | null> => {
  const url = new URL(request.url)
  return url.searchParams.get('reset')
}
