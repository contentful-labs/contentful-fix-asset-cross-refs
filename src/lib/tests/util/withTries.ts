import test from 'ava'

import { withTries } from '../../util'

test('it throws the last error', async t => {
  let lastError
  const error = await t.throwsAsync(
    withTries(3, () => {
      lastError = new Error()
      throw lastError
    }, { interval: 0 })
  )
  t.assert(error === lastError)
})

test('returns its first successful value', async t => {
  let n = 0
  const value = await withTries(10, () => {
    ++n
    if (n === 2) {
      return 'two'
    }
    throw new Error()
  }, { interval: 0 })
  t.is(value, 'two')
})

test('it runs only the specified number of times', async t => {
  let n = 0
  await t.throwsAsync(
    withTries(3, () => {
      ++n
      throw new Error()
    }, { interval: 0 })
  )
  t.is(n, 3)
})
