/** Thrown when a simulation or submitted transaction fails on-chain or at the RPC layer. */
export class ArbitraSdkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ArbitraSdkError';
  }
}
