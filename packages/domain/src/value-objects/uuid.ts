const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export abstract class Uuid {
  protected constructor(protected readonly _value: string) {}

  get value(): string {
    return this._value;
  }

  equals(other: unknown): boolean {
    return (
      other != null &&
      (other as object).constructor === this.constructor &&
      this._value === (other as Uuid)._value
    );
  }
}

export function validateUuid(value: string, name: string): void {
  if (!UUID_V4_REGEX.test(value)) {
    throw new Error(`Invalid ${name} UUID v4 format: ${value}`);
  }
}
