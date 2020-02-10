
interface PaginationOpts {
  skip?: number
  limit?: number
}

interface Collection<T> {
  skip: number
  limit: number
  items: T[]
}

// Here be ( unnecessary, but kind of fun ) dragons:

// All of this typing is to ensure/infer the correct typing through
// `iteratePaginated` so that we don't need to rely on `any` or manually
// specify types anywhere.

type FunctionsOf<T, U extends Function> = { [K in keyof T]: T[K] extends U ? K : never }[keyof T];

export async function * iteratePaginated<T, U extends FunctionsOf<T, (o: PaginationOpts) => Promise<Collection<any>>>> (
  api: T,
  fnName: U,
  opts?: PaginationOpts
): AsyncIterableIterator<T[U] extends (() => Promise<Collection<infer V>>) ? V : never> {
  const limit = opts?.limit
  let skip = opts?.skip ?? 0

  while (true) {
    const result = await api[fnName]({ limit, skip })
    if (result.items.length === 0) {
      break
    }
    yield * result.items
    skip = result.skip + result.items.length
  }
}

export async function withTries<T>(n: number, fn: (attemptNo: number) => Promise<T> | T, { interval = 200 }: { interval?: number } = {}): Promise<T> {
  let i
  for (i = 1; i < n; ++i) {
    try {
      return await fn(i)
    } catch(e) {
      /* noop */
    }
    if (interval > 0) {
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }
  return fn(i)
}

export async function * asyncMap<T, U>(iterable: Iterable<T>, fn: (item: T) => U | Promise<U>): AsyncIterableIterator<U> {
  for (const item of iterable) {
    yield await fn(item)
  }
}

export async function * iterableToAsync<T>(iterable: Iterable<T>): AsyncIterableIterator<T> {
  yield * iterable
}
