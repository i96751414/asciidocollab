import { UserId } from '../../src/value-objects/ids/user-id';
import { ProjectId } from '../../src/value-objects/ids/project-id';
import { FileNodeId } from '../../src/value-objects/ids/file-node-id';
import { DocumentId } from '../../src/value-objects/ids/document-id';
import { GitRepositoryId } from '../../src/value-objects/ids/git-repository-id';
import { TemplateId } from '../../src/value-objects/ids/template-id';
import { AuditLogId } from '../../src/value-objects/ids/audit-log-id';
import { ContentId } from '../../src/value-objects/ids/content-id';
import { YjsStateId } from '../../src/value-objects/ids/yjs-state-id';
import { Email } from '../../src/value-objects/identity/email';
import { FilePath } from '../../src/value-objects/files/file-path';
import { FileName } from '../../src/value-objects/files/file-name';
import { ProjectName } from '../../src/value-objects/project/project-name';
import { Role } from '../../src/value-objects/identity/role';
import { GitProvider } from '../../src/value-objects/project/git-provider';
import { MimeType } from '../../src/value-objects/files/mime-type';
import { FileNodeType } from '../../src/value-objects/files/file-node-type';
import { TemplateCategory } from '../../src/value-objects/project/template-category';
import { ValidationError } from '../../src/errors/common/validation-error';

