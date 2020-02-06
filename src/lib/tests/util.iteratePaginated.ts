import test from 'ava'

import { iteratePaginated } from '../util'

interface PaginationOpts {
  skip?: number
  limit?: number
}

interface Collection<T> {
  skip: number
  limit: number
  items: T[]
  total?: number
}

const testData = [...Array(201).keys()]
const obj = {
  fetch(opts: PaginationOpts): Promise<Collection<number>> {
    const skip = opts.skip || 0
    const limit = Math.min(opts.limit ?? 50, 50)

    return Promise.resolve({
      skip: skip,
      limit: limit,
      items: testData.slice(skip, skip + limit),
      total: testData.length
    })
  }
}

test('iterates correctly', async t => {
  const data: number[] = []
  for await (const v of iteratePaginated(obj, 'fetch')) {
    data.push(v)
  }
  t.deepEqual(data, testData)
})
