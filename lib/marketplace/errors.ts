export class MarketplaceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketplaceValidationError'
  }
}

export class MarketplaceNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketplaceNotFoundError'
  }
}
