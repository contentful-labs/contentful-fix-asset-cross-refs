# fix-asset-cross-refs tool

## Purpose

Contentful previously allowed asset URLs to cross-reference other assets. This
is no longer permissible going forward. All existing spaces have been allowed
to continue cross-referencing assets for a transition period.

This tool exists to automate the task of checking all assets in a space (or
spaces) to ensure that they are not cross-referencing other assets or other
spaces.

## Requirements

Node 10+, please.

## Installation & Basic Setup

### Using `npx`

The easiest way, if you have a relatively modern version of `npm`:

```sh
$ npx github:contentful-labs/contentful-fix-asset-cross-refs --help
```

### Install Globally

You can install this repository from Github:

```sh
$ npm i -g github:contentful-labs/contentful-fix-asset-cross-refs
```

And, assuming global npm binaries are in your path, you should be able to run:

```sh
$ contentful-fix-asset-cross-refs <options>
```


### Clone And Build

You can clone this from source and run `make` to build it, and then execute:

```sh
$ git clone https://github.com/contentful-labs/contentful-fix-asset-cross-refs
$ cd contentful-fix-asset-cross-refs
$ make   # or npm install && npm run build if you don't have make installed
```

Then run:

```sh
$ node dist/bin/fix-asset-cross-refs.js <options>
```

## Usage

Quick start:

```sh
$ npx github:contentful-labs/contentful-fix-asset-cross-refs --access-token <cma-access-token> --all-spaces --all-environments | tee capture-output.json
```

We recommend `tee`ing the output to a file so you can inspect it later. If any
serious errors are encountered during processing, the program will immediately
stop.

**NOTE:** If other users are concurrently modifying your assets, this utility
is likely to fail with a version mismatch. Please run this tool during a quiet
period to prevent any problems.

### Options

The tool accepts a variety of flags:

| Flag | Meaning |
+------+---------+
| `--access-token <token>` | the access token to use (e.g. a CMA access token) |
| `--spaces <space1> <space2> ...` | the list of space ids to process |
| `--all-spaces` | alternately, process all spaces accessible by this access token |
| `--environments <env1> <env2> | the list of environments to process |
| `--all-environments` | alternately, process all environments in the specified spaces |
| `--force-republish` | publishes assets after updating even if they've otherwise drifted from the published version |
| `--dry-run` | if set, won't actually perform any work, will merely pretend |
| `--verbose` or `-v` | increase the logging verbosity (can be used up to two times) |

`--all-spaces` or `--spaces` must be specified, but not both.
`--all-environments` or `--environments` must be specified, but not both.

#### --dry-run

You may wish to ensure the behavior of the tool looks sane before running it
over all of your data. You may do that by running with `--dry-run`. No data
will be modified on the server. For a better look at every operation, you may
increase the verbosity by running with `-v`.

#### --force-publish

**Be careful with this flag.**

This tool will automatically republish assets after modifying them if and only
if that asset has had no other changes. Otherwise, the tool will only update
the draft version of the asset and leave all changes unpublished. If you'd like
to force-republish all assets regardless if other changes are pending, you
can use the `--force-republish` flag.

Assets that have never been published will never be published by this tool.
