/** Schlanker Fetch-Wrapper mit Timeout, Abbruch und einheitlichen Fehlern. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = undefined,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'PUT' | 'POST'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
  keepalive?: boolean
}

function messageFor(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const e = (body as { error: unknown }).error
    if (typeof e === 'string' && e !== '') return e
  }
  if (status === 401) return 'Anmeldung erforderlich. Seite neu laden.'
  return `Anfrage fehlgeschlagen (${status}).`
}

/**
 * Pfade sind relativ zur Seite (`api/...`), damit die App unter
 * /promptgenerator/ und direkt unter / gleich funktioniert.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const signals: AbortSignal[] = [AbortSignal.timeout(options.timeoutMs ?? 15_000)]
  if (options.signal) signals.push(options.signal)

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.any(signals),
      keepalive: options.keepalive,
      credentials: 'same-origin',
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'TimeoutError')
      throw new ApiError(0, 'Zeitüberschreitung – der Server antwortet nicht.')
    if (name === 'AbortError') throw new ApiError(0, 'Abgebrochen.')
    throw new ApiError(0, 'Keine Verbindung zum Server.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!response.ok) throw new ApiError(response.status, messageFor(response.status, body), body)
  return body as T
}
