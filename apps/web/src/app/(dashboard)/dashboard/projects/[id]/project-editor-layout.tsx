'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileTree } from '@/components/file-tree/file-tree';
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { useFileSelection } from '@/hooks/use-file-selection';

import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';

interface ContentAreaProperties {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  canEdit: boolean;
  projectId: string;
}

function ContentArea({ selectedFile, contentState, canEdit, projectId }: ContentAreaProperties) {
  if (selectedFile === null) {
    return <p className="text-muted-foreground text-sm p-4">Select a file from the tree to view its content.</p>;
  }
  if (contentState.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (contentState.isBinary) {
    return <p className="text-muted-foreground text-sm p-4">Preview not available for binary files.</p>;
  }
  if (contentState.error) {
    return <p className="text-destructive text-sm p-4">{contentState.error}</p>;
  }
  return (
    <AsciiDocEditor
      key={selectedFile.nodeId}
      content={contentState.content ?? ''}
      canEdit={canEdit}
      projectId={projectId}
      fileNodeId={selectedFile.nodeId}
      initialEtag={contentState.etag}
    />
  );
}

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  isOwner: boolean;
  canEdit: boolean;
}

/** Three-panel editor layout: collapsible file tree, CM6 editor, AsciiDoc preview. */
export function ProjectEditorLayout({
  projectId,
  projectName,
  projectDescription,
  isOwner,
  canEdit,
}: ProjectEditorLayoutProperties) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { selectedFile, contentState, selectFile } = useFileSelection(projectId);

  useEffect(() => {
    const stored = sessionStorage.getItem('asciidoc-preview-open');
    if (stored === 'true') setPreviewOpen(true);
  }, []);

  const togglePreview = () => {
    setPreviewOpen((previous) => {
      const next = !previous;
      sessionStorage.setItem('asciidoc-preview-open', String(next));
      return next;
    });
  };

  const showPreview = selectedFile !== null && isAsciiDocFile(selectedFile.nodeName);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 p-3 border-b shrink-0">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to projects
        </Link>
        <span className="font-semibold text-sm">{projectName}</span>
        {projectDescription && (
          <span className="text-xs text-muted-foreground">{projectDescription}</span>
        )}
        {isOwner && (
          <>
            <Link
              href={`/dashboard/projects/${projectId}/settings`}
              className="text-sm text-muted-foreground hover:text-foreground ml-auto"
            >
              Settings
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/members`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Members
            </Link>
          </>
        )}
      </div>

      {/* Body: sidebar + content + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree panel */}
        <div
          data-testid="file-tree-panel"
          className={sidebarOpen ? 'w-64 shrink-0 border-r overflow-y-auto' : 'hidden'}
        >
          <FileTree
            projectId={projectId}
            isOwner={isOwner}
            onSelectFile={(nodeId, nodeName, nodePath, nodeType) => selectFile(nodeId, nodeName, nodePath, nodeType)}
            selectedNodeId={selectedFile?.nodeId ?? null}
            onCollapse={() => setSidebarOpen(false)}
          />
        </div>

        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="expand sidebar"
            className="w-6 h-full shrink-0 border-r rounded-none"
            onClick={() => setSidebarOpen(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Content panel */}
        <div data-testid="content-panel" className="flex-1 overflow-hidden flex flex-col p-4">
          <ContentArea
            selectedFile={selectedFile}
            contentState={contentState}
            canEdit={canEdit}
            projectId={projectId}
          />
        </div>

        {/* Preview panel — full when open, narrow strip when collapsed */}
        {showPreview && previewOpen && (
          <div data-testid="preview-panel" className="w-80 shrink-0 border-l overflow-hidden">
            <AsciiDocPreview
              content={contentState.content ?? ''}
              isOpen={previewOpen}
              onToggle={togglePreview}
            />
          </div>
        )}
        {showPreview && !previewOpen && (
          <Button
            data-testid="preview-panel"
            variant="ghost"
            size="icon"
            aria-label="expand preview"
            className="w-6 h-full shrink-0 border-l rounded-none"
            onClick={togglePreview}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
