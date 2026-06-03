import { PrismaClient } from '@prisma/client';
import {
  UserInvitation,
  UserInvitationId,
  Email,
  UserId,
  UserInvitationRepository,
} from '@asciidocollab/domain';

/** Prisma-backed implementation of the `UserInvitationRepository` interface. */
export class PrismaUserInvitationRepository implements UserInvitationRepository {
  /** Creates a new PrismaUserInvitationRepository. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Upserts the invitation record in the database. */
  async save(invitation: UserInvitation): Promise<void> {
    const data = {
      id: invitation.id.value,
      recipientEmail: invitation.recipientEmail.value,
      invitedByUserId: invitation.invitedByUserId?.value ?? null,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt,
    };
    await this.prisma.userInvitation.upsert({
      where: { id: invitation.id.value },
      create: data,
      update: data,
    });
  }

  /** Finds an invitation by its hashed token value. */
  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const record = await this.prisma.userInvitation.findUnique({ where: { tokenHash } });
    return record ? toDomainInvitation(record) : null;
  }

  /** Finds the first unexpired, unaccepted invitation for the given email address. */
  async findPendingByEmail(email: Email): Promise<UserInvitation | null> {
    const now = new Date();
    const record = await this.prisma.userInvitation.findFirst({
      where: {
        recipientEmail: email.value,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
    });
    return record ? toDomainInvitation(record) : null;
  }

  /** Returns all stored invitation records. */
  async findAll(): Promise<UserInvitation[]> {
    const records = await this.prisma.userInvitation.findMany();
    return records.map(toDomainInvitation);
  }
}

function toDomainInvitation(record: {
  id: string;
  recipientEmail: string;
  invitedByUserId: string | null;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}): UserInvitation {
  return new UserInvitation(
    UserInvitationId.create(record.id),
    Email.create(record.recipientEmail),
    record.invitedByUserId ? UserId.create(record.invitedByUserId) : null,
    record.tokenHash,
    record.expiresAt,
    record.acceptedAt,
    record.createdAt,
  );
}
