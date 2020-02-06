class OperationCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
  }
}

export class CancellationToken {
  cancelled: boolean = false

  cancel(): void {
    this.cancelled = true
  }

  throwIfCancelled(errClass: new () => Error = OperationCancelledError): void {
    if (this.cancelled) {
      throw new errClass()
    }
  }
}
