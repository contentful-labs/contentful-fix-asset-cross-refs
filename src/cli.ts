import * as yargs from 'yargs'
import pino = require('pino')
import { createClient as createCMAClient } from 'contentful-management'

import { processAssets } from './lib/process-assets'

const yargsInst = yargs
  .help()
  .option('access-token', {
    alias: 't',
    describe: 'cma access token to use',
    required: true,
  })
  .option('spaces', {
    alias: 's',
    describe: 'the space ids to process',
    conflicts: 'all-spaces',
    type: 'array',
  })
  .option('all-spaces', {
    alias: 'S',
    describe: 'process assets in all spaces this token can access',
    conflicts: 'spaces',
    type: 'boolean',
  })
  .option('environments', {
    alias: 'e',
    description: 'the environments to process',
    type: 'array',
    conflicts: 'all-environments'
  })
  .option('all-environments', {
    alias: 'E',
    description: 'process assets in all environments',
    type: 'boolean',
    conflicts: 'environments',
  })
  .option('force-republish', {
    description: 'force-republishes all modified assets, WARNING: even those that had previously unpublished changes',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
    description: 'runs in dry-run mode (no changes will be made)',
    type: 'boolean',
    default: false
  })
  .check(argv => {
    if (!argv.spaces?.length && !argv.allSpaces) {
      throw new Error('Either --all-spaces must be set, or --spaces list must be provided')
    }
    if (!argv.environments?.length && !argv.allEnvironments) {
      throw new Error('Either --all-environments must be set, or --environments list must be provided')
    }
    return true
  })
  .count('verbose')
  .alias('v', 'verbose')
  .strict()

export async function run(argv = yargsInst.argv) {
  let logLevel: pino.Level = 'info'
  if (argv.verbose >= 2)  {
    logLevel = 'trace'
  } else if (argv.verbose === 1) {
    logLevel = 'debug'
  }
  const logger = pino({
    level: logLevel,
  }) // to stderr

  const client = createCMAClient({ accessToken: argv.accessToken as string })

  try {
    await processAssets({
      client,
      spaceIds: argv.spaces as string[] | undefined,
      envIds: argv.environments as string[] | undefined,
      opts: {
        forceRepublish: argv.forceRepublish as boolean,
        dryRun: argv.dryRun as boolean
      },
      logger
    })
  } catch(err) {
    logger.error('Error processing assets', { err })
  }
}
