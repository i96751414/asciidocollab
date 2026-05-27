import { ValidationError } from '../errors/validation-error';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export abstract class Uuid {
  protected constructor(protected readonly _value: string) {}

  get value(): string {
    return this._value;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof Uuid &&
      other.constructor === this.constructor &&
      this._value === other._value
    );
  }
}

export function validateUuid(value: string, name: string): void {
  if (!UUID_V4_REGEX.test(value)) {
    throw new ValidationError(`Invalid ${name} UUID v4 format: ${value}`);
  }
}
