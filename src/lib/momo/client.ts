type TokenArgs = {
  baseUrl: string
  apiUser: string
  apiKey: string
  subscriptionKey: string
}

type TransferArgs = {
  baseUrl: string
  subscriptionKey: string
  targetEnv: string
  token: string
  referenceId: string
  amount: string
  currency: string
  payeeMsisdn: string
  externalId: string
  payerMessage?: string
  payeeNote?: string
}

export async function getAccessToken(args: TokenArgs) {
  const res = await fetch(`${args.baseUrl.replace(/\/$/, '')}/disbursement/token/`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': args.subscriptionKey,
      Authorization: 'Basic ' + Buffer.from(`${args.apiUser}:${args.apiKey}`).toString('base64'),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MoMo token error ${res.status} ${text}`)
  }
  const json = (await res.json()) as { access_token: string }
  return json.access_token
}

export async function transfer(args: TransferArgs) {
  const url = `${args.baseUrl.replace(/\/$/, '')}/disbursement/v1_0/transfer`
  const body = {
    amount: args.amount,
    currency: args.currency,
    externalId: args.externalId,
    payee: { partyIdType: 'MSISDN', partyId: args.payeeMsisdn },
    payerMessage: args.payerMessage || '',
    payeeNote: args.payeeNote || '',
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': args.subscriptionKey,
      'X-Reference-Id': args.referenceId,
      'X-Target-Environment': args.targetEnv,
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.status !== 202) {
    const text = await res.text().catch(() => '')
    throw new Error(`MoMo transfer error ${res.status} ${text}`)
  }
}
