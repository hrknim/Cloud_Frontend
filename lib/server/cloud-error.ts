export class CloudError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
