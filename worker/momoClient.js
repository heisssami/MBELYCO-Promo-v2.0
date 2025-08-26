export async function getAccessToken({ baseUrl, apiUser, apiKey, subscriptionKey }) {
  const url = `${baseUrl.replace(/\/$/, '')}/disbursement/token/`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      Authorization: 'Basic ' + Buffer.from(`${apiUser}:${apiKey}`).toString('base64'),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MoMo token error ${res.status} ${text}`)
  }
  const json = await res.json()
  return json && json.access_token
}

export async function transfer({ baseUrl, subscriptionKey, targetEnv, token, referenceId, amount, currency, payeeMsisdn, externalId, payerMessage = '', payeeNote = '' }) {
  const url = `${baseUrl.replace(/\/$/, '')}/disbursement/v1_0/transfer`
  const body = {
    amount,
    currency,
    externalId,
    payee: { partyIdType: 'MSISDN', partyId: payeeMsisdn },
    payerMessage,
    payeeNote,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': targetEnv,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.status !== 202) {
    const text = await res.text().catch(() => '')
    throw new Error(`MoMo transfer error ${res.status} ${text}`)
  }
}
