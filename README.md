# fix-asset-cross-refs tool

## Purpose

Contentful previously allowed asset URLs to cross-reference other assets. This
is no longer permissible going forward. All existing spaces have been allowed
to continue cross-referencing assets for a transition period.

This tool exists to automate the task of updating all assets in a space (or
spaces) to ensure that they are not cross-referencing other assets or other
spaces.

## Requirements

Node 10+, please. You can check your version by running:

```sh
$ node --version
v12.14.1
```

If you have an older Node version, you will need to
[install a later version](https://nodejs.org/en/).

## Installation & Basic Setup

### Option 1: Install Globally

You can install this repository from Github:

```sh
$ npm i -g github:contentful-labs/contentful-fix-asset-cross-refs
```

This will download and build (compile from TypeScript to Javascript) the
project.  Assuming global npm binaries are in your path, you should then be
able to run:

```sh
$ contentful-fix-asset-cross-refs <options>
```


### Option 2: Clone And Build

You can clone this from source and run `make` to build it, and then execute:

```sh
$ git clone https://github.com/contentful-labs/contentful-fix-asset-cross-refs
$ cd contentful-fix-asset-cross-refs
$ make   # or npm install && npm run build if you don't have make installed
```

Then run:

```sh
$ bin/fix-asset-cross-refs <options>
```

### Option 3: Using `npx`

The easiest way if you have a relatively modern version of `npm`, but not so
fast (because npx doesn't leave a copy installed) if you'll call this multiple
times:

```sh
$ npx github:contentful-labs/contentful-fix-asset-cross-refs <options>
```

## Usage

Quick start:

First, fetch an existing CMA access token, or create a new one. (You can go to
[the Contentful web app](https://app.contentful.com) and go to `Settings` ->
`API Keys` -> `Content management tokens` to create a new token.)

Then, run the tool:

```sh
$ contentful-fix-asset-cross-refs \
    --access-token <cma-access-token> \
    --all-spaces \
    --all-environments \
    --dry-run `# Remove after verifying output looks sane` \
    -v        `# enable verbose output if you like` \
    | tee capture-output.json
```

We **strongly recommend** redirecting or `tee`ing the tool output to a file so
you can inspect it later. If any serious errors (failure to update, failure to
process an asset, or failure to publish) are encountered during processing, the
program will immediately stop.

Once you are satisfied that the operations look sane, you can remove the
`--dry-run` flag.

**NOTE:** If other users are concurrently modifying your assets, this utility
is likely to fail with a version mismatch. Please run this tool during a quiet
period to prevent any problems; it does not have retry logic for version
mismatches.

### Options

The tool accepts a variety of flags:

| Flag | Meaning |
| ---- | ------- |
| `--access-token <token>` | the access token to use (e.g. a CMA access token) |
| `--spaces <space1> <space2> ...` | the list of space ids to process |
| `--all-spaces` | alternately, process all spaces accessible by this access token |
| `--environments <env1> <env2> ...` | the list of environments to process |
| `--all-environments` | alternately, process all environments in the specified spaces |
| `--force-republish` | publishes assets after updating even if they've otherwise drifted from the published version |
| `--dry-run` | if set, won't actually perform any work, will merely pretend |
| `--verbose` or `-v` | increase the logging verbosity (can be used up to two times) |

Additionally,
* `--all-spaces` or `--spaces` must be specified, but not both
* `--all-environments` or `--environments` must be specified, but not both

#### `--dry-run`

You may wish to ensure the behavior of the tool looks sane before running it
over all of your data. You may do that by running with `--dry-run`. No data
will be modified on the server, but the program will output the steps it
would perform.


#### `--verbose` (or `-v`)

For a detailed list of every operation, you may increase the verbosity by
running with `-v` or `-vv`.

#### `--force-republish`

**Be careful with this flag.**

This tool will automatically republish assets after modifying them *if and only
if* that asset has no other pending changes than fixing the asset
cross-references. Otherwise, those assets are fixed, but left in a draft
state.

If you'd like to force-republish all assets regardless of whether other changes
are pending, you can use the `--force-republish` flag. **This might publish
unintended changes, so be careful.**

Assets that have never been published will never be published by this tool.

### Prettier Output

This tool logs using `pino`, which means you'll see log output as JSON. This
is nice for documenting each step in the process, especially if you're running
in verbose mode. If you'd like a bit prettier output, you can pipe the output
to `pino-pretty`:

```sh
$ npm i -g pino-pretty
... installs pino-pretty globally ...
$ contentful-fix-asset-cross-refs <options> | pino-pretty
... prettier log output! ...
```
