import { Uuid } from './uuid';

/** Strongly-typed identifier for an EmailChangeToken. */
export class EmailChangeTokenId extends Uuid {
  /** Creates an EmailChangeTokenId from a raw UUID string. */
  static create(value: string): EmailChangeTokenId {
    return new EmailChangeTokenId(value);
  }
}
