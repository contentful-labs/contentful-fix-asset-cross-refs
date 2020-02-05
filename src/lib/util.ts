
interface PaginationOpts {
  skip?: number
  limit?: number
}

interface Collection<T> {
  skip: number
  limit: number
  items: T[]
}

type FunctionsOf<T, U extends Function> = { [K in keyof T]: T[K] extends U ? K : never }[keyof T];

export async function * iteratePaginated<T, U extends FunctionsOf<T, (o: PaginationOpts) => Promise<Collection<any>>>>
  (api: T, fnName: U, opts?: PaginationOpts): AsyncIterableIterator<T[U] extends (() => Promise<Collection<infer V>>) ? V : never> {
  const limit = opts?.limit ?? 1000
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

export async function arrayFromAsyncIter<T>(iter: AsyncIterableIterator<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of iter) {
    result.push(item)
  }
  return result
}

export async function withTries<T>(n: number, fn: () => Promise<T> | T, { interval = 200 }: { interval?: number } = {}): Promise<T> {
  while (true) {
    if (n <= 0) {
      return fn()
    } else {
      try {
        return await fn()
      } catch(e) {
        /* noop */
      }
      --n
      if (interval > 0) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }
  }
}

export async function * asyncMap<T, U>(iterable: Iterable<T>, fn: (item: T) => U | Promise<U>): AsyncIterableIterator<U> {
  for (const item of iterable) {
    yield await fn(item)
  }
}

export async function * iterableToAsync<T>(iterable: Iterable<T>): AsyncIterableIterator<T> {
  yield * iterable
}
