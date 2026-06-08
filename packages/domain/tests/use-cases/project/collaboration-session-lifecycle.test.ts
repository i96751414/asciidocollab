import { OpenCollaborationSessionUseCase } from '../../../src/use-cases/project/open-collaboration-session';
import { CloseCollaborationSessionUseCase } from '../../../src/use-cases/project/close-collaboration-session';
import { InMemoryCollaborationSessionRepository } from '../../ports/project/in-memory-collaboration-session-repository';
import { ProjectId } from '../../../src/value-objects/project-id';
import { DocumentId } from '../../../src/value-objects/document-id';

describe('CollaborationSession use cases', () => {
  let repo: InMemoryCollaborationSessionRepository;
  let openUseCase: OpenCollaborationSessionUseCase;
  let closeUseCase: CloseCollaborationSessionUseCase;
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
  const documentId = DocumentId.create('550e8400-e29b-41d4-a716-446655440002');

  beforeEach(() => {
    repo = new InMemoryCollaborationSessionRepository();
    openUseCase = new OpenCollaborationSessionUseCase();
    closeUseCase = new CloseCollaborationSessionUseCase();
  });

  describe('OpenCollaborationSessionUseCase', () => {
    test('records session and isActive returns true', async () => {
      expect(await repo.isActive(projectId, documentId)).toBe(false);
      const result = await openUseCase.execute(projectId, documentId, repo);
      expect(result.success).toBe(true);
      expect(await repo.isActive(projectId, documentId)).toBe(true);
    });

    test('returns Result.ok(void) on success', async () => {
      const result = await openUseCase.execute(projectId, documentId, repo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeUndefined();
      }
    });

    test('propagates repository errors as Result.error', async () => {
      const failingRepo = {
        ...repo,
        open: jest.fn().mockRejectedValue(new Error('db error')),
        isActive: jest.fn().mockResolvedValue(false),
        close: jest.fn(),
        closeAllForProject: jest.fn(),
        closeAll: jest.fn(),
      };
      const result = await openUseCase.execute(projectId, documentId, failingRepo);
      expect(result.success).toBe(false);
    });
  });

  describe('CloseCollaborationSessionUseCase', () => {
    test('removes record and isActive returns false', async () => {
      await repo.open(projectId, documentId);
      expect(await repo.isActive(projectId, documentId)).toBe(true);
      const result = await closeUseCase.execute(projectId, documentId, repo);
      expect(result.success).toBe(true);
      expect(await repo.isActive(projectId, documentId)).toBe(false);
    });

    test('returns Result.ok(void) on success', async () => {
      const result = await closeUseCase.execute(projectId, documentId, repo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeUndefined();
      }
    });

    test('propagates repository errors as Result.error', async () => {
      const failingRepo = {
        ...repo,
        close: jest.fn().mockRejectedValue(new Error('db error')),
        isActive: jest.fn().mockResolvedValue(true),
        open: jest.fn(),
        closeAllForProject: jest.fn(),
        closeAll: jest.fn(),
      };
      const result = await closeUseCase.execute(projectId, documentId, failingRepo);
      expect(result.success).toBe(false);
    });
  });
});