describe('Value Objects', () => {
  describe('UUID-based VOs', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const invalidUuid = 'not-a-uuid';

    const uuidVos: { name: string; Class: { create: (v: string) => unknown } }[] = [
      { name: 'UserId', Class: UserId },
      { name: 'ProjectId', Class: ProjectId },
      { name: 'FileNodeId', Class: FileNodeId },
      { name: 'DocumentId', Class: DocumentId },
      { name: 'GitRepositoryId', Class: GitRepositoryId },
      { name: 'TemplateId', Class: TemplateId },
      { name: 'AuditLogId', Class: AuditLogId },
      { name: 'ContentId', Class: ContentId },
      { name: 'YjsStateId', Class: YjsStateId },
    ];

    test.each(uuidVos)('$name accepts valid UUID', ({ Class }) => {
      const vo = Class.create(validUuid);
      expect((vo as { value: string }).value).toBe(validUuid);
    });

    test.each(uuidVos)('$name rejects invalid UUID', ({ Class }) => {
      expect(() => Class.create(invalidUuid)).toThrow();
    });

    test.each(uuidVos)('$name implements equals()', ({ Class }) => {
      const a = Class.create(validUuid);
      const b = Class.create(validUuid);
      const c = Class.create('550e8400-e29b-41d4-a716-446655440001');
      expect((a as { equals: (o: unknown) => boolean }).equals(b)).toBe(true);
      expect((a as { equals: (o: unknown) => boolean }).equals(c)).toBe(false);
    });
  });

  describe('Email', () => {
    test('accepts valid email', () => {
      const email = Email.create('user@example.com');
      expect(email.value).toBe('user@example.com');
    });

    test('normalizes to lowercase', () => {
      const email = Email.create('User@Example.COM');
      expect(email.value).toBe('user@example.com');
    });

    test('rejects invalid email', () => {
      expect(() => Email.create('not-an-email')).toThrow();
      expect(() => Email.create('')).toThrow();
      expect(() => Email.create('@example.com')).toThrow();
    });

    test('implements equals()', () => {
      const a = Email.create('user@example.com');
      const b = Email.create('USER@EXAMPLE.COM');
      const c = Email.create('other@example.com');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('FilePath', () => {
    test('accepts valid absolute path', () => {
      const path = FilePath.create('/docs/file.adoc');
      expect(path.value).toBe('/docs/file.adoc');
    });

    test('rejects path without leading slash', () => {
      expect(() => FilePath.create('docs/file.adoc')).toThrow();
    });

    test('rejects path with traversal', () => {
      expect(() => FilePath.create('/docs/../file.adoc')).toThrow();
      expect(() => FilePath.create('/docs/./file.adoc')).toThrow();
    });

    test('accepts paths with spaces in file name', () => {
      const path = FilePath.create('/my document.adoc');
      expect(path.value).toBe('/my document.adoc');
    });

    test('accepts paths with spaces in folder name', () => {
      const path = FilePath.create('/my folder/document.adoc');
      expect(path.value).toBe('/my folder/document.adoc');
    });

    test('rejects path with invalid characters', () => {
      expect(() => FilePath.create('/docs/file?.adoc')).toThrow(ValidationError);
      expect(() => FilePath.create('/docs/file#.adoc')).toThrow(ValidationError);
    });

    test('implements equals()', () => {
      const a = FilePath.create('/docs/file.adoc');
      const b = FilePath.create('/docs/file.adoc');
      const c = FilePath.create('/other/file.adoc');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('FileName', () => {
    test('accepts a plain file name', () => {
      expect(FileName.create('document.adoc').value).toBe('document.adoc');
    });

    test('accepts a name with spaces', () => {
      expect(FileName.create('my document.adoc').value).toBe('my document.adoc');
    });

    test('accepts a folder name with spaces', () => {
      expect(FileName.create('my folder').value).toBe('my folder');
    });

    test('rejects empty string', () => {
      expect(() => FileName.create('')).toThrow(ValidationError);
    });

    test('rejects whitespace-only name', () => {
      expect(() => FileName.create('   ')).toThrow(ValidationError);
    });

    test('rejects name with leading whitespace', () => {
      expect(() => FileName.create(' doc.adoc')).toThrow(ValidationError);
    });

    test('rejects name with trailing whitespace', () => {
      expect(() => FileName.create('doc.adoc ')).toThrow(ValidationError);
    });

    test('rejects "."', () => {
      expect(() => FileName.create('.')).toThrow(ValidationError);
    });

    test('rejects ".."', () => {
      expect(() => FileName.create('..')).toThrow(ValidationError);
    });

    test('rejects name containing a forward slash', () => {
      expect(() => FileName.create('a/b')).toThrow(ValidationError);
    });

    test('rejects name containing a backslash', () => {
      expect(() => FileName.create(String.raw`a\b`)).toThrow(ValidationError);
    });

    test('rejects name containing a null byte', () => {
      expect(() => FileName.create('a\u0000b')).toThrow(ValidationError);
    });

    test('rejects name containing a newline', () => {
      expect(() => FileName.create('a\nb')).toThrow(ValidationError);
    });

    test('rejects name containing a carriage return', () => {
      expect(() => FileName.create('a\rb')).toThrow(ValidationError);
    });

    test('rejects Windows reserved name CON', () => {
      expect(() => FileName.create('CON')).toThrow(ValidationError);
    });

    test('rejects Windows reserved name NUL with extension', () => {
      expect(() => FileName.create('NUL.txt')).toThrow(ValidationError);
    });

    test('implements equals()', () => {
      const a = FileName.create('document.adoc');
      const b = FileName.create('document.adoc');
      const c = FileName.create('other.adoc');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(null)).toBe(false);
    });
  });

  describe('ProjectName', () => {
    test('accepts valid name', () => {
      const name = ProjectName.create('My Project');
      expect(name.value).toBe('My Project');
    });

    test('rejects empty name', () => {
      expect(() => ProjectName.create('')).toThrow();
    });

    test('rejects whitespace-only name', () => {
      expect(() => ProjectName.create('   ')).toThrow();
    });

    test('trims leading and trailing whitespace', () => {
      const name = ProjectName.create('  My Project  ');
      expect(name.value).toBe('My Project');
    });

    test('rejects name over 100 characters', () => {
      const longName = 'a'.repeat(101);
      expect(() => ProjectName.create(longName)).toThrow();
    });

    test('accepts name at 100 character limit', () => {
      const exactName = 'a'.repeat(100);
      const name = ProjectName.create(exactName);
      expect(name.value).toBe(exactName);
    });

    test('implements equals()', () => {
      const a = ProjectName.create('My Project');
      const b = ProjectName.create('My Project');
      const c = ProjectName.create('Other Project');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(null)).toBe(false);
    });
  });

  describe('MimeType', () => {
    test('accepts valid mime type', () => {
      const mt = MimeType.create('text/asciidoc');
      expect(mt.value).toBe('text/asciidoc');
    });

    test('rejects invalid mime type', () => {
      expect(() => MimeType.create('')).toThrow();
    });

    test('implements equals()', () => {
      const a = MimeType.create('text/asciidoc');
      const b = MimeType.create('text/asciidoc');
      const c = MimeType.create('image/png');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('TemplateCategory', () => {
    test('accepts valid category', () => {
      const cat = TemplateCategory.create('documentation');
      expect(cat.value).toBe('documentation');
    });

    test('rejects empty category', () => {
      expect(() => TemplateCategory.create('')).toThrow();
    });

    test('rejects category over 50 characters', () => {
      const long = 'a'.repeat(51);
      expect(() => TemplateCategory.create(long)).toThrow();
    });

    test('accepts category at 50 character limit', () => {
      const exact = 'a'.repeat(50);
      const cat = TemplateCategory.create(exact);
      expect(cat.value).toBe(exact);
    });

    test('implements equals()', () => {
      const a = TemplateCategory.create('documentation');
      const b = TemplateCategory.create('documentation');
      const c = TemplateCategory.create('tutorial');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(null)).toBe(false);
    });
  });

  describe('Role', () => {
    test.each(['viewer', 'editor', 'owner'])('creates valid role: %s', (value) => {
      expect(Role.create(value).value).toBe(value);
    });

    test.each(['administrator', 'superuser', ''])('throws for invalid role: %s', (value) => {
      expect(() => Role.create(value)).toThrow(ValidationError);
    });
  });

  describe('GitProvider enum', () => {
    test('accepts valid providers', () => {
      expect(GitProvider.create('github').value).toBe('github');
      expect(GitProvider.create('gitlab').value).toBe('gitlab');
      expect(GitProvider.create('bitbucket').value).toBe('bitbucket');
    });

    test('rejects invalid provider', () => {
      expect(() => GitProvider.create('gitea')).toThrow();
    });

    test('implements equals()', () => {
      const a = GitProvider.create('github');
      const b = GitProvider.create('github');
      const c = GitProvider.create('gitlab');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(null)).toBe(false);
    });
  });

  describe('FileNodeType enum', () => {
    test('accepts valid types', () => {
      expect(FileNodeType.create('file').value).toBe('file');
      expect(FileNodeType.create('folder').value).toBe('folder');
    });

    test('rejects invalid type', () => {
      expect(() => FileNodeType.create('symlink')).toThrow();
    });

    test('implements equals()', () => {
      const file = FileNodeType.create('file');
      const file2 = FileNodeType.create('file');
      const folder = FileNodeType.create('folder');
      expect(file.equals(file2)).toBe(true);
      expect(file.equals(folder)).toBe(false);
      expect(file.equals(null)).toBe(false);
    });
  });
});
