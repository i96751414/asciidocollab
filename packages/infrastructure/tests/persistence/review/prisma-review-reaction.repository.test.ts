import { randomUUID } from 'crypto';
import {
  ReviewReaction,
  ReviewReactionId,
  ReviewCommentId,
  UserId,
  FileNodeType,
  FilePath,
} from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaReviewReactionRepository } from '../../../src/persistence/review/prisma-review-reaction.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { PrismaFileNodeRepository } from '../../../src/persistence/file-tree/prisma-file-node.repository';
import { PrismaDocumentRepository } from '../../../src/persistence/file-tree/prisma-document.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import {
  createTestUser,
  createTestProject,
  createTestFileNode,
  createTestDocument,
  createTestReviewComment,
} from '../../helpers/test-data';

describe('PrismaReviewReactionRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaReviewReactionRepository;
  let userRepo: PrismaUserRepository;
  let projectRepo: PrismaProjectRepository;
  let fileNodeRepo: PrismaFileNodeRepository;
  let documentRepo: PrismaDocumentRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaReviewReactionRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
    fileNodeRepo = new PrismaFileNodeRepository(client);
    documentRepo = new PrismaDocumentRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.reviewReaction.deleteMany();
    await client.reviewComment.deleteMany();
    await client.document.deleteMany();
    await client.fileNode.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  /** Sets up FK parents and returns a review-comment id, its project, and the reacting user. */
  async function setup(): Promise<{ commentId: ReviewCommentId; userId: UserId }> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await projectRepo.save(project);
    const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), path: FilePath.create('/docs') });
    await fileNodeRepo.save(folder);
    const file = createTestFileNode(project.id, { parentId: folder.id, name: 'doc.adoc', path: FilePath.create('/docs/doc.adoc') });
    await fileNodeRepo.save(file);
    const document = createTestDocument(file.id);
    await documentRepo.save(document);
    const row = await createTestReviewComment(client, {
      projectId: project.id.value,
      documentId: document.id.value,
      authorId: owner.id.value,
    });
    return { commentId: ReviewCommentId.create(row.id), userId: owner.id };
  }

  it('toggles idempotently on the (comment, user, emoji) triple', async () => {
    const { commentId, userId } = await setup();
    const reaction = new ReviewReaction(ReviewReactionId.create(randomUUID()), commentId, userId, '👍');

    await repo.toggle(reaction);
    expect(await repo.listForItems([commentId])).toHaveLength(1);

    // A second toggle on the same triple (even a fresh reaction id) removes it.
    const again = new ReviewReaction(ReviewReactionId.create(randomUUID()), commentId, userId, '👍');
    await repo.toggle(again);
    expect(await repo.listForItems([commentId])).toHaveLength(0);
  });

  it('lists reactions across multiple items', async () => {
    const { commentId, userId } = await setup();
    await repo.toggle(new ReviewReaction(ReviewReactionId.create(randomUUID()), commentId, userId, '👍'));
    await repo.toggle(new ReviewReaction(ReviewReactionId.create(randomUUID()), commentId, userId, '🎉'));

    const found = await repo.listForItems([commentId, ReviewCommentId.create(randomUUID())]);
    expect(found).toHaveLength(2);
    expect(found.every((r) => r.reviewCommentId.value === commentId.value)).toBe(true);
    expect(found.map((r) => r.emoji).toSorted()).toEqual(['🎉', '👍']);
  });
});
